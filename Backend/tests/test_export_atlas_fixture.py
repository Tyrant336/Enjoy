"""Tests for scripts/export_atlas_fixture.py — the anti-drift guard (§1.7).

The BE fixture is the one source of truth; the FE atlas fixture is generated
from it. These tests prove the export is exact, deterministic, and that the
committed FE file is in sync RIGHT NOW (so the two can never drift apart
silently).
"""

import json
from pathlib import Path

import pytest

from scripts import export_atlas_fixture as ex


def test_export_matches_fixture_graph_exactly(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "atlas-seed.json"
    monkeypatch.setattr(ex, "TARGET", out)
    ex.main()

    fixture = json.loads(ex.SOURCE.read_text(encoding="utf-8"))
    exported = json.loads(out.read_text(encoding="utf-8"))
    assert exported["_generated"].startswith("GENERATED — do not edit")
    assert exported["nodes"] == fixture["graph"]["nodes"]
    assert exported["links"] == fixture["graph"]["links"]


def test_export_is_deterministic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = tmp_path / "run1.json"
    second = tmp_path / "run2.json"
    monkeypatch.setattr(ex, "TARGET", first)
    ex.main()
    monkeypatch.setattr(ex, "TARGET", second)
    ex.main()
    assert first.read_bytes() == second.read_bytes()


def test_committed_frontend_fixture_is_in_sync() -> None:
    """The checked-in frontend/lib/fixtures/atlas-seed.json matches the source.

    Fails loudly the moment anyone edits one side without regenerating.
    """
    fixture = json.loads(ex.SOURCE.read_text(encoding="utf-8"))
    committed = json.loads(ex.TARGET.read_text(encoding="utf-8"))
    assert committed["nodes"] == fixture["graph"]["nodes"]
    assert committed["links"] == fixture["graph"]["links"]
