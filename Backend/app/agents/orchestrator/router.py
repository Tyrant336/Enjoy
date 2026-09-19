"""Deterministic pre-router — FR-0.3. THE ONE router (no second anywhere).

P0 contract (FR-0): routing is a cheap deterministic keyword/rule pre-router.
The LLM supervisor fallback for ambiguous messages is P1 — in P0 this module
IS the whole routing decision (one path, AGENTS.md §3).

Rules (REQUIREMENTS FR-0.1 / FR-0.2):
- A message naming exactly ONE zone → that zone's agent only, NEVER a tour.
  Zones (FR-0.1 table): fishboat (scheduler) · small boat (flashcards) ·
  underwater / atlas · journal / lamp.
- A "big task" (FR-0.2) = names a learning goal/topic WITHOUT naming a zone;
  OR emotional/vague language ("afraid", "overwhelmed", …); OR asks for a
  plan/schedule/roadmap. Big tasks run the full pipeline + tour OFFER.
- Precedence: an explicit zone name beats the plan/schedule-ask rule — FR-0.2
  defines big tasks as naming a topic "without naming a single zone", so
  "fishboat schedule" is still a direct-zone request. Naming ≥2 zones is not
  a direct-zone request → big task (the pipeline touches every zone anyway).
- Anything else that is not bare chitchat (a greeting/acknowledgement) is a
  big task (P0 treats content words as a topic until the P1 LLM supervisor
  refines this, FR-0.3). Chitchat → a warm narration, never a fake plan.
  Empty messages are rejected upstream (422), never reach here.
"""

import re
import string
from enum import StrEnum


class Zone(StrEnum):
    FISHBOAT = "fishboat"  # Scheduler Agent
    SMALL_BOAT = "small_boat"  # Flashcard Agent
    UNDERWATER = "underwater"  # knowledge atlas (dive)
    LAMP = "lamp"  # journal / records


class Route(StrEnum):
    DIRECT_ZONE = "direct_zone"  # one agent, no tour
    BIG_TASK = "big_task"  # full pipeline + tour offer
    NARRATE = "narrate"  # unclassified chitchat — warm reply only (P0 stand-in
    # for the P1 LLM-supervisor fallback, FR-0.3; never a plan, never a tour)


class RouteDecision:
    """What the orchestrator should do with one chat message."""

    def __init__(self, route: Route, zone: Zone | None) -> None:
        if route is Route.DIRECT_ZONE and zone is None:
            raise ValueError("DIRECT_ZONE requires a zone")  # fail loudly
        if route is not Route.DIRECT_ZONE and zone is not None:
            raise ValueError("only DIRECT_ZONE carries a zone")
        self.route = route
        self.zone = zone

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, RouteDecision)
            and self.route == other.route
            and self.zone == other.zone
        )

    def __repr__(self) -> str:
        return f"RouteDecision({self.route}, {self.zone})"


# Zone keyword sets — matched against whole words after normalization.
_ZONE_KEYWORDS: dict[Zone, frozenset[str]] = {
    Zone.FISHBOAT: frozenset({"fishboat", "fish", "scheduler"}),
    Zone.SMALL_BOAT: frozenset(
        {"smallboat", "smallboats", "boat", "boats", "deck", "decks", "flashcard",
         "flashcards", "anki", "cards", "card", "review"}
    ),
    Zone.UNDERWATER: frozenset({"underwater", "atlas", "dive", "graph", "knowledge"}),
    Zone.LAMP: frozenset({"journal", "lamp", "records", "record", "history", "log"}),
}

# Multi-word zone phrases checked before single words ("small boat" ≠ "boat").
_ZONE_PHRASES: dict[Zone, frozenset[str]] = {
    Zone.SMALL_BOAT: frozenset({"small boat", "small boats", "leader boat"}),
    Zone.FISHBOAT: frozenset({"fat boat", "big boat"}),
    Zone.UNDERWATER: frozenset({"knowledge atlas", "knowledge graph", "under water"}),
    Zone.LAMP: frozenset({"light buoy", "lamp buoy"}),
}

def _normalize(message: str) -> str:
    """Lowercase, apostrophes dropped ("don't"→"dont"), punctuation → spaces."""
    text = message.strip().lower().replace("'", "").replace("\u2019", "")
    table = str.maketrans({ord(c): " " for c in string.punctuation})
    return text.translate(table)


def _words(normalized: str) -> set[str]:
    return {w for w in normalized.split() if w}


# FR-0.2 defines a big task as a learning goal/topic. A bare greeting or
# acknowledgement is none of the FR-0.2 clauses — deterministic P0 stand-in
# for the P1 LLM fallback: route it to a warm narration, never a fake plan.
_CHITCHAT = frozenset({
    "hi", "hello", "hey", "yo", "sup", "thanks", "thank", "thankyou", "ok",
    "okay", "yes", "no", "nope", "bye", "good", "morning", "evening",
    "afternoon", "night", "cool", "nice", "great", "lol",
})


def route_message(message: str) -> RouteDecision:
    """Route one chat message. Pure — no I/O, no clock, fully deterministic."""
    normalized = _normalize(message)
    words = _words(normalized)

    zones_hit: set[Zone] = set()
    # Phrases first, masking each matched occurrence so its words cannot ALSO
    # hit single-word keywords: "fat boat" IS the fishboat — the "boat" inside
    # it must not pull in the small-boat zone (session 018 known gap).
    unclaimed = normalized
    for zone, phrases in _ZONE_PHRASES.items():
        for phrase in phrases:
            pattern = rf"\b{re.escape(phrase)}\b"
            if re.search(pattern, unclaimed):
                zones_hit.add(zone)
                unclaimed = re.sub(pattern, " ", unclaimed)
    for zone, keywords in _ZONE_KEYWORDS.items():
        if _words(unclaimed) & keywords:
            zones_hit.add(zone)

    if len(zones_hit) == 1:
        return RouteDecision(Route.DIRECT_ZONE, next(iter(zones_hit)))
    # ≥2 zones is not "a single zone" (FR-0.2) → big task. 0 zones: big task
    # when any FR-0.2 clause hits (topic/emotion/plan-ask — P0 treats any
    # non-chitchat content words as a topic); otherwise a warm narrate.
    if words and words <= _CHITCHAT:
        return RouteDecision(Route.NARRATE, None)
    return RouteDecision(Route.BIG_TASK, None)


__all__ = ["Route", "RouteDecision", "Zone", "route_message"]
