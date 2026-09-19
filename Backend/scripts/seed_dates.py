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
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
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
