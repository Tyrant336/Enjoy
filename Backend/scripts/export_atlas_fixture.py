"""Export the atlas portion of the §4.6 seed fixture for the frontend.

ONE source of truth (AGENTS.md §1.7 — no split-brain):
`Backend/scripts/fixtures/seed_data.json`. This script copies its `graph`
section verbatim into `frontend/lib/fixtures/atlas-seed.json`, which feeds
Agent T's AtlasLayer (REQUIREMENTS §4.3). The output is deterministic —
regenerate after any fixture change; never edit the output by hand.

Run from `Backend/`:

    python scripts/export_atlas_fixture.py
"""

import json
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
SOURCE = _BACKEND_DIR / "scripts" / "fixtures" / "seed_data.json"
TARGET = _BACKEND_DIR.parent / "frontend" / "lib" / "fixtures" / "atlas-seed.json"

_HEADER = (
    "GENERATED — do not edit. Produced by Backend/scripts/export_atlas_fixture.py "
    "from Backend/scripts/fixtures/seed_data.json (the one source of truth, "
    "REQUIREMENTS §4.6). Regenerate, never hand-edit."
)


def main() -> None:
    fixture = json.loads(SOURCE.read_text(encoding="utf-8"))
    # Missing keys → KeyError with context: a broken fixture fails loudly (§2).
    graph = fixture["graph"]
    output = {
        "_generated": _HEADER,
        "nodes": graph["nodes"],
        "links": graph["links"],
    }
    TARGET.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {TARGET} ({len(graph['nodes'])} nodes, {len(graph['links'])} links)")


if __name__ == "__main__":
    main()
