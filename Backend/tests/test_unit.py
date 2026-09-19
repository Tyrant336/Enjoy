"""Unit tests — pure logic, no DB, no harness (runnable immediately).

DB-backed API/seed tests live in test_api.py and require Agent S's pytest
harness (conftest) — see that module's docstring.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.errors import AppError
from app.schemas import ErrorEnvelope
from app.services.world_state import LAMP_GLOW_PER_RECORD, _end_of_local_today
from scripts.seed import SEED_EVENT_ID, load_fixture

# ── due-horizon math (drives dueToday / the circle, FR-2.4) ──────────────────


def test_end_of_local_today_is_next_local_midnight_in_utc() -> None:
    # 2026-09-19 13:00 UTC = 21:00 in Asia/Shanghai (+08:00).
    now = datetime(2026, 9, 19, 13, 0, tzinfo=UTC)
    horizon = _end_of_local_today(now, "Asia/Shanghai")
    # Next Shanghai midnight = 2026-09-20 00:00 +08:00 = 2026-09-19 16:00 UTC.
    assert horizon == datetime(2026, 9, 19, 16, 0, tzinfo=UTC)


def test_end_of_local_today_differs_across_timezones() -> None:
    # Same instant, different local day boundary. The horizon is always the
    # NEXT local midnight, so it is always in the future; Shanghai's local
    # day ends 7h earlier (in UTC) than London's (September, BST vs +08:00).
    now = datetime(2026, 9, 19, 23, 30, tzinfo=UTC)
    shanghai = _end_of_local_today(now, "Asia/Shanghai")
    london = _end_of_local_today(now, "Europe/London")
    assert now < shanghai < london
    assert london - shanghai == timedelta(hours=7)


# ── lamp glow (FR-4.4: increments with records, capped) ──────────────────────


def test_lamp_glow_formula_is_subtle_and_capped() -> None:
    assert LAMP_GLOW_PER_RECORD <= 0.2  # subtle
    # 3 seeded records -> gentle base glow, well under the cap.
    assert min(1.0, 3 * LAMP_GLOW_PER_RECORD) < 0.5
    # Cap holds for a long journal.
    assert min(1.0, 500 * LAMP_GLOW_PER_RECORD) == 1.0


# ── fixture loader boundary (AGENTS.md §2.4 — loud, never invents data) ──────


def test_missing_fixture_file_crashes_loudly(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="SEED FIXTURE MISSING"):
        load_fixture(tmp_path / "does-not-exist.json")


def test_garbage_fixture_is_a_hard_validation_error(tmp_path: Path) -> None:
    bad = tmp_path / "seed_data.json"
    bad.write_text('{"user": {"id": "x"}, "decks": "not-a-list"}', encoding="utf-8")
    with pytest.raises(ValidationError):
        load_fixture(bad)


def test_seed_event_id_is_stable() -> None:
    # The SSE stub exit test greps for this event; it must never drift.
    assert SEED_EVENT_ID == "evt-seed-narrate-01"


# ── §5.2 error envelope shape ────────────────────────────────────────────────


def test_app_error_serializes_to_the_envelope() -> None:
    err = AppError(400, "MISSING_USER_ID", "header required", recoverable=True)
    envelope = ErrorEnvelope(
        code=err.code,
        message=err.message,
        detail=err.detail,
        recoverable=err.recoverable,
    )
    assert envelope.model_dump(mode="json", by_alias=True) == {
        "code": "MISSING_USER_ID",
        "message": "header required",
        "detail": None,
        "recoverable": True,
    }
