"""Deterministic pre-router — FR-0.3. THE ONE router (no second anywhere).

Routing is a cheap deterministic keyword/rule pre-router; the LLM supervisor
fallback node in the orchestrator graph (P1, FR-0.3) is consulted ONLY when
this module reports the message ambiguous (0 zones and not chitchat, or one
zone plus substantial residual learning content — eval defects D3/D4,
session 025). One graph, one path; no parallel routers.

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
- Bare chitchat (a greeting/acknowledgement) → a warm narration, never a fake
  plan. Empty messages are rejected upstream (422), never reach here.
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

# Filler words stripped when measuring residual learning content.
_FILLER = frozenset({
    "i", "me", "my", "and", "the", "a", "an", "to", "please", "can", "could",
    "you", "for", "it", "of", "on", "in", "so", "just", "really",
})


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


def _analyze(message: str) -> tuple[RouteDecision, frozenset[Zone], frozenset[str]]:
    """Route + the evidence behind it (zones hit, residual content words)."""
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
    zone_words: set[str] = set()
    for zone, keywords in _ZONE_KEYWORDS.items():
        hits = _words(unclaimed) & keywords
        if hits:
            zones_hit.add(zone)
            zone_words |= hits

    # Residual = words that are neither zone vocabulary nor filler — the
    # "learning content" left over (drives the supervisor trigger, D3/D4).
    residual = frozenset(_words(unclaimed) - zone_words - _FILLER)

    if len(zones_hit) == 1:
        decision = RouteDecision(Route.DIRECT_ZONE, next(iter(zones_hit)))
    elif words and words <= _CHITCHAT:
        decision = RouteDecision(Route.NARRATE, None)
    else:
        # ≥2 zones is not "a single zone" (FR-0.2) → big task. 0 zones with
        # any non-chitchat content → big task (supervisor may refine, FR-0.3).
        decision = RouteDecision(Route.BIG_TASK, None)
    return decision, frozenset(zones_hit), residual


class RouteAnalysis:
    """The deterministic route PLUS its evidence — what the orchestrator
    graph needs to decide whether the LLM supervisor must be consulted."""

    def __init__(
        self,
        decision: RouteDecision,
        zones: frozenset[Zone],
        residual: frozenset[str],
    ) -> None:
        self.decision = decision
        self.zones = zones
        self.residual = residual

    @property
    def ambiguous(self) -> bool:
        """FR-0.3/handoff §3.4: the LLM supervisor is consulted ONLY for the
        ambiguous case —
        - 0 zones hit and not pure chitchat (the message COULD be a big task,
          but the deterministic rules cannot tell a topic from a request);
        - exactly 1 zone hit but substantial residual learning content
          remains (e.g. "help me understand photosynthesis AND drill my
          flashcards" — the zone alone would drop the topic, D4).
        """
        if self.decision.route is Route.BIG_TASK and not self.zones:
            return True
        if self.decision.route is Route.DIRECT_ZONE and len(self.residual) >= 3:
            return True
        return False


def analyze_message(message: str) -> RouteAnalysis:
    """The full deterministic analysis (routing evidence included)."""
    decision, zones, residual = _analyze(message)
    return RouteAnalysis(decision, zones, residual)


def route_message(message: str) -> RouteDecision:
    """Route one chat message. Pure — no I/O, no clock, fully deterministic."""
    return _analyze(message)[0]


__all__ = [
    "Route",
    "RouteAnalysis",
    "RouteDecision",
    "Zone",
    "analyze_message",
    "route_message",
]
