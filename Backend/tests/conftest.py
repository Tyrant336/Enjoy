"""pytest harness — the real app against the real Postgres (AGENTS.md §6.3).

NEVER SQLite: dialect differences are where silent failures breed. Tests run
against a dedicated database on the SAME local Postgres server as development
(hackathon pragmatism — monitor-approved, recorded in docs/sessions/014).
Per pytest PROCESS the database is ``harbour_test_<pid>``: dropped, recreated,
and migrated with ``alembic upgrade head`` at session start, and dropped
again at session end. The per-process suffix fixes the documented
shared-test-DB hazard (session 018: two simultaneous pytest runs destroy each
other's shared ``harbour_test`` — observed live in session 026 when a zombie
pytest process from a timed-out run kept recreating it mid-suite). Tests always run against the real, current Alembic-owned
schema — never ``metadata.create_all`` (AGENTS.md §5.2).

How it works: the session fixture repoints ``DATABASE_URL`` to the per-process
test database for the whole session *before* the app is imported, then
yields. Every test that touches the app uses the fixtures below:

- ``client`` — httpx.AsyncClient through the real ASGI app (no server).
  NOT usable for SSE: ASGITransport awaits the ASGI app to completion, so an
  infinite event stream never returns (root-caused in docs/sessions/015).
- ``live_server`` / ``live_client`` — a REAL uvicorn server (ephemeral port)
  per test, for streaming endpoints (`GET /api/events`). SSE over real HTTP
  behaves exactly as in production.
- ``db_session`` — direct async session on the test database.
- ``seeded_user_id`` — runs ``scripts/seed.py`` once per session against the
  test database and returns the fixture user's id (``user-seed-01``).
"""

import asyncio
import json
import os
from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

TEST_DB_NAME = f"harbour_test_{os.getpid()}"  # per-process — see module docstring
_BACKEND_DIR = Path(__file__).resolve().parents[1]


async def _recreate_test_database(admin_url: str) -> None:
    """Drop + recreate the test database (autocommit; cannot run in a txn)."""
    engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)'))
        await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    await engine.dispose()


async def _drop_test_database(admin_url: str) -> None:
    """Drop this process's test database (autocommit; cannot run in a txn)."""
    engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(
            text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)')
        )
    await engine.dispose()


