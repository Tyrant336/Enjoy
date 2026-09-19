"""pytest harness — the real app against the real Postgres (AGENTS.md §6.3).

NEVER SQLite: dialect differences are where silent failures breed. Tests run
against a dedicated database ``harbour_test`` on the SAME local Postgres
server as development (hackathon pragmatism — monitor-approved, recorded in
docs/sessions/014). Per test session it is dropped, recreated, and migrated
with ``alembic upgrade head``, so tests always run against the real, current
Alembic-owned schema — never ``metadata.create_all`` (AGENTS.md §5.2).

How it works: the session fixture repoints ``DATABASE_URL`` to
``harbour_test`` for the whole session *before* the app is imported, then
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
import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

TEST_DB_NAME = "harbour_test"
_BACKEND_DIR = Path(__file__).resolve().parents[1]


async def _recreate_test_database(admin_url: str) -> None:
    """Drop + recreate the test database (autocommit; cannot run in a txn)."""
    engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)'))
        await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    await engine.dispose()


def _run_alembic_upgrade_head() -> None:
    """Apply the real migrations to the test database (AGENTS.md §5.2)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def _test_database() -> str:
    """Session-scoped: fresh, migrated ``harbour_test``; returns its URL."""
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
    return test_url


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


@pytest.fixture
async def live_client(live_server: str) -> AsyncIterator[AsyncClient]:
    """HTTP client against the live test server (default 5s timeout = hang-guard)."""
    async with AsyncClient(base_url=live_server) as async_client:
        yield async_client
