/**
 * helpers.ts — shared fixtures for the UI-kit tests: store resets, fetch
 * response builders, a canonical WorldState fixture. Mock only the true
 * externality (HTTP); the stores under test are the real ones (§6.5).
 */

import type { StudyTask, WorldState } from "@/lib/types";
import type { WorldApi } from "@/lib/worldApi";
import { vi } from "vitest";
import { useUiStore } from "@/components/ui/uiStore";
import { useWorldStore } from "@/components/world/worldStore";

/** A test double for T's frozen WorldApi — a fixture, not production code (§6.5). */
export function fakeWorldApi(): WorldApi & Record<keyof WorldApi, ReturnType<typeof vi.fn>> {
  const api = {
    flyTo: vi.fn(),
    highlight: vi.fn(),
    spawnBoat: vi.fn(),
    enterReviewPOV: vi.fn(),
    showCard: vi.fn(),
    sinkBoat: vi.fn(),
    riseBoat: vi.fn(),
    exitReviewPOV: vi.fn(),
    dockAtLamp: vi.fn(),
    setLampGlow: vi.fn(),
    offerTour: vi.fn(),
    startTour: vi.fn(),
    endTour: vi.fn(),
    showError: vi.fn(),
    syncFromWorldState: vi.fn(),
  };
  return api as WorldApi & Record<keyof WorldApi, ReturnType<typeof vi.fn>>;
}

/** Today's local date in UTC ("YYYY-MM-DD") — matches TaskSheet's logic. */
export function todayUtc(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function taskFixture(overrides: Partial<StudyTask> = {}): StudyTask {
  return {
    id: "task-1",
    title: "Read the chapter",
    description: "",
    estimateMinutes: 25,
    difficulty: 2,
    status: "todo",
    scheduledFor: todayUtc(),
    slot: "morning",
    dependsOn: [],
    deckRequest: null,
    worldLabel: null,
    ...overrides,
  };
}

export function worldStateFixture(overrides: Partial<WorldState> = {}): WorldState {
  return {
    user: { timezone: "UTC", labelsVisible: true, reducedMotion: false },
    activePlan: null,
    decks: [],
    reviewing: null,
    records: [],
    graphSummary: { nodeCount: 0, edgeCount: 0, updatedAt: null },
    lampGlowLevel: 0,
    pendingTour: null,
    lastEventSeq: 0,
    ...overrides,
  };
}

/** Reset BOTH stores to a pristine state between tests (module-global state). */
export function resetStores(): void {
  useUiStore.setState({
    transcript: [],
    tourOfferId: null,
    lastRoadmapId: null,
    tourActive: false,
    errorMessage: null,
    offline: false,
    worldState: null,
    busConnected: false,
    taskSheetOpen: false,
  });
  useWorldStore.setState({
    labelsVisible: true,
    hostHandlers: {},
    reviewing: null,
  });
  window.localStorage.clear();
}

/** A 200 JSON Response stand-in (fetch is mocked — this is the wire fixture). */
export function okJson(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

/** A §5.2 error-envelope Response stand-in. */
export function errEnvelope(status: number, message: string): Response {
  return {
    ok: false,
    status,
    json: () =>
      Promise.resolve({ code: "TEST_ERROR", message, detail: null, recoverable: true }),
  } as unknown as Response;
}

/** Build SSE frames exactly as the backend emits them (world.py: id/event/data). */
export function sseFrames(events: unknown[]): string {
  return events
    .map((e) => {
      const evt = e as { seq: number; type: string };
      return `id: ${evt.seq}\nevent: ${evt.type}\ndata: ${JSON.stringify(e)}\n\n`;
    })
    .join("");
}

export function sseResponse(events: unknown[]): Response {
  const bytes = new TextEncoder().encode(sseFrames(events));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

/** An SSE stream that delivers frames but STAYS OPEN (a live connection). */
export function sseResponseOpen(events: unknown[]): Response {
  const bytes = new TextEncoder().encode(sseFrames(events));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      // never closes — the bus stays connected until stop()/abort
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}
