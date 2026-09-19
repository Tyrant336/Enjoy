# DISTILL — 02-anki-smallboats → `Backend/` (+ card JSON contract for `frontend/`)

## Goal (REQUIREMENTS.md §FR-2)
Flashcard Agent: PDF/PPTX/DOCX/MD → LLM → Anki decks. One deck = one small boat.
In-app boat-POV review graded by FSRS (Again/Hard/Good/Easy). `.apkg` export.

## What to extract (per repo)

### `anki-llm-flashcard-generator/` — FORK THIS (main pipeline)
- It is already our exact stack: PDF → semantic chunking → parallel OpenRouter calls
  → `.apkg` via genanki. Copy its pipeline modules nearly verbatim.
- Target: `Backend/app/agents/flashcards/pipeline.py`
  (`ingest → chunk → generate_cards → build_deck`)
- **Modify:**
  1. Add DOCX/PPTX/MD ingestion by routing files through Docling first (see below).
  2. Besides `.apkg`, ALSO emit `deck.json` (FE review mode needs it — see contract).
  3. Wrap the pipeline as a LangGraph node so the orchestrator can call it as a tool.

### `genanki/` — LIBRARY (pip install, don't copy)
- `pip install genanki`. Used inside `build_deck` for `.apkg` export.

### `py-fsrs/` — LIBRARY (pip install, don't copy)
- `pip install fsrs`. Drives:
  - which decks sit in **today's circle** around the lamp (due cards)
  - grading in boat-POV review: Again/Hard/Good/Easy → next due date
- Target usage: `Backend/app/agents/flashcards/review.py`
  (`grade_card(card_id, rating) → updated card state`)

### `Anki_FlashCard_Generator/` — PROMPT REFERENCE
- Read its card-generation prompt + chunking constants; merge best bits into
  `Backend/app/agents/flashcards/prompts.py`. Card rules: one concept per card,
  question ≤25 words, answer ≤40 words.

### `anki-llm/` — IDEAS ONLY
- Read for OpenRouter client config + AnkiConnect push (optional stretch feature).

### `md2anki/` — READ ONLY (GPL)
- Look at its card JSON shape + review UI flow for inspiration. **Copy no code** (GPL-3.0).

## Document ingestion
- Add `docling` (`pip install docling`) as THE parser for PDF/PPTX/DOCX → markdown text.
- Target: `Backend/app/ingestion/docling_loader.py` — **shared with the KG agent (03)**.

## Interfaces the scaffold MUST expose
```
POST /agents/flashcards/generate
  in:  multipart file (pdf|pptx|docx|md|txt) + { "deck_name": "Thermo 1" }
  out: { "deck_id": "...", "cards": [...], "apkg_url": "/static/decks/xxx.apkg" }

POST /agents/flashcards/review/grade
  in:  { "card_id": "...", "rating": "again|hard|good|easy" }
  out: { "next_due": "...", "deck_progress": 0.0-1.0 }

GET  /agents/flashcards/today   → decks due today (drives boats in the circle)
```

### Card JSON contract (Backend → Frontend boat review)
```json
{ "card_id": "c1", "deck_id": "thermo-1",
  "question": "What does the 1st law of thermodynamics state?",
  "answer": "Energy cannot be created or destroyed, only transformed.",
  "due": "2026-09-19", "state": "new|learning|review" }
```
FE maps: question → tag above player boat; 4 grade boats ahead; grade → `sink_boat`
animation → `rise_boat` next card (REQUIREMENTS.md §FR-2.5).

## Dependencies to add
`genanki`, `fsrs`, `docling`, `langgraph`, `langchain-openai`, `python-multipart`

## DO NOT take
- md2anki code (GPL), Streamlit/Streamlit-style UIs, AnkiConnect as a hard dependency
  (optional only), any Node/Flutter code.
