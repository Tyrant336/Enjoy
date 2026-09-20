"""Relative date tokens for seed fixtures — THE one resolver (AGENTS.md §3.1).

The §4.6 fixture (`scripts/fixtures/seed_data.json`) stores dates as tokens
relative to the real clock at seed-run (convention documented in the fixture's
`_meta.relativeDateConvention`). This module is the ONLY place that resolves
them: `scripts/seed.py` (Agent L) and the fixture validator
(`tests/test_seed_fixture.py`) both import from here — no second
implementation may appear (split-brain is a critical defect, §1.7).

Convention:
- ``NOW``, ``NOW-3d``, ``NOW+1d``      → timezone-aware local datetime (±N*24h)
- ``TODAY``, ``TODAY-1d``, ``TODAY+2d`` → local calendar date (±N days)

Whole-string match only: a string that merely *contains* a token is data and
passes through untouched. A string that looks like a token but is malformed
(e.g. ``"NOW-3h"``) raises — fail loudly, never guess (AGENTS.md §2).

P1 addition: ``resolve_natural_date`` — THE one resolver for deadline phrases
in free-text chat ("in 5 days", "next month"), wired into the scheduler
planner (FR-1.1; fixes eval defect D2, session 025).
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

_TOKEN = re.compile(r"^(NOW|TODAY)(?:([+-]\d+)d)?$")
_TOKEN_PREFIXES = ("NOW", "TODAY")


def resolve_token(value: object, now: datetime | None = None) -> object:
    """Resolve one fixture value.

    Non-strings and strings that are not whole-string tokens pass through
    unchanged. Returns `datetime` for NOW tokens, `date` for TODAY tokens.
    Raises `ValueError` for malformed token lookalikes.
    """
    if not isinstance(value, str):
        return value
    match = _TOKEN.fullmatch(value)
    if match is None:
        if value.startswith(_TOKEN_PREFIXES):
            raise ValueError(
                f"Malformed seed date token: {value!r} "
                "(expected 'NOW[±Nd]' or 'TODAY[±Nd]', e.g. 'NOW', 'NOW-2d', 'TODAY+1d')"
            )
        return value
    now = now if now is not None else datetime.now().astimezone()
    base, offset = match.group(1), match.group(2)
    resolved = now + timedelta(days=int(offset)) if offset else now
    if base == "NOW":
        return resolved
    return resolved.date()


def resolve_fixture(data: Any, now: datetime | None = None) -> Any:
    """Deep-walk parsed fixture JSON, resolving every date token.

    Returns a new structure; the input is not mutated. One `now` is used for
    the whole walk so every token in a fixture resolves against the same
    instant.
    """
    now = now if now is not None else datetime.now().astimezone()
    if isinstance(data, dict):
        return {key: resolve_fixture(item, now) for key, item in data.items()}
    if isinstance(data, list):
        return [resolve_fixture(item, now) for item in data]
    return resolve_token(data, now)


# ── Natural-language deadline phrases (P1, FR-1.1/D2) ────────────────────────
# THE one phrase resolver — wired into the scheduler planner so chat like
# "calculus exam in 5 days" sizes the schedule to the deadline. Months are
# approximated as 30 days (documented approximation — a planning hint, not a
# calendar promise). Returns None when no phrase matches: an explicit
# "no deadline mentioned", never a guessed default.

_NL_PATTERNS: tuple[tuple[re.Pattern[str], int], ...] = (
    # (pattern, days per unit)
    (re.compile(r"\bin\s+(\d+)\s+days?\b", re.IGNORECASE), 1),
    (re.compile(r"\bin\s+(\d+)\s+weeks?\b", re.IGNORECASE), 7),
    (re.compile(r"\bin\s+(\d+)\s+months?\b", re.IGNORECASE), 30),
    (re.compile(r"\bin\s+a\s+day\b", re.IGNORECASE), 1),
    (re.compile(r"\bin\s+a\s+week\b", re.IGNORECASE), 7),
    (re.compile(r"\bin\s+a\s+month\b", re.IGNORECASE), 30),
)


def resolve_natural_date(text: str, today: date) -> date | None:
    """Resolve the FIRST deadline phrase in free text to a date, or None.

    Recognized: "in N days/weeks/months", "in a day/week/month",
    "tomorrow", "next week", "next month".
    """
    for pattern, unit_days in _NL_PATTERNS:
        match = pattern.search(text)
        if match:
            amount = int(match.group(1)) if match.groups() else 1
            return today + timedelta(days=amount * unit_days)
    lowered = text.lower()
    if re.search(r"\btomorrow\b", lowered):
        return today + timedelta(days=1)
    if re.search(r"\bnext week\b", lowered):
        return today + timedelta(days=7)
    if re.search(r"\bnext month\b", lowered):
        return today + timedelta(days=30)
    return None
