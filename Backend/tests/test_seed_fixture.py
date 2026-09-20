"""Validate the §4.6 seed fixture against the FROZEN contracts + spec limits.

The fixture (`scripts/fixtures/seed_data.json`) is THE one source of truth for
P0 seed content. These tests parse it against the frozen Pydantic schemas
(`app/schemas.py`) and assert every constraint in REQUIREMENTS §4.6/§5.1, so a
broken fixture fails loudly here — never inside Agent L's seed run.
"""

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from app.schemas import Deck, Flashcard, KnowledgeGraph, Record, StudyPlan
from scripts.seed_dates import resolve_fixture, resolve_natural_date, resolve_token

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "fixtures" / "seed_data.json"
)

TODAY = date.today()


@pytest.fixture(scope="module")
def raw() -> Any:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def resolved(raw: Any) -> Any:
    return resolve_fixture(raw)


# ── §4.6.1 — Thermodynamics plan ─────────────────────────────────────────────


def test_plan_matches_spec(resolved: Any) -> None:
    plan = StudyPlan.model_validate(resolved["plan"])
    assert plan.id == "plan-seed-01"
    assert plan.empathy_line.strip(), "empathy line required (FR-1.1)"
    assert 1 <= plan.granularity <= 5
    assert len(plan.tasks) == 4

    scheduled_today = [t for t in plan.tasks if t.scheduled_for == TODAY]
    done = [t for t in plan.tasks if t.status == "done"]
    upcoming = [
        t
        for t in plan.tasks
        if t.scheduled_for is not None and t.scheduled_for > TODAY
    ]
    assert len(scheduled_today) == 2, "exactly 2 tasks scheduled today"
    assert len(done) == 1, "exactly 1 done task"
    assert len(upcoming) == 1, "exactly 1 upcoming task"

    deck_requests = [t for t in plan.tasks if t.deck_request and t.deck_request.requested]
    assert len(deck_requests) == 1
    assert deck_requests[0].deck_request is not None
    assert deck_requests[0].deck_request.topic == "Thermodynamic laws"

    for task in plan.tasks:
        assert task.estimate_minutes <= 45, f"{task.id} exceeds 45 min (FR-1.1)"
        assert 1 <= task.difficulty <= 5
        for dependency in task.depends_on:
            assert dependency in {t.id for t in plan.tasks}


# ── §4.6.2/3 — decks and the 3-card review deck ─────────────────────────────


def test_decks_match_spec(resolved: Any) -> None:
    decks = {d.id: d for d in (Deck.model_validate(d) for d in resolved["decks"])}
    assert set(decks) == {"deck-thermo-1", "deck-thermo-basics"}

    thermo_1 = decks["deck-thermo-1"]
    assert thermo_1.name == "Thermo 1"
    assert thermo_1.boat_state == "circle"
    assert thermo_1.card_count == 3 and thermo_1.due_today == 3

    basics = decks["deck-thermo-basics"]
    assert basics.name == "Thermo Basics"
    assert basics.boat_state == "docked"
    assert basics.due_today == 0


def test_thermo_1_has_exactly_three_due_new_cards(resolved: Any) -> None:
    cards = [Flashcard.model_validate(c) for c in resolved["cards"]]
    assert len(cards) == 3, "EXACTLY 3 cards (drives the keyboard E2E review)"
    for card in cards:
        assert card.deck_id == "deck-thermo-1"
        assert len(card.question.split()) <= 25, f"{card.id} question >25 words"
        assert len(card.answer.split()) <= 40, f"{card.id} answer >40 words"
        assert card.due.date() == TODAY, f"{card.id} must be due today"
        assert card.fsrs_state.state == "new"
        assert card.fsrs_state.reps == 0


# ── §4.6.4 — atlas (40-80 nodes, 2 clusters, avg degree 3.5-5) ───────────────


