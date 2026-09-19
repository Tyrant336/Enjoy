# Session 003 — 2026-09-19 — Requirements v2.1 ("enjoy")

## Goal
Apply the second PRD review (contradictions, missing actions, identity model) and
adopt the product name **enjoy**.

## What was done — `docs/REQUIREMENTS.md` v2.0 → v2.1
1. **Naming:** product = **enjoy** (title + README title updated).
2. **Contradictions resolved:**
   - NFR-1 motion timing split: camera/scene ≥1500 ms; local feedback 700–1200 ms.
   - FR-1.5: P0 requires the planner→executor→replanner *interface* + canonical
     StudyPlan; full LangGraph required only in non-demo LLM mode (P1).
   - Seed scope unified: ONE deterministic Thermodynamics fixture (new §4.6);
     "Cell Division" is label text only. `DEMO_NOW` pins the demo clock.
   - Atlas node count: 40–80 is a P0 visual target, not an engine floor; sparse
     graphs get decorative particles, never fake nodes (§4.3.5).
3. **Identity/session model (new §4.4):** no auth; `harbour_user_id` UUID in
   localStorage → `X-Harbour-User-Id`; `X-Harbour-Timezone` persisted; SSE + data
   scoped per user.
4. **Persistence entities (new §4.5):** users, plans, tasks, decks, flashcards,
   review_events, records, roadmaps, kg_nodes/edges (JSONB), event_outbox;
   retention: docs discarded, full extracted text NOT stored, only artifacts +
   ≤200-char snippets.
5. **Missing REST actions added (§5.2):** tour start/dismiss/replay, review
   reveal/exit, task complete, `PUT /api/preferences`; `grade_card` removed from
   the SSE union — grading is REST, backend persists then emits sink/rise/dock/glow.
6. **Contracts:** canonical `WorldState` type; API error envelope
   `{code,message,detail,recoverable}`; `seq` = per-user monotonic from
   event_outbox; post-mutation ordering defined (record + events in one transaction).
7. **FR-1.6** fishboat "Today" interaction (centered cream task sheet, Done → record).
8. **FR-2.9** P0 review-session rule (due-at-open cards, shown once, complete when
   all graded once — "Again" doesn't re-show in-session).
9. **§2.5** visual-state inventory matrix for all world objects.
10. **NFR-2** automated no-red enforcement defined (token test, cluster-palette
    test, GLB material review; no pixel scanning).
11. **§8.1** P0 Definition of Done binary checklist.

## State at end of session
Requirements v2.1 is the active PRD. Next: Backend implementation per
`opensource/01–04/distill/DISTILL.md` + §4–§5 contracts; FE AtlasLayer per §4.3.
