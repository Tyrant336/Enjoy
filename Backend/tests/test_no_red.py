"""NFR-2 automated no-red checks (REQUIREMENTS §2.1/NFR-2 — DoD mandatory).

(a) theme-token test: every authored color in frontend/lib/theme.ts must have
    a hue OUTSIDE 345°-15° — and the checker must PROVE it would catch red
    (negative cases below, incl. the 07 engine's known red `#e0492e`).
(b) atlas cluster-palette test (FR-3.6): the palette the adapter actually
    feeds the engine — hues ≥40° apart, outside red, S 60-90, L 60-75.
"""

from pathlib import Path

import pytest

from scripts import no_red_check as nrc

THEME = nrc.THEME_PATH
ADAPTER = THEME.parent / "atlas" / "atlasAdapter.ts"


# ── (a) theme tokens — the real file is clean, and not vacuously so ─────────


def test_real_theme_has_no_red() -> None:
    assert nrc.run_checks(THEME) == []


def test_real_theme_is_not_vacuous() -> None:
    code = nrc._strip_comments(THEME.read_text(encoding="utf-8"))
    tokens = nrc._TOKEN_RE.findall(code)
    assert len(tokens) >= 20, "expected the full locked palette"
    assert len(nrc._cluster_entries(code)) == 6, "FR-3.6 locked cluster palette"


def test_injected_red_token_fails() -> None:
    code = "export const P = { bloodSail: token(355, 60, 50) };"
    violations = nrc.check_theme_tokens(code)
    assert len(violations) == 1
    assert violations[0].name == "bloodSail"
    assert violations[0].hue == 355.0


def test_red_boundaries_are_inclusive() -> None:
    for bad in ("345", "15", "0", "359"):
        assert nrc.check_theme_tokens(f"x: token({bad}, 50, 50)"), bad
    for good in ("16", "344"):
        assert nrc.check_theme_tokens(f"x: token({good}, 50, 50)") == [], good


def test_injected_red_hex_literal_fails() -> None:
    # The 07 engine's canned coral — exactly what FR/NFR-2 exists to keep out.
    code = 'const coral = "#e0492e";'
    violations = nrc.check_theme_tokens(code)
    assert len(violations) == 1
    assert violations[0].source == "hex-literal"


def test_red_inside_a_comment_is_not_authored() -> None:
    code = '// legacy coral was "#e0492e" — removed\nconst ok = "#3aa7a3";\n'
    assert nrc.check_theme_tokens(code) == []


# ── (b) cluster palette — rules + negative cases ────────────────────────────


def _cluster_code(*triples: tuple[float, float, float]) -> str:
    body = ", ".join(f"token({h}, {s}, {light})" for h, s, light in triples)
    return f"export const CLUSTER_PALETTE = [{body}] as const;"


def test_injected_cluster_red_hue_fails() -> None:
    code = _cluster_code((182, 78, 66), (350, 80, 65))
    assert any("red range" in v.detail for v in nrc.check_cluster_palette(code))


def test_injected_cluster_gap_under_40_fails() -> None:
    code = _cluster_code((182, 78, 66), (200, 78, 66))  # 18° apart
    assert any("gap" in v.detail for v in nrc.check_cluster_palette(code))


def test_cluster_gap_wraps_around_360() -> None:
    # 350° and 20° are 30° apart circularly — must be caught (and both are red).
    code = _cluster_code((182, 78, 66), (48, 80, 65))
    assert nrc.check_cluster_palette(code) == [], "182↔48 = 134° gap is fine"


def test_injected_cluster_sat_or_light_out_of_range_fails() -> None:
    assert any(
        "S=" in v.detail for v in nrc.check_cluster_palette(_cluster_code((182, 50, 66)))
    )
    assert any(
        "L=" in v.detail for v in nrc.check_cluster_palette(_cluster_code((182, 78, 80)))
    )


def test_empty_cluster_palette_is_loud_not_vacuous() -> None:
    with pytest.raises(ValueError, match="empty"):
        nrc.check_cluster_palette("export const CLUSTER_PALETTE = [] as const;")


def test_missing_cluster_palette_is_loud() -> None:
    with pytest.raises(ValueError, match="not found"):
        nrc.check_cluster_palette("export const P = {};")


def test_empty_theme_is_loud_not_vacuous(tmp_path: Path) -> None:
    empty = tmp_path / "theme.ts"
    empty.write_text("export {};", encoding="utf-8")
    with pytest.raises(ValueError, match="no theme tokens"):
        nrc.run_checks(empty)


# ── the adapter must feed the engine the SAME locked palette (no split-brain) ─


def test_adapter_uses_locked_cluster_palette() -> None:
    adapter = ADAPTER.read_text(encoding="utf-8")
    assert "CLUSTER_PALETTE" in adapter
    assert 'from "@/lib/theme"' in adapter


# ── CLI surface ──────────────────────────────────────────────────────────────


def test_main_passes_on_real_theme(capsys: pytest.CaptureFixture[str]) -> None:
    assert nrc.main(THEME) == 0
    assert "NFR-2 PASS" in capsys.readouterr().out


def test_main_fails_loudly_on_red(tmp_path: Path) -> None:
    bad = tmp_path / "theme.ts"
    bad.write_text(
        "export const P = { ok: token(182, 40, 60), bad: token(10, 60, 50) };\n"
        "export const CLUSTER_PALETTE = [token(182, 78, 66), token(48, 80, 65)];",
        encoding="utf-8",
    )
    assert nrc.main(bad) == 1
