"""Stage 1 — the ONE LLM client wrapper (app/core/llm.py).

HTTP-boundary mocking ONLY (AGENTS.md §6.5): the `openrouter_http` fixture
patches the httpx2 transport seam; everything inside (prompt building,
structured-output parsing, error mapping) is real code under test.
"""

import httpx2
import pytest

from app.core import llm
from app.schemas import ContractModel
from tests.conftest import OpenRouterHttpMock, openrouter_tool_response


class Probe(ContractModel):
    answer: str
    count: int


async def test_structured_success_parses_by_key(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "Probe", {"answer": "blue", "count": 3}
    )
    result = await llm.structured(Probe, system="s", user="u")
    assert result == Probe(answer="blue", count=3)
    assert openrouter_http.tool_name() == "Probe"


async def test_structured_garbage_fails_loudly(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """§2.4/B2: model answered without the schema tool call → hard error."""

    def handler(req: httpx2.Request) -> httpx2.Response:
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
                            "content": "definitely not a tool call",
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    openrouter_http.handler = handler
    with pytest.raises(llm.LLMError):
        await llm.structured(Probe, system="s", user="u")


async def test_structured_invalid_arguments_fail_loudly(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    """Tool call present but arguments violate the schema → LLMError."""
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "Probe", {"answer": "blue", "count": "not-an-int"}
    )
    with pytest.raises(llm.LLMError):
        await llm.structured(Probe, system="s", user="u")


@pytest.mark.parametrize("status", [429, 500, 503])
async def test_structured_http_errors_fail_loudly(
    openrouter_http: OpenRouterHttpMock, status: int
) -> None:
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "Probe", {}, status=status
    )
    with pytest.raises(llm.LLMError):
        await llm.structured(Probe, system="s", user="u")


async def test_structured_unreachable_fails_loudly(
    openrouter_http: OpenRouterHttpMock,
) -> None:
    def handler(req: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("no route to host", request=req)

    openrouter_http.handler = handler
    with pytest.raises(llm.LLMError):
        await llm.structured(Probe, system="s", user="u")


def test_missing_model_config_crashes_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    """§4.2: no model id configured = loud error, not a silent default."""
    from app.core.config import get_settings

    monkeypatch.setenv("OPENROUTER_MODEL", "")
    get_settings.cache_clear()
    try:
        with pytest.raises(llm.LLMError, match="OPENROUTER_MODEL"):
            llm.get_client()
    finally:
        get_settings.cache_clear()