def _run_alembic_upgrade_head() -> None:
    """Apply the real migrations to the test database (AGENTS.md §5.2)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def _test_database() -> Iterator[str]:
    """Session-scoped: fresh, migrated per-process test DB; returns its URL.

    Dropped on teardown so concurrent suites leave no orphans behind."""
    from sqlalchemy.engine import make_url

    from app.core.config import get_settings

    dev_url = get_settings().database_url
    # render_as_string: str(URL) masks the password as *** (SQLAlchemy default).
    test_url = make_url(dev_url).set(database=TEST_DB_NAME).render_as_string(
        hide_password=False
    )

    asyncio.run(_recreate_test_database(dev_url))

    # Repoint BEFORE alembic env.py and the app read settings (both use the
    # one config loader — one way, AGENTS.md §3).
    os.environ["DATABASE_URL"] = test_url
    get_settings.cache_clear()

    _run_alembic_upgrade_head()
    try:
        yield test_url
    finally:
        asyncio.run(_drop_test_database(dev_url))


@pytest.fixture(scope="session")
def seeded_user_id(_test_database: str) -> str:
    """Seed the fixture user once per test session; return its id.

    Runs the real loader (`scripts/seed.py`) against the test database —
    tests then exercise endpoints against the seeded world.
    """
    from app.core.db import dispose_engine
    from scripts import seed as seed_module

    fixture = seed_module.load_fixture()

    async def _seed_and_dispose() -> None:
        try:
            await seed_module.seed(fixture)
        finally:
            # Drop the engine created in this ad-hoc loop so later tests
            # rebuild it inside their own event loops.
            await dispose_engine()

    asyncio.run(_seed_and_dispose())
    return fixture.user.id


@pytest.fixture
async def client(_test_database: str) -> AsyncIterator[AsyncClient]:
    """HTTP client through the real ASGI app (no server needed)."""
    from app.core.db import dispose_engine
    from app.main import create_app

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as async_client:
        yield async_client
    await dispose_engine()


@pytest.fixture
async def db_session(_test_database: str) -> AsyncIterator[AsyncSession]:
    """Direct async session on the test database (integration tests)."""
    from app.core.db import dispose_engine, get_session_factory

    async with get_session_factory()() as session:
        yield session
    await dispose_engine()


@pytest.fixture
async def live_server(_test_database: str) -> AsyncIterator[str]:
    """A REAL uvicorn server on an ephemeral port (for SSE/streaming tests).

    ASGITransport cannot drive infinite streams (it awaits the ASGI app to
    completion), so `GET /api/events` must be tested over real HTTP — which
    is also exactly how the FE consumes it.
    """
    import uvicorn

    from app.core.db import dispose_engine
    from app.main import create_app

    config = uvicorn.Config(
        create_app(), host="127.0.0.1", port=0, log_level="error"
    )
    server = uvicorn.Server(config)
    serve_task = asyncio.create_task(server.serve())
    startup_deadline = asyncio.get_running_loop().time() + 10
    while not server.started:
        if asyncio.get_running_loop().time() > startup_deadline:
            serve_task.cancel()
            raise RuntimeError("uvicorn test server failed to start within 10s")
        await asyncio.sleep(0.05)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await serve_task
        await dispose_engine()
        # sse-starlette keeps a process-global exit Event bound to the FIRST
        # event loop that used it; pytest-asyncio gives each test a fresh
        # loop, so the next live_server test would crash with "bound to a
        # different event loop". It is lazily recreated (sse.py:187) —
        # resetting to None is the documented test pattern.
        from sse_starlette.sse import AppStatus

        AppStatus.should_exit_event = None


@pytest.fixture(autouse=True)
def _fresh_llm_client() -> None:
    """Reset the lru_cached ChatOpenAI between tests: its internal httpx2
    client pools connections bound to the creating event loop, and
    pytest-asyncio gives each test a fresh loop (same reason the DB engine is
    disposed per test). Test-side reset; production code stays clean."""
    from app.core import llm

    llm._client.cache_clear()


@pytest.fixture
async def live_client(live_server: str) -> AsyncIterator[AsyncClient]:
    """HTTP client against the live test server (default 5s timeout = hang-guard)."""
    async with AsyncClient(base_url=live_server) as async_client:
        yield async_client


# ── OpenRouter HTTP-boundary mock (AGENTS.md §6.5) ───────────────────────────
# The ONLY thing tests may mock is the true externality: the OpenRouter HTTP
# call. The openai SDK (3.16+) speaks `httpx2` (a fork respx 0.23 cannot see),
# so tests patch the httpx2 async transport method directly — the exact seam
# where bytes would leave the machine. Nothing inside our code is mocked.

import httpx2  # noqa: E402


def openrouter_tool_response(
    schema_name: str, arguments: dict[str, Any], *, status: int = 200
) -> httpx2.Response:
    """Build a well-formed OpenAI function-calling completion carrying
    `arguments` as the structured tool-call payload for `schema_name`."""
    if status != 200:
        return httpx2.Response(status, json={"error": {"message": "boom"}})
    return httpx2.Response(
        200,
        json={
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": "deepseek/deepseek-v4.1-flash",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": schema_name,
                                    "arguments": json.dumps(arguments),
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        },
    )


class OpenRouterHttpMock:
    """Records requests; `handler` decides the response. A test that forgets
    to set a handler gets a loud AssertionError, never a silent answer."""

    def __init__(self) -> None:
        self.requests: list[httpx2.Request] = []
        self.handler: Callable[[httpx2.Request], httpx2.Response] = (
            self._unconfigured
        )

    @staticmethod
    def _unconfigured(request: httpx2.Request) -> httpx2.Response:
        raise AssertionError(
            "openrouter_http handler not set — a test reached the OpenRouter "
            "boundary without declaring the expected response."
        )

    def tool_name(self, index: int = -1) -> str:
        """The structured-output schema name requested by call `index`."""
        body = json.loads(self.requests[index].content)
        return str(body["tools"][0]["function"]["name"])


@pytest.fixture
def openrouter_http(monkeypatch: pytest.MonkeyPatch) -> OpenRouterHttpMock:
    mock = OpenRouterHttpMock()

    async def _handle(
        self: httpx2.AsyncHTTPTransport, request: httpx2.Request
    ) -> httpx2.Response:
        mock.requests.append(request)
        response = mock.handler(request)
        response.request = request  # raise_for_status needs the request bound
        return response

    monkeypatch.setattr(
        httpx2.AsyncHTTPTransport, "handle_async_request", _handle
    )
    return mock


# ── generic valid-response stub for every P1 LLM tool ─────────────────────────
# Dispatches on the requested structured-output tool name and returns a VALID
# payload for it. Tests that need specific output reassign `.handler`
# themselves. A tool this stub doesn't know fails loudly (AssertionError).

import re  # noqa: E402

_STUB_EMPATHY = "That feels big right now — we'll take it one small step at a time."


def _stub_goal(user_msg: str) -> str:
    match = re.search(r"Message:\s*(.+)", user_msg, re.DOTALL)
    goal = (match.group(1) if match else user_msg).strip()
    return goal[:60]


def _stub_tasks(user_msg: str) -> list[dict[str, object]]:
    match = re.search(r"Produce exactly (\d+) tasks", user_msg)
    assert match, f"TaskBreakdown prompt missing target count: {user_msg!r}"
    count = int(match.group(1))
    verbs = ["Map", "List", "Explain", "Practice", "Recall", "Summarize"]
    return [
        {
            "title": f"{verbs[i % len(verbs)]} step {i + 1} of the goal",
            "description": f"Do step {i + 1} in one focused sitting.",
            "estimateMinutes": 20,
            "difficulty": 1 + (i % 5),
        }
        for i in range(count)
    ]


_STUB_NARRATIONS = [
    "This is your fishboat — today's plan lives here.",
    "The small boats carry your flashcard decks.",
    "Below the surface, your knowledge atlas glows.",
    "The lamp keeps every victory, warmly.",
]


def _stub_arguments(tool_name: str, user_msg: str) -> dict[str, object]:
    if tool_name == "GoalExtraction":
        return {"goal": _stub_goal(user_msg), "empathyLine": _STUB_EMPATHY}
    if tool_name == "TaskBreakdown":
        return {"tasks": _stub_tasks(user_msg)}
    if tool_name == "RoadmapNarration":
        return {"narrations": list(_STUB_NARRATIONS)}
    if tool_name == "SupervisorDecision":
        return {"route": "big_task", "zone": None, "reason": "stub default"}
    if tool_name == "ChunkCards":
        return {
            "cards": [
                {
                    "question": "What is the core concept of this chunk?",
                    "answer": "The core concept is the main idea of the chunk text.",
                    "sourceSnippet": "core concept",
                }
            ]
        }
    if tool_name == "ChunkGraph":
        return {
            "nodes": [
                {"label": "Core Concept", "type": "Concept", "gloss": "Main idea."}
            ],
            "edges": [],
        }
    raise AssertionError(f"openrouter_stub: unstubbed tool {tool_name!r}")


@pytest.fixture
def openrouter_stub(openrouter_http: OpenRouterHttpMock) -> OpenRouterHttpMock:
    """All-tools-valid stub. Tests override with `openrouter_http.handler = …`
    or by wrapping this handler."""

    def handler(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        tool_name = body["tools"][0]["function"]["name"]
        user_msg = next(
            (m["content"] for m in reversed(body["messages"]) if m["role"] == "user"),
            "",
        )
        return openrouter_tool_response(
            tool_name, _stub_arguments(tool_name, user_msg)
        )

    openrouter_http.handler = handler
    return openrouter_http
