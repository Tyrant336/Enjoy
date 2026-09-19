# opensource/ — Downloaded Source Code & Assets

Actual cloned code (shallow, `--depth 1`) for the "AI Navigation World" project.
Grouped by agent. Requirements: `../REQUIREMENTS.md`. Re-run `download.sh` to re-fetch.

## 01-scheduler-fishboat/ — 🛳️ Scheduler Agent (goblin.tools-style breakdown)
| Folder | What to take from it |
|---|---|
| `langgraph-plan-and-execute/plan-and-execute.ipynb` | **The fishboat's brain** — official planner→executor→replanner pattern; extend `Plan` to `{title, est_minutes, difficulty, depends_on, scheduled_slot}` |
| `study-revision-planner/` | **Fork the timetable core** — topics + difficulty + exam date → interval sessions (MIT, Flask) |
| `obsidian-magic-tasks/` | The open **Magic ToDo prompt** (goblin.tools clone — goblin itself is closed source) |
| `babyagi/` | Task creation → reprioritization loop prompts |
| `langgraph-supervisor/` | Supervisor if fishboat splits into planner/estimator/judge personas |
| `clive/` | LLM planner → subtask DAG (JSON) + dependency scheduler |

## 02-anki-smallboats/ — ⛵ Flashcard Agent
| Folder | What to take from it |
|---|---|
| `anki-llm-flashcard-generator/` | **FORK THIS** — PDF → semantic chunking → OpenRouter → `.apkg`, ~6 files, our exact stack (MIT) |
| `genanki/` | `.apkg` deck creation library |
| `py-fsrs/` | FSRS scheduling → which boats circle today + Again/Hard/Good/Easy grading |
| `Anki_FlashCard_Generator/` | Chunking + prompt reference (Apache-2.0, 188★) |
| `anki-llm/` | Full LLM↔Anki toolkit design (OpenRouter, AnkiConnect) |
| `md2anki/` | In-browser card review UI reference (GPL — read only) |

## 03-knowledge-graph/ — 🌊 KG extraction (backend only)
| Folder | What to take from it |
|---|---|
| `langchain-experimental/` | **`llm_graph_transformer`** — documents → nodes/edges JSON |
| ~~`react-force-graph/`~~ | ❌ **REJECTED** — kept for reference only; underwater renderer is locked to `07-underwater-atlas` (see REQUIREMENTS v2 §FR-3.4) |
| `LightRAG/` | Graph RAG w/ built-in viz (reference only) |
| `nano-graphrag/` | ~1k-line GraphRAG — lift extraction prompts |
| `KeyBERT/` | Cheap local keyword fallback (no LLM cost) |

## 07-underwater-atlas/ — ⭐ 🌊 Underwater renderer (LOCKED)
| Folder | What to take from it |
|---|---|
| `app/src/lib/atlas.js` | **THE underwater atlas engine** — vanilla three.js + GLSL: GPU-instanced glow nodes, signal-flow edges, cluster-anchored sphere layout, select-to-dim, BFS paths. Mount in `frontend/components/underwater/AtlasLayer.tsx` per REQUIREMENTS §4.3 |
| `app/README.md`, `app/info.md` | Data format (`CLUSTERS`/`NODES`/`EDGES`) + engine constraints (40–300 nodes, avg degree 3.5–5, additive blending = dark theme only). Keep attribution comments when copying |

## 04-orchestrator/ — 🧭 Orchestrator / Narrator
| Folder | What to take from it |
|---|---|
| `fastapi-langgraph-template/` | **Backend skeleton** — FastAPI + LangGraph + streaming |
| `langgraph-swarm/` | Decentralized agent handoffs (low latency) |
| `kokoro/` | OSS TTS (Apache-2.0) for the narrator's voice |
| `faster-whisper/` | OSS STT (MIT) for voice input |

## 05-frontend-world/ — 🎨 World Rendering
| Folder | What to take from it |
|---|---|
| `stylized-water/` | **The pastel cartoon ocean** (MIT, R3F shaders + tutorial) |
| `WaterThreeJS/` | Above→underwater dive: godrays, caustics, marine snow |
| `three-good-godrays/` | Underwater light shafts (lamp/sun) |
| `irregular_grid/` | Townscaper's irregular grid reimplemented (Three.js) |
| `camera-controls/` | **`setLookAt(..., true)`** — the orchestrator's camera fly-to |
| `THREE-CustomShaderMaterial/` | Custom toon/outline shaders |

## 06-assets-cc0/ — 🧱 3D Models (LOCKED — final assets only)
| File | Use as |
|---|---|
| ⭐ `fishboat.glb` (custom-built, `build_hero_models.py`) | **🛳️ THE fishboat** — plump steam trawler, cream/charcoal, palette-exact |
| ⭐ `lamp-buoy.glb` (custom-built) | **🏮 THE lamp** — floating light buoy w/ lattice tower + warm lantern (matches Background) |
| `smallboat.glb` (Kenney boat-sail-b, CC0) | **⛵ small boats** — fleet + 4 grade boats |
| `hero.blend`, `hero_preview.png` | Blender source + quick-look render |

All three are already copied to **`frontend/public/models/`** — ready for `useGLTF()`.
Unused candidates (tugs, sail-a, street light, Kenney packs) were deleted.
