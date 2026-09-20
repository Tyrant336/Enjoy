"""P1 golden path (checklist G1) — ONE automated test, the new demo:

upload PDF → deck appears → review + grade one card → graph grew →
journal record written.

Real Docling ingestion, real Postgres, real genanki export, real py-fsrs
scheduling. Only the OpenRouter HTTP boundary is stubbed (AGENTS.md §6.5);
the live real-OpenRouter run is the monitor's acceptance pass (session 026
scratch: `.scratch/p1-verify/eval_live.py`).
"""

import json
from pathlib import Path
from typing import Any

import httpx2
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import OpenRouterHttpMock, openrouter_tool_response

FIXTURES = Path(__file__).parent / "fixtures"
BIOLOGY = (FIXTURES / "biology-photosynthesis.pdf").read_bytes()

_CARDS = {
    "cards": [
        {
            "question": "What is photosynthesis?",
            "answer": (
                "The conversion of light energy into chemical energy "
                "stored in glucose by green plants."
            ),
            "sourceSnippet": (
                "Photosynthesis: the process by which green plants, algae "
                "and some bacteria convert light energy"
            ),
        },
        {
            "question": "Where does the Calvin cycle take place?",
            "answer": "In the stroma of the chloroplast.",
            "sourceSnippet": "Stage B - Calvin cycle (stroma):",
        },
        {
            "question": "What does photolysis release?",
            "answer": "Oxygen, from splitting water in the light reactions.",
            "sourceSnippet": "Light splits water (photolysis), releasing O2.",
        },
    ]
}

_GRAPH = {
    "nodes": [
        {"label": "Photosynthesis", "type": "Process",
         "gloss": "Light energy to chemical energy in glucose."},
        {"label": "Chlorophyll", "type": "Term",
         "gloss": "The green light-absorbing pigment."},
        {"label": "Calvin Cycle", "type": "Process",
         "gloss": "Light-independent carbon fixation stage."},
    ],
    "edges": [
        {"sourceLabel": "Chlorophyll", "targetLabel": "Photosynthesis",
         "type": "PART_OF"},
        {"sourceLabel": "Calvin Cycle", "targetLabel": "Photosynthesis",
         "type": "PART_OF"},
    ],
}


def _handler(req: httpx2.Request) -> httpx2.Response:
    body = json.loads(req.content)
    tool = body["tools"][0]["function"]["name"]
    prompt = json.dumps(body["messages"])
    assert "Photosynthesis" in prompt  # real parsed text reached the boundary
    if tool == "ChunkCards":
        return openrouter_tool_response(tool, _CARDS)
    if tool == "ChunkGraph":
        return openrouter_tool_response(tool, _GRAPH)
    raise AssertionError(f"unexpected tool {tool}")


async def test_golden_path(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    openrouter_http.handler = _handler
    headers = {"X-Harbour-User-Id": "golden-01"}

    # ── upload PDF → deck appears (FR-2.1/2.2/2.3) ──
    gen = await client.post(
        "/agents/flashcards/generate",
        headers=headers,
        files={"file": ("biology-photosynthesis.pdf", BIOLOGY, "application/pdf")},
        data={"deck_name": "Biology 101"},
    )
    assert gen.status_code == 200, gen.text
    deck: dict[str, Any] = gen.json()
    assert deck["cardCount"] == 3 and deck["boatState"] == "circle"

    world = (await client.get("/api/world-state", headers=headers)).json()
    assert any(d["id"] == deck["id"] for d in world["decks"]), "deck in world state"

    # ── review + grade the whole deck (FR-2.5/2.8/2.9) ──
    start = await client.post(
        "/agents/flashcards/review/start", headers=headers,
        json={"deckId": deck["id"]},
    )
    card = start.json()["card"]
    assert card is not None and start.json()["progress"]["total"] == 3

    reveal = await client.post(
        "/agents/flashcards/review/reveal", headers=headers,
        json={"cardId": card["id"]},
    )
    # Cards share one `due` instant → first card is id-ordered, not insertion-
    # ordered; the reveal must match ONE of the generated answers exactly.
    assert reveal.json()["answer"] in {c["answer"] for c in _CARDS["cards"]}

    for _ in range(3):
        current = (
            await client.post(
                "/agents/flashcards/review/start", headers=headers,
                json={"deckId": deck["id"]},
            )
        ).json()["card"]
        grade = await client.post(
            "/agents/flashcards/review/grade", headers=headers,
            json={"cardId": current["id"], "rating": "good"},
        )
        assert grade.status_code == 200, grade.text
    assert grade.json()["deckProgress"]["completed"] is True
    graded_card = grade.json()["card"]
    assert graded_card["fsrsState"]["state"] == "learning"  # real py-fsrs state
    assert graded_card["fsrsState"]["stability"] is not None

    # ── graph grew (FR-3.2/3.3) ──
    before = (await client.get("/agents/kg/graph", headers=headers)).json()
    assert before["nodes"] == []  # fresh user — starting from zero
    build = await client.post(
        "/agents/kg/build",
        headers=headers,
        files={"file": ("biology-photosynthesis.pdf", BIOLOGY, "application/pdf")},
    )
    assert build.status_code == 200, build.text
    after = (await client.get("/agents/kg/graph", headers=headers)).json()
    assert len(after["nodes"]) == 3 and len(after["links"]) == 2

    # ── journal record written (FR-2.6/FR-4, same transaction) ──
    records = (await client.get("/api/records", headers=headers)).json()
    completed = [r for r in records if r["kind"] == "deck_completed"]
    assert len(completed) == 1 and completed[0]["refId"] == deck["id"]

    world = (await client.get("/api/world-state", headers=headers)).json()
    final_deck = next(d for d in world["decks"] if d["id"] == deck["id"])
    assert final_deck["boatState"] == "docked"  # finished → docked at the lamp
    assert world["graphSummary"]["nodeCount"] == 3
    assert world["lampGlowLevel"] > 0
