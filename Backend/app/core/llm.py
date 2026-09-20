"""THE ONLY module that talks to OpenRouter (AGENTS.md §3.1 — one LLM client
wrapper; REQUIREMENTS §4.1 "OpenRouter LLM client" is shared infrastructure).

Built on `langchain-openai`'s `ChatOpenAI` with base_url/api_key/model from
`app.core.config.settings`. Every LLM output goes through Pydantic structured
output (`with_structured_output`, function-calling method — verified live
against the configured model in session 026); parse by key, never by position,
no regex parsing ever (§2.4).

Failure contract (AGENTS.md §2 — FAIL LOUDLY):
- Transport failure (unreachable / 429 / 500 / invalid key at runtime) →
  `LLMError` with status context.
- Schema mismatch / unparseable output → `LLMError` with the offending payload
  logged (§2.4: hard error, never a partial/garbled result).
- There are NO fallbacks in this module. The single sanctioned fallback in the
  whole system is the KG agent's KeyBERT path (FR-3.2), which catches
  `LLMError` itself. Everyone else propagates.

PDFs are parsed to TEXT by Docling before reaching the LLM (locked decision,
docs/handoff/agent-l-p1.md §3.1) — this client is text-only by design.
"""

import logging
from functools import lru_cache
from typing import TypeVar, cast

from langchain_openai import ChatOpenAI
from openai import APIConnectionError, APIError, APITimeoutError
from pydantic import BaseModel, SecretStr

from app.core.config import get_settings

logger = logging.getLogger("enjoy.llm")

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Any OpenRouter failure: transport OR invalid structured output.

    `payload` carries the offending raw output when the model responded but
    the response could not be validated (§2.4 — logged AND raised).
    """

    def __init__(self, message: str, *, payload: object | None = None) -> None:
        super().__init__(message)
        self.payload = payload


@lru_cache(maxsize=8)
def _client(base_url: str, api_key: str, model: str, temperature: float) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=base_url,
        api_key=SecretStr(api_key),
        model=model,
        temperature=temperature,
        timeout=120,
        max_retries=0,  # retries are the caller's decision; never silently repeat
    )


def get_client(*, temperature: float = 0.2) -> ChatOpenAI:
    """The ONE ChatOpenAI factory. Missing model config = loud crash (§4.2)."""
    settings = get_settings()
    if not settings.openrouter_model:
        raise LLMError(
            "OPENROUTER_MODEL is not configured — the backend cannot call the "
            "LLM without a model id (REQUIREMENTS §4.2)."
        )
    return _client(
        settings.openrouter_base_url,
        settings.openrouter_api_key,
        settings.openrouter_model,
        temperature,
    )


async def structured(
    schema: type[T],
    *,
    system: str,
    user: str,
    temperature: float = 0.2,
) -> T:
    """One structured-output call: `system`/`user` prompts in, validated
    `schema` instance out — or a loud `LLMError`."""
    client = get_client(temperature=temperature)
    chain = client.with_structured_output(schema, method="function_calling")
    logger.info(
        "LLM call: schema=%s model=%s prompt_chars=%d",
        schema.__name__,
        client.model_name,
        len(system) + len(user),
    )
    try:
        result = await chain.ainvoke(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
        )
    except (APIError, APIConnectionError, APITimeoutError) as exc:
        logger.error("LLM transport failure: schema=%s error=%r", schema.__name__, exc)
        raise LLMError(f"OpenRouter request failed: {exc!r}") from exc
    except Exception as exc:
        # Validation/parse failures surface here (e.g. OutputParserException) —
        # the model answered but not in our schema. Log + raise (§2.4).
        logger.error(
            "LLM output failed validation: schema=%s error=%r", schema.__name__, exc
        )
        raise LLMError(
            f"OpenRouter output did not match schema {schema.__name__}: {exc!r}",
            payload=repr(exc),
        ) from exc
    if result is None:
        logger.error("LLM returned no structured output: schema=%s", schema.__name__)
        raise LLMError(
            f"OpenRouter returned no structured output for schema {schema.__name__}."
        )
    return cast(T, result)
