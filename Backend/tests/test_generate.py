"""Stage 2 — POST /agents/flashcards/generate (FR-2.1/2.2/2.3, P1).

Real Docling ingestion of the real fixture PDF, real Postgres persistence,
real genanki export. Only the OpenRouter HTTP boundary is mocked (§6.5).
"""

import json
from pathlib import Path

import httpx2
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from tests.conftest import OpenRouterHttpMock, openrouter_tool_response

FIXTURES = Path(__file__).parent / "fixtures"
BIOLOGY = (FIXTURES / "biology-photosynthesis.pdf").read_bytes()

CARDS_ARGUMENTS = {
    "cards": [
        {
            "question": "What is photosynthesis?",
            "answer": (
                "The process by which green plants convert light energy "
                "into chemical energy stored in glucose."
            ),
            "sourceSnippet": (
                "Photosynthesis: the process by which green plants, algae "
                "and some bacteria convert light energy into chemical "
                "energy stored in glucose."
            ),
        },
        {
            "question": "Where do the light reactions take place?",
            "answer": "In the thylakoid membranes of chloroplasts.",
            "sourceSnippet": "Stage A - Light reactions (thylakoid membranes):",
        },
        {
            "question": "What is the master equation of photosynthesis?",
            "answer": "6 CO2 + 6 H2O + light energy yields C6H12O6 + 6 O2.",
            "sourceSnippet": "6 CO2 + 6 H2O + light energy -> C6H12O6 + 6 O2",
        },
    ]
}


def _cards_handler(req: httpx2.Request) -> httpx2.Response:
    body = json.loads(req.content)
    # Prove the real document text reached the LLM boundary (no canned path).
    prompt = json.dumps(body["messages"])
    assert "Photosynthesis" in prompt, "LLM prompt must carry the parsed text"
    return openrouter_tool_response("ChunkCards", CARDS_ARGUMENTS)


async def test_generate_deck_from_real_pdf(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    openrouter_http.handler = _cards_handler
    response = await client.post(
        "/agents/flashcards/generate",
        headers={"X-Harbour-User-Id": "user-gen-01"},
        files={"file": ("biology-photosynthesis.pdf", BIOLOGY, "application/pdf")},
        data={"deck_name": "Biology 101"},
    )
    assert response.status_code == 200, response.text
    deck = response.json()
    assert deck["name"] == "Biology 101"
    assert deck["boatState"] == "circle"
    assert deck["cardCount"] == 3
    assert deck["dueToday"] == 3
    assert deck["apkgUrl"] == f"/static/decks/{deck['id']}.apkg"

    # Cards persisted with per-card ≤200-char snippets and fresh FSRS state.
    cards = (
        (
            await db_session.execute(
                select(m.Flashcard).where(m.Flashcard.deck_id == deck["id"])
            )
        )
        .scalars()
        .all()
    )
    assert len(cards) == 3
    for card in cards:
        assert len(card.source_snippet) <= 200
        assert card.fsrs["state"] == "new"
        assert len(card.question.split()) <= 25
        assert len(card.answer.split()) <= 40

    # spawn_boat SSE event committed in the same transaction (§5.3).
    events = (
        (await db_session.execute(
            select(m.EventOutbox)
            .where(m.EventOutbox.user_id == "user-gen-01")
            .order_by(m.EventOutbox.seq)
        ))
        .scalars()
        .all()
    )
    assert [e.type for e in events] == ["spawn_boat"]
    assert events[0].payload["deck"]["id"] == deck["id"]

    # C4: the .apkg file exists at apkgUrl, is served, and is a valid package.
    served = await client.get(deck["apkgUrl"])
    assert served.status_code == 200
    import io
    import zipfile

    archive = zipfile.ZipFile(io.BytesIO(served.content))
    assert "collection.anki2" in archive.namelist()


async def test_generate_rejects_unsupported_extension(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    response = await client.post(
        "/agents/flashcards/generate",
        headers={"X-Harbour-User-Id": "user-gen-02"},
        files={"file": ("notes.exe", b"MZ...", "application/octet-stream")},
        data={"deck_name": "Nope"},
    )
    assert response.status_code == 415
    body = response.json()
    assert body["code"] == "DOCUMENT_UNSUPPORTED"
    assert body["detail"]["acceptedExtensions"] == [
        ".pdf", ".pptx", ".docx", ".md", ".txt"
    ]
    # Validation errors: REST only — NO SSE event (§5.2).
    seqs = (
        await db_session.execute(
            select(func.count()).select_from(m.EventOutbox).where(
                m.EventOutbox.user_id == "user-gen-02"
            )
        )
    ).scalar_one()
    assert seqs == 0


async def test_generate_corrupt_pdf_fails_loudly(client: AsyncClient) -> None:
    response = await client.post(
        "/agents/flashcards/generate",
        headers={"X-Harbour-User-Id": "user-gen-03"},
        files={
            "file": ("corrupt.pdf", b"%PDF-1.4 garbage \x00\x01" * 20,
                     "application/pdf")
        },
        data={"deck_name": "Broken"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "DOCUMENT_PARSE_FAILED"


async def test_generate_llm_down_returns_envelope_and_sse_error(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    """C5: OpenRouter 500 → §5.2 envelope + committed SSE error, no cards."""
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "ChunkCards", {}, status=500
    )
    response = await client.post(
        "/agents/flashcards/generate",
        headers={"X-Harbour-User-Id": "user-gen-04"},
        files={"file": ("biology-photosynthesis.pdf", BIOLOGY, "application/pdf")},
        data={"deck_name": "Biology 101"},
    )
    assert response.status_code == 502
    assert response.json()["code"] == "LLM_UNAVAILABLE"

    # SSE error event committed; NO deck/cards persisted (nothing fake).
    events = (
        (await db_session.execute(
            select(m.EventOutbox.type).where(m.EventOutbox.user_id == "user-gen-04")
        ))
        .scalars()
        .all()
    )
    assert events == ["error"]
    decks = (
        await db_session.execute(
            select(func.count())
            .select_from(m.Deck)
            .where(m.Deck.user_id == "user-gen-04")
        )
    ).scalar_one()
    assert decks == 0


async def test_generate_card_rule_violation_is_a_hard_error(
    client: AsyncClient, openrouter_http: OpenRouterHttpMock
) -> None:
    """FR-2.2/C2: a 30-word question from the LLM is rejected, not truncated."""
    bad = dict(CARDS_ARGUMENTS)
    bad["cards"] = [
        {
            "question": " ".join(["word"] * 30) + "?",
            "answer": "short",
            "sourceSnippet": "short",
        }
    ]
    openrouter_http.handler = lambda req: openrouter_tool_response("ChunkCards", bad)
    response = await client.post(
        "/agents/flashcards/generate",
        headers={"X-Harbour-User-Id": "user-gen-05"},
        files={"file": ("biology-photosynthesis.pdf", BIOLOGY, "application/pdf")},
        data={"deck_name": "Biology 101"},
    )
    assert response.status_code == 502
    assert response.json()["code"] == "LLM_UNAVAILABLE"
