"""E2E — REQUIREMENTS §8 demo script, expressed as tests (AGENTS.md §6.3).

STATUS (session 015, Phase 1): skeleton — started early per BUILDING §3.
- Steps whose endpoints already exist run FOR REAL now.
- Seeded steps use `seeded_user_id`: they self-activate the moment Agent L's
  seed loader is fixed (FK flush-ordering bug, reported in
  docs/sessions/014 — until then they ERROR, loudly, never silently green).
- Steps awaiting Phase 2 endpoints are skip-marked with the exact contract
  they wait for. A skip here is a phase gate, not a dead switch: each one
  names the endpoint that removes it.

Inherently visual/FE steps (palette §2.4, dive animation, keyboard-only
review, reduced-motion) are asserted by Agent T's exit tests + the monitor's
Phase 3 visual pass, not from pytest — noted per step below.
"""

import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from app.schemas import KnowledgeGraph, WorldState

# ── §8.1 — services start; seeded world state is complete and consistent ────
# (Visual half — fishboat/lamp/fleet render, palette §2.4 — is Agent T's.)


async def test_step1_seeded_harbour_state(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/api/world-state", headers={"X-Harbour-User-Id": seeded_user_id}
    )
    assert resp.status_code == 200
    state = WorldState.model_validate(resp.json())

    # §8.1: "Harbour overview renders fishboat, lamp, ≥1 circling due deck,
    # 1 docked deck" — the backend half of that sentence.
    assert state.active_plan is not None and state.active_plan.id == "plan-seed-01"
    circling = [d for d in state.decks if d.boat_state == "circle"]
    docked = [d for d in state.decks if d.boat_state == "docked"]
    assert len(circling) >= 1, "≥1 circling due deck (the review queue)"
    assert len(docked) >= 1, "1 docked completed deck at the lamp"
    assert all(d.due_today > 0 for d in circling)
    assert 0.0 < state.lamp_glow_level <= 1.0, "lamp has its base glow (FR-4.4)"
    assert 40 <= state.graph_summary.node_count <= 80  # §4.6 atlas size


# ── §8.2 — big task → warm ack + tour OFFER (never forced) ──────────────────


@pytest.mark.skip(reason="awaiting Phase 2 endpoint POST /api/chat (Agent L)")
async def test_step2_big_task_offers_tour_never_forced() -> None:
    raise AssertionError("unreachable while skipped")


# ── §8.3/8.7 — review loop; keyboard-only completion is the FE half (T) ─────


@pytest.mark.skip(
    reason="awaiting Phase 2 endpoints review/reveal|grade|exit (Agent L); "
    "keyboard 1-4/Esc path is FE (Agent T + monitor §8.7 pass)"
)
async def test_step3_review_loop_persists_grades() -> None:
    raise AssertionError("unreachable while skipped")


# ── §8.4 — deck completion docks at lamp + journal record (one transaction) ──


@pytest.mark.skip(reason="awaiting Phase 2 review/grade endpoint (Agent L, §5.3)")
async def test_step4_deck_completion_docks_records_glows() -> None:
    raise AssertionError("unreachable while skipped")


# ── §8.5 — atlas serves the seeded graph (rendering is Agent T's half) ──────


async def test_step5_atlas_serves_seeded_graph(
    client: AsyncClient, seeded_user_id: str
) -> None:
    resp = await client.get(
        "/agents/kg/graph", headers={"X-Harbour-User-Id": seeded_user_id}
    )
    assert resp.status_code == 200
    graph = KnowledgeGraph.model_validate(resp.json())
    assert 40 <= len(graph.nodes) <= 80
    assert {n.cluster_id for n in graph.nodes} == {
        "deck-thermo-1",
        "deck-thermo-basics",
    }
    assert all(n.gloss.strip() for n in graph.nodes), "FR-3.5 detail-drawer gloss"
    # §2.4/NFR-2 color compliance is checked on the rendered side (Agent T).


# ── §8.6 — direct-zone requests route to one zone, never offer a tour ───────


@pytest.mark.skip(reason="awaiting Phase 2 pre-router + POST /api/chat (Agent L)")
async def test_step6_direct_zone_requests_never_offer_tour() -> None:
    raise AssertionError("unreachable while skipped")


# ── §8.8 — missing OpenRouter key = loud startup crash, never a fake world ──


def test_step8_missing_openrouter_key_crashes_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import Settings

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ValidationError, match="openrouter_api_key"):
        # _env_file=None: prove the crash even without the repo-root .env.
        Settings(_env_file=None)  # type: ignore[call-arg]