def test_graph_matches_spec(resolved: Any) -> None:
    graph = KnowledgeGraph.model_validate(resolved["graph"])
    assert 40 <= len(graph.nodes) <= 80

    clusters = {n.cluster_id for n in graph.nodes}
    assert clusters == {"deck-thermo-1", "deck-thermo-basics"}

    node_ids = {n.id for n in graph.nodes}
    assert len(node_ids) == len(graph.nodes), "node ids must be unique"
    degree = dict.fromkeys(node_ids, 0)
    for link in graph.links:
        assert link.source in node_ids, f"dangling edge source {link.source}"
        assert link.target in node_ids, f"dangling edge target {link.target}"
        degree[link.source] += 1
        degree[link.target] += 1
    avg_degree = 2 * len(graph.links) / len(graph.nodes)
    assert 3.5 <= avg_degree <= 5, f"avg degree {avg_degree:.2f} outside §4.3 limits"
    assert min(degree.values()) >= 2, "no near-isolated nodes in the star map"

    task_ids = {t.id for t in StudyPlan.model_validate(resolved["plan"]).tasks}
    for node in graph.nodes:
        assert node.gloss.strip(), f"{node.id} needs a one-line gloss (FR-3.5)"
        assert set(node.deck_ids) <= clusters
        assert set(node.task_ids) <= task_ids


# ── seed user + seeded narration (loader-level sections) ─────────────────────


def test_user_and_seed_narration_sections(raw: Any) -> None:
    from zoneinfo import ZoneInfo

    user = raw["user"]
    assert user["id"] == "user-seed-01", "fixed seed user id (tests target it)"
    ZoneInfo(user["timezone"])  # raises ZoneInfoNotFoundError if not IANA
    assert isinstance(user["prefs"], dict)

    narration = raw["seedNarration"]
    assert narration.strip(), "seeded narrate event needs text (SSE stub)"
    assert len(narration) <= 300, "narration stays concise (FR-5.5)"


# ── §4.6.3/5 — records: the docked deck's record + 3 historical entries ──────


def test_records_match_spec(resolved: Any) -> None:
    records = [Record.model_validate(r) for r in resolved["records"]]
    assert len(records) == 4, "deck_completed record + 3 historical entries"

    deck_record = next(
        r for r in records if r.kind == "deck_completed" and r.id == "rec-seed-01"
    )
    assert deck_record.ref_id == "deck-thermo-basics"
    assert deck_record.title == "Thermo Basics"

    now = datetime.now().astimezone()
    for record in records:
        assert record.at <= now, f"{record.id} must be in the past"
        assert record.at.date() < TODAY, f"{record.id} must be on a past day"


# ── date-token convention: documented + used consistently ────────────────────


def test_date_tokens_are_documented_and_consistent(raw: Any) -> None:
    convention = raw["_meta"]["relativeDateConvention"]
    assert "NOW" in convention and "TODAY" in convention

    token = r"^(NOW|TODAY)([+-]\d+d)?$"
    for task in raw["plan"]["tasks"]:
        assert task["scheduledFor"] is None or re.match(token, task["scheduledFor"]), task
    for card in raw["cards"]:
        assert re.match(token, card["due"]), card
    for record in raw["records"]:
        assert re.match(token, record["at"]), record


def test_resolve_token_units() -> None:
    fixed = datetime(2026, 9, 19, 12, 0).astimezone()
    assert resolve_token("NOW", fixed) == fixed
    assert resolve_token("NOW-2d", fixed) == fixed.replace(day=17)
    assert resolve_token("TODAY", fixed) == date(2026, 9, 19)
    assert resolve_token("TODAY+1d", fixed) == date(2026, 9, 20)
    assert resolve_token("plain text", fixed) == "plain text"
    assert resolve_token(42, fixed) == 42
    with pytest.raises(ValueError, match="Malformed seed date token"):
        resolve_token("NOW-3h", fixed)


# ── natural-language deadline phrases (P1, D2 — wired into the planner) ──────


@pytest.mark.parametrize(
    ("text", "expected_days"),
    [
        ("calculus exam in 5 days", 5),
        ("in 1 day", 1),
        ("due in 2 weeks", 14),
        ("in 3 months", 90),
        ("in a week", 7),
        ("in a month", 30),
        ("tomorrow", 1),
        ("organic chemistry midterm next month", 30),
        ("next week", 7),
        ("Exam IN 5 DAYS!", 5),  # case-insensitive
    ],
)
def test_resolve_natural_date(text: str, expected_days: int) -> None:
    today = date(2026, 9, 19)
    assert resolve_natural_date(text, today) == today + timedelta(days=expected_days)


@pytest.mark.parametrize(
    "text",
    [
        "no date mentioned at all",
        "revise thermodynamics",
        "daily practice",  # "day" substring must not false-positive
    ],
)
def test_resolve_natural_date_returns_none_without_a_phrase(text: str) -> None:
    assert resolve_natural_date(text, date(2026, 9, 19)) is None
