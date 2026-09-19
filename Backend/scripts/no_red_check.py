"""NFR-2 no-red palette checker — THE automated §2.1/NFR-2 guard.

Checks `frontend/lib/theme.ts` (the LOCKED palette, single source):
1. **Theme tokens** — every authored color (``name: token(h, s, l)`` calls,
   plus any hex/rgb(a) literals in code) has its normalized hue computed and
   is REJECTED if it lies in the forbidden red range 345°-15° (named in the
   violation — fail loudly, never silently pass).
2. **Atlas cluster palette** (FR-3.6) — every ``CLUSTER_PALETTE`` entry:
   hue outside 345°-15°, S in 60-90, L in 60-75, and pairwise circular hue
   distance ≥40°.

Parsing is AST-lite: a small comment/string-aware stripper produces the code
text, then keyed patterns extract named tokens. It never trusts position
alone — violations always carry the token name and hue.

Run (from Backend/):  python scripts/no_red_check.py   (exit 1 = red found)
Also runs in the pytest suite via tests/test_no_red.py.
"""

from __future__ import annotations

import colorsys
import re
import sys
from dataclasses import dataclass
from pathlib import Path

THEME_PATH = (
    Path(__file__).resolve().parents[2] / "frontend" / "lib" / "theme.ts"
)

# Forbidden red range (REQUIREMENTS §2.1 — hue 345°-15° inclusive).
RED_MIN, RED_MAX = 345.0, 15.0
# FR-3.6 cluster palette bounds.
CLUSTER_S_RANGE = (60.0, 90.0)
CLUSTER_L_RANGE = (60.0, 75.0)
CLUSTER_MIN_HUE_GAP = 40.0

_TOKEN_RE = re.compile(
    r"(\w+)\s*:\s*token\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)"
)
_HEX_RE = re.compile(r"#([0-9a-fA-F]{6})\b")
_RGB_RE = re.compile(r"\brgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)")


@dataclass(frozen=True)
class Violation:
    source: str  # e.g. "theme-token", "cluster-palette", "hex-literal"
    name: str
    hue: float
    detail: str


def is_forbidden_red(hue: float) -> bool:
    """Mirror of theme.ts `isForbiddenRed` — keep the two in lockstep."""
    h = ((hue % 360) + 360) % 360
    return h >= RED_MIN or h <= RED_MAX


def hue_from_rgb(r: int, g: int, b: int) -> float:
    return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[0] * 360


def _strip_comments(text: str) -> str:
    """Remove // and /* */ comments, preserving string literals and newlines."""
    out: list[str] = []
    i, n = 0, len(text)
    in_block = in_line = False
    in_string: str | None = None
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if in_line:
            if ch == "\n":
                in_line = False
                out.append(ch)
        elif in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                i += 1
        elif in_string:
            out.append(ch)
            if ch == in_string:
                in_string = None
        elif ch == "/" and nxt == "/":
            in_line = True
            i += 1
        elif ch == "/" and nxt == "*":
            in_block = True
            i += 1
        else:
            out.append(ch)
            if ch in "\"'`":
                in_string = ch
        i += 1
    return "".join(out)


def check_theme_tokens(text: str) -> list[Violation]:
    """Named ``token(h, s, l)`` calls + hex/rgb literals with a red hue."""
    code = _strip_comments(text)
    violations: list[Violation] = []
    for name, h, _s, _l in _TOKEN_RE.findall(code):
        hue = float(h)
        if is_forbidden_red(hue):
            violations.append(
                Violation("theme-token", name, hue, "hue in red range 345°-15°")
            )
    for hex_lit in _HEX_RE.findall(code):
        hue = hue_from_rgb(*[int(hex_lit[i : i + 2], 16) for i in (0, 2, 4)])
        if is_forbidden_red(hue):
            violations.append(
                Violation("hex-literal", f"#{hex_lit}", hue, "hue in red range")
            )
    for r, g, b in _RGB_RE.findall(code):
        hue = hue_from_rgb(int(r), int(g), int(b))
        if is_forbidden_red(hue):
            violations.append(
                Violation("rgb-literal", f"rgb({r},{g},{b})", hue, "hue in red range")
            )
    return violations


def _cluster_entries(code: str) -> list[tuple[float, float, float]]:
    """The HSL triples inside the CLUSTER_PALETTE array (AST-lite)."""
    marker = code.find("CLUSTER_PALETTE")
    if marker == -1:
        raise ValueError("CLUSTER_PALETTE not found — the file drifted from the contract")
    # Find the array AFTER the "=" — the type annotation `readonly Token[]`
    # contains brackets that must not be mistaken for the array literal.
    equals = code.find("=", marker)
    start = code.find("[", equals)
    depth, i = 1, start + 1
    while depth > 0:
        if code[i] == "[":
            depth += 1
        elif code[i] == "]":
            depth -= 1
        i += 1
    body = code[start:i]
    return [
        (float(h), float(s), float(light))
        for h, s, light in re.findall(
            r"token\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)", body
        )
    ]


def check_cluster_palette(text: str) -> list[Violation]:
    """FR-3.6: no red hues, S 60-90, L 60-75, pairwise hue gap ≥40°."""
    code = _strip_comments(text)
    violations: list[Violation] = []
    entries = _cluster_entries(code)
    if not entries:
        raise ValueError("CLUSTER_PALETTE is empty — vacuous pass is a failure (§2)")
    hues: list[float] = []
    for index, (h, s, light) in enumerate(entries):
        name = f"cluster[{index}]"
        hues.append(h)
        if is_forbidden_red(h):
            violations.append(
                Violation("cluster-palette", name, h, "hue in red range 345°-15°")
            )
        if not CLUSTER_S_RANGE[0] <= s <= CLUSTER_S_RANGE[1]:
            violations.append(
                Violation("cluster-palette", name, h, f"S={s} outside 60-90 (FR-3.6)")
            )
        if not CLUSTER_L_RANGE[0] <= light <= CLUSTER_L_RANGE[1]:
            violations.append(
                Violation("cluster-palette", name, h, f"L={light} outside 60-75 (FR-3.6)")
            )
    for i, hue_a in enumerate(hues):
        for j in range(i + 1, len(hues)):
            gap = abs(hue_a - hues[j])
            gap = min(gap, 360.0 - gap)  # circular distance
            if gap < CLUSTER_MIN_HUE_GAP:
                violations.append(
                    Violation(
                        "cluster-palette",
                        f"cluster[{i}]↔cluster[{j}]",
                        hue_a,
                        f"hue gap {gap:.1f}° < 40° (FR-3.6)",
                    )
                )
    return violations


def run_checks(theme_path: Path = THEME_PATH) -> list[Violation]:
    """All NFR-2 checks against one theme file. Raises if it reads nothing."""
    text = theme_path.read_text(encoding="utf-8")
    if not _TOKEN_RE.findall(_strip_comments(text)):
        raise ValueError(
            f"no theme tokens found in {theme_path} — a vacuous pass is a failure (§2)"
        )
    return check_theme_tokens(text) + check_cluster_palette(text)


def main(theme_path: Path = THEME_PATH) -> int:
    violations = run_checks(theme_path)
    if violations:
        print(f"NFR-2 FAIL — {len(violations)} red-range violation(s) in {theme_path}:")
        for v in violations:
            print(f"  [{v.source}] {v.name}: hue {v.hue:.1f}° — {v.detail}")
        return 1
    print(f"NFR-2 PASS — no authored hue in 345°-15° ({theme_path})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
