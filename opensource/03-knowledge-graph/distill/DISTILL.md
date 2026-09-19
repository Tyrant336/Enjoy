# DISTILL — 03-knowledge-graph → `Backend/` + `frontend/`

## Goal (REQUIREMENTS.md §FR-3)
KG Agent: same inputs as flashcards (PDF/PPTX/DOCX/MD) → keyword/concept nodes +
relation edges → growing underwater "knowledge atlas" (3D, bioluminescent).

## What to extract (per repo)

### `langchain-experimental/` — EXTRACTION (copy 1 module's approach)
- Use `langchain_experimental.graph_transformers.LLMGraphTransformer`
  (`pip install langchain-experimental`; study source in
  `libs/experimental/langchain_experimental/graph_transformers/llm.py`).
- Feed it documents from the **shared Docling loader** (see 02/distill).
- Configure with allowed node/relationship types for study material:
  `nodes: ["Concept","Term","Formula","Process","Example"]`,
  `rels: ["EXPLAINS","PART_OF","REQUIRES","CONTRASTS_WITH","EXAMPLE_OF"]`
- Target: `Backend/app/agents/kg/extract.py` → outputs `GraphDocument`
  → normalize to the FE graph JSON below.
- Configure the LLM via OpenRouter (`ChatOpenAI(base_url="https://openrouter.ai/api/v1", ...)`).

### `nano-graphrag/` — PROMPT REFERENCE
- Read `nano_graphrag/prompt.py` entity/relationship extraction prompts for quality
  improvements to LLMGraphTransformer's default prompt. No framework adoption.

### `LightRAG/` — STRETCH REFERENCE ONLY
- Look at `lightrag/kg/` storage + its webui graph endpoint shape. Do NOT adopt the
  server (too heavy for hackathon). If time allows, its retrieval = bonus "ask the
  atlas questions" feature.

### `KeyBERT/` — FALLBACK (pip install)
- `pip install keybert`. If LLM quota/latency fails: extract top-N keyphrases per
  chunk as nodes; edges = co-occurrence in same chunk. 
- Target: `Backend/app/agents/kg/fallback.py`

### `react-force-graph/` — ❌ REJECTED (project owner decision, REQUIREMENTS v2 §FR-3.4)
- Do NOT use. Underwater rendering is locked to the **three.js atlas engine** in
  `../../07-underwater-atlas/app/src/lib/atlas.js`. This folder is reference only.

## Interfaces the scaffold MUST expose
```
POST /agents/kg/build
  in:  multipart file (pdf|pptx|docx|md|txt)
  out: { "nodes": [...], "edges": [...] }   (merged into the growing atlas)

GET  /agents/kg/graph → full atlas JSON
```

### Graph JSON contract (Backend → Frontend)
```json
{ "nodes": [{ "id": "entropy", "label": "Entropy", "type": "Concept",
              "deck_ids": ["thermo-1"], "task_ids": ["t3"] }],
  "links": [{ "source": "entropy", "target": "2nd-law", "type": "PART_OF" }] }
```
(Field names `nodes`/`links` + `source`/`target` are adapted to the 07 atlas
engine by `frontend/lib/atlasAdapter.ts` — REQUIREMENTS §4.3.)

- Storage note: REQUIREMENTS v2.1 §4.2/§4.5 overrides this — graph persists in
  **PostgreSQL JSONB tables**, not an `atlas.json` file.

## Dependencies to add
- Backend: `langchain-experimental`, `keybert`, `docling` (shared)
- Frontend: `three` only (the 07 atlas engine is copied source, not an npm dep)

## DO NOT take
- Neo4j server, Microsoft GraphRAG pipeline (too heavy), LightRAG server,
  Mermaid/2D renderers, Streamlit UIs.
