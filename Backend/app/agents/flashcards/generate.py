"""Flashcard Agent — document → deck generation (FR-2.1/2.2/2.3, P1).

ONE LangGraph StateGraph (locked decision, handoff §3.4): typed state flows
extract → validate; there is no second generator and no template path.

- `extract`: one structured-output LLM call per chunk (parallel), producing
  `GeneratedCard`s that each carry a verbatim ≤180-char source snippet (§4.5).
- `validate`: FR-2.2 hard limits enforced as post-validation — a card with
  question >25 words / answer >40 words / snippet >200 chars is a HARD error
  (loud LLMError with the offending card logged), never silent truncation.

Persistence + `.apkg` export live here too (the endpoint owns the
transaction; §5.3 same-transaction rule). The document bytes are discarded
by the ingestion layer before this module persists anything (§4.5).
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import TypedDict, cast

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.agents.flashcards import apkg
from app.agents.flashcards.prompts import CARD_SYSTEM_PROMPT
from app.core import llm
from app.services import outbox
from app.services.ingestion import IngestedDocument

logger = logging.getLogger("enjoy.flashcards.generate")

MAX_QUESTION_WORDS = 25  # FR-2.2
MAX_ANSWER_WORDS = 40  # FR-2.2
MAX_SNIPPET_CHARS = 200  # §4.5


class GeneratedCard(s.ContractModel):
    """LLM output schema for one card (endpoint-internal, not the frozen §5.1
    contract — the persisted Flashcard contract is unchanged)."""

    question: str
    answer: str
    source_snippet: str


class ChunkCards(s.ContractModel):
    """The structured-output envelope for one chunk's LLM call."""

    cards: list[GeneratedCard]


class _CardGenState(TypedDict):
    document: IngestedDocument
    cards: list[GeneratedCard]


async def _extract(state: _CardGenState) -> dict[str, object]:
    """One structured LLM call per chunk, in parallel. Any LLM failure
    propagates as LLMError (no fallback exists for flashcards, §3.7)."""
    document = state["document"]

    async def _one_chunk(chunk_text: str) -> ChunkCards:
        return await llm.structured(
            ChunkCards,
            system=CARD_SYSTEM_PROMPT,
            user=f"Document: {document.title}\n\nChunk:\n{chunk_text}",
        )

    results = await asyncio.gather(
        *(_one_chunk(chunk.text) for chunk in document.chunks)
    )
    cards = [card for result in results for card in result.cards]
    logger.info(
        "card extraction: doc=%s chunks=%d raw_cards=%d",
        document.filename,
        len(document.chunks),
        len(cards),
    )
    return {"cards": cards}


def _word_count(text: str) -> int:
    return len(text.split())


async def _validate(state: _CardGenState) -> dict[str, object]:
    """FR-2.2 post-validation — hard error on any violation (§2.4)."""
    cards = state["cards"]
    for card in cards:
        violations = []
        if _word_count(card.question) > MAX_QUESTION_WORDS:
            violations.append(
                f"question has {_word_count(card.question)} words "
                f"(max {MAX_QUESTION_WORDS})"
            )
        if _word_count(card.answer) > MAX_ANSWER_WORDS:
            violations.append(
                f"answer has {_word_count(card.answer)} words (max {MAX_ANSWER_WORDS})"
            )
        if len(card.source_snippet) > MAX_SNIPPET_CHARS:
            violations.append(
                f"snippet has {len(card.source_snippet)} chars (max {MAX_SNIPPET_CHARS})"
            )
        if not card.question.strip() or not card.answer.strip():
            violations.append("empty question or answer")
        if violations:
            logger.error(
                "generated card violates FR-2.2: %s card=%r", violations, card
            )
            raise llm.LLMError(
                "Generated card violates the card rules: " + "; ".join(violations),
                payload=card.model_dump(mode="json"),
            )
    if not cards:
        raise llm.LLMError(
            "The LLM returned zero cards for a document with extractable text.",
            payload={"document": state["document"].filename},
        )
    return {"cards": cards}


_CardGraph = CompiledStateGraph[_CardGenState, None, _CardGenState, _CardGenState]


def _build_graph() -> _CardGraph:
    graph = StateGraph(_CardGenState)
    graph.add_node("extract", _extract)
    graph.add_node("validate", _validate)
    graph.add_edge(START, "extract")
    graph.add_edge("extract", "validate")
    graph.add_edge("validate", END)
    return cast(_CardGraph, graph.compile())


_CARD_GRAPH = _build_graph()


async def _run_card_graph(document: IngestedDocument) -> list[GeneratedCard]:
    result = await _CARD_GRAPH.ainvoke({"document": document, "cards": []})
    return [GeneratedCard.model_validate(c) for c in result["cards"]]


_NEW_FSRS = s.FsrsState(
    state="new", stability=None, difficulty=None, interval_days=None, reps=0
)


async def generate_deck(
    session: AsyncSession,
    user: m.User,
    *,
    deck_name: str,
    document: IngestedDocument,
) -> s.Deck:
    """Generate + persist a deck from an already-ingested document, export the
    `.apkg`, and emit `spawn_boat`. Caller owns the transaction/commit.

    `.apkg` failure handling (handoff §3.6): the deck is the primary artifact
    and persists regardless; an export failure is logged at ERROR AND surfaced
    as an SSE `error` event (§2.6/§5.3) — never silent, never substituted.
    """
    cards = await _run_card_graph(document)

    deck_id = f"deck-{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    deck_row = m.Deck(id=deck_id, user_id=user.id, name=deck_name, boat_state="circle")
    session.add(deck_row)
    await session.flush()  # FK tier: deck before cards (session 013 lesson)
    for card in cards:
        session.add(
            m.Flashcard(
                id=f"card-{uuid.uuid4().hex[:12]}",
                deck_id=deck_id,
                user_id=user.id,
                question=card.question,
                answer=card.answer,
                due=now,
                fsrs=_NEW_FSRS.model_dump(by_alias=True),
                source_snippet=card.source_snippet,
            )
        )

    deck_schema = s.Deck(
        id=deck_id,
        name=deck_name,
        boat_state="circle",
        card_count=len(cards),
        due_today=len(cards),
        apkg_url=None,
    )
    try:
        apkg_url = await asyncio.to_thread(
            apkg.export_apkg, deck_id, deck_name, cards
        )
    except Exception as exc:
        logger.error(
            "apkg export failed: deck=%s error=%r (deck persists; export is "
            "derived and regenerable)", deck_id, exc,
        )
        await outbox.emit(
            session,
            user.id,
            [
                outbox.error(
                    "Your deck was saved, but the Anki export failed. "
                    "The cards are safe in your harbour."
                )
            ],
        )
    else:
        # Same row, same transaction — the deck never exists without its
        # export state settled one way or the other.
        deck_row.apkg_url = apkg_url
        deck_schema = deck_schema.model_copy(update={"apkg_url": apkg_url})

    await outbox.emit(session, user.id, [outbox.spawn_boat(deck_schema)])
    return deck_schema


__all__ = ["ChunkCards", "GeneratedCard", "generate_deck"]
