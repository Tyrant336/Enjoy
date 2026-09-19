"""Unit tests — deterministic pre-router (FR-0/FR-0.3)."""

import pytest

from app.agents.orchestrator.router import Route, RouteDecision, Zone, route_message


@pytest.mark.parametrize(
    ("message", "zone"),
    [
        ("fishboat", Zone.FISHBOAT),
        ("Fishboat", Zone.FISHBOAT),
        ("take me to the fishboat", Zone.FISHBOAT),
        ("small boat", Zone.SMALL_BOAT),
        ("show me my small boats", Zone.SMALL_BOAT),
        ("flashcards", Zone.SMALL_BOAT),
        ("underwater", Zone.UNDERWATER),
        ("atlas", Zone.UNDERWATER),
        ("dive to the atlas", Zone.UNDERWATER),
        ("journal", Zone.LAMP),
        ("open the lamp", Zone.LAMP),
    ],
)
def test_direct_zone_requests(message: str, zone: Zone) -> None:
    assert route_message(message) == RouteDecision(Route.DIRECT_ZONE, zone)


def test_zone_beats_plan_ask() -> None:
    # "schedule" is a plan-ask word, but naming the fishboat zone wins (FR-0.2:
    # a big task names a topic WITHOUT naming a single zone).
    assert route_message("fishboat schedule") == RouteDecision(
        Route.DIRECT_ZONE, Zone.FISHBOAT
    )


@pytest.mark.parametrize(
    "message",
    [
        "I'm afraid of revising thermodynamics",
        "i am overwhelmed by calculus",
        "thermodynamics",  # topic without a zone
        "help me plan my exam revision",
        "I don't know where to start with physics",
        "make me a study schedule for chemistry",
        "fishboat and lamp",  # two zones ≠ "a single zone"
    ],
)
def test_big_task_detection(message: str) -> None:
    assert route_message(message) == RouteDecision(Route.BIG_TASK, None)


@pytest.mark.parametrize("message", ["hi", "hello", "thanks", "ok", "good morning"])
def test_chitchat_gets_narrate_never_a_plan(message: str) -> None:
    assert route_message(message) == RouteDecision(Route.NARRATE, None)


def test_punctuation_and_case_do_not_change_routing() -> None:
    assert route_message("FISHBOAT!") == RouteDecision(Route.DIRECT_ZONE, Zone.FISHBOAT)
    assert route_message("I'm AFRAID of revising Thermodynamics!!") == RouteDecision(
        Route.BIG_TASK, None
    )


def test_invalid_decisions_are_impossible() -> None:
    with pytest.raises(ValueError):
        RouteDecision(Route.DIRECT_ZONE, None)
    with pytest.raises(ValueError):
        RouteDecision(Route.BIG_TASK, Zone.LAMP)


# ── additions (Agent S, session 018 — gaps only, no duplication) ─────────────


@pytest.mark.parametrize(
    ("message", "zone"),
    [
        ("light buoy", Zone.LAMP),  # multi-word phrase, not bare keywords
        ("knowledge graph", Zone.UNDERWATER),
        ("leader boat", Zone.SMALL_BOAT),
        ("anki", Zone.SMALL_BOAT),
        ("records", Zone.LAMP),
    ],
)
def test_zone_phrases_and_extra_keywords(message: str, zone: Zone) -> None:
    assert route_message(message) == RouteDecision(Route.DIRECT_ZONE, zone)


@pytest.mark.xfail(
    reason="KNOWN GAP (reported to monitor, session 018): 'fat boat' = the "
    "fishboat (REQUIREMENTS §1) but the 'boat' small-boat keyword also hits, "
    "so it routes BIG_TASK — Agent L to fix keyword/phrase precedence",
    strict=True,
)
def test_fat_boat_is_the_fishboat() -> None:
    assert route_message("fat boat") == RouteDecision(Route.DIRECT_ZONE, Zone.FISHBOAT)


def test_ambiguous_fallback_boundary() -> None:
    # P0 documented behavior (FR-0.3): any non-chitchat content IS a topic
    # until the P1 LLM supervisor refines this — never a silent misroute.
    assert route_message("existentialism") == RouteDecision(Route.BIG_TASK, None)
    assert route_message("ok thanks") == RouteDecision(Route.NARRATE, None)
    # chitchat + a content word → big task, not chitchat
    assert route_message("ok thermodynamics") == RouteDecision(Route.BIG_TASK, None)


def test_route_decision_equality_and_repr() -> None:
    assert RouteDecision(Route.BIG_TASK, None) != RouteDecision(
        Route.DIRECT_ZONE, Zone.LAMP
    )
    assert RouteDecision(Route.NARRATE, None) != "narrate"
    assert "big_task" in repr(RouteDecision(Route.BIG_TASK, None))
