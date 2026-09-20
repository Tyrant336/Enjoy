"""`.apkg` export via genanki (FR-2.3) — derived artifact, regenerable.

Files are written under `Backend/static/decks/` and served by the app's
`/static` mount; `Deck.apkgUrl` points there. Export runs at generation time
(handoff §3.6); a failure is surfaced by the caller (ERROR log + SSE `error`)
while the deck — the primary artifact — persists.
"""

import hashlib
from pathlib import Path
from typing import TYPE_CHECKING

import genanki

if TYPE_CHECKING:
    from app.agents.flashcards.generate import GeneratedCard

# Backend/static/decks/ — created on demand; served at /static/decks/...
STATIC_DECKS_DIR = Path(__file__).resolve().parents[3] / "static" / "decks"

# genanki requires integer model/deck IDs. The model ID is a fixed constant
# (one card model for the whole app); deck IDs derive from our deck id.
_MODEL_ID = 2_026_091_901


def _deck_int_id(deck_id: str) -> int:
    """Stable 30-bit int derived from the deck's string id (deterministic —
    `hash()` is randomized per process and must not be used here)."""
    digest = hashlib.sha256(deck_id.encode()).digest()
    return int.from_bytes(digest[:4]) % (1 << 30)


def export_apkg(deck_id: str, deck_name: str, cards: list["GeneratedCard"]) -> str:
    """Write `<deck_id>.apkg`; return its URL path (`/static/decks/…`)."""
    model = genanki.Model(
        _MODEL_ID,
        "enjoy Harbour Card",
        fields=[{"name": "Question"}, {"name": "Answer"}],
        templates=[
            {
                "name": "Card",
                "qfmt": "{{Question}}",
                "afmt": '{{FrontSide}}<hr id="answer">{{Answer}}',
            }
        ],
    )
    deck = genanki.Deck(_deck_int_id(deck_id), deck_name)
    for card in cards:
        deck.add_note(
            genanki.Note(model=model, fields=[card.question, card.answer])
        )
    STATIC_DECKS_DIR.mkdir(parents=True, exist_ok=True)
    path = STATIC_DECKS_DIR / f"{deck_id}.apkg"
    genanki.Package(deck).write_to_file(str(path))
    return f"/static/decks/{deck_id}.apkg"
