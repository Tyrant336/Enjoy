/**
 * worldBus.test.ts — THE SSE client's guarantees (§4.2/§5.3), behaviorally:
 * seq-ordered idempotent dispatch, gap → refetch + full resync, malformed
 * frames are LOUD, and both projections rebuild from the same WorldState.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldBus, type WorldBusListeners } from "@/lib/worldBus";
import { fakeWorldApi, okJson, sseResponse, worldStateFixture } from "./helpers";

const fetchMock = vi.fn();

function makeListeners(): WorldBusListeners & Record<keyof WorldBusListeners, ReturnType<typeof vi.fn>> {
  const listeners = {
    onWorldState: vi.fn(),
    onNarrate: vi.fn(),
    onTourOffer: vi.fn(),
    onTourStart: vi.fn(),
    onTourEnd: vi.fn(),
    onError: vi.fn(),
    onConnectionChange: vi.fn(),
  };
  return listeners as WorldBusListeners &
    Record<keyof WorldBusListeners, ReturnType<typeof vi.fn>>;
}

const IDENTITY = { userId: "test-user", timezone: "UTC" };

/** Start a bus against mocked fetch, run `assert`, always stop cleanly. */
async function withBus(
  events: unknown[],
  lastEventSeq: number,
  assert: (
    api: ReturnType<typeof fakeWorldApi>,
    listeners: ReturnType<typeof makeListeners>,
  ) => Promise<void> | void,
  secondRefetchSeq?: number,
): Promise<void> {
  let worldStateCalls = 0;
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/api/world-state")) {
      worldStateCalls += 1;
      const seq =
        secondRefetchSeq !== undefined && worldStateCalls > 1
          ? secondRefetchSeq
          : lastEventSeq;
      return Promise.resolve(okJson(worldStateFixture({ lastEventSeq: seq })));
    }
    if (url.endsWith("/api/events")) return Promise.resolve(sseResponse(events));
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  const api = fakeWorldApi();
  const listeners = makeListeners();
  const bus = new WorldBus("http://test", IDENTITY, api, listeners);
  const running = bus.start();
  try {
    await assert(api, listeners);
  } finally {
    bus.stop();
    await running;
  }
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorldBus", () => {
  it("bootstrap: refetches world-state and rebuilds BOTH projections from it", async () => {
    await withBus([], 5, async (api, listeners) => {
      await vi.waitFor(() => expect(api.syncFromWorldState).toHaveBeenCalledTimes(1));
      expect(listeners.onWorldState).toHaveBeenCalledTimes(1);
      // The SAME WorldState object feeds the 3D projection and the UI store.
      expect(api.syncFromWorldState.mock.calls[0][0]).toBe(
        listeners.onWorldState.mock.calls[0][0],
      );
      expect(api.syncFromWorldState.mock.calls[0][0].lastEventSeq).toBe(5);
    });
  });

  it("dispatches in seq order, idempotently (dup id and old seq dropped)", async () => {
    const ev6 = { id: "a", seq: 6, type: "narrate", text: "first" };
    const ev7dupId = { id: "a", seq: 7, type: "narrate", text: "re-delivery" };
    const ev6oldSeq = { id: "b", seq: 6, type: "narrate", text: "stale" };
    const ev8 = { id: "c", seq: 8, type: "narrate", text: "second" };
    await withBus([ev6, ev7dupId, ev6oldSeq, ev8], 5, async (_api, listeners) => {
      await vi.waitFor(() => expect(listeners.onNarrate).toHaveBeenCalledTimes(2));
      expect(listeners.onNarrate.mock.calls[0][0].text).toBe("first");
      expect(listeners.onNarrate.mock.calls[1][0].text).toBe("second");
    });
  });

  it("a seq GAP triggers a refetch + full resync; the covered event is not re-applied", async () => {
    // lastSeq 5, next event is seq 8 → gap. The refetched projection already
    // includes seq 8 (lastEventSeq 8), so the event itself is dropped.
    const ev8 = { id: "x", seq: 8, type: "narrate", text: "post-gap" };
    await withBus(
      [ev8],
      5,
      async (api, listeners) => {
        await vi.waitFor(() => expect(api.syncFromWorldState).toHaveBeenCalledTimes(2));
        expect(listeners.onWorldState).toHaveBeenCalledTimes(2);
        expect(listeners.onNarrate).not.toHaveBeenCalled();
      },
      8,
    );
  });

  it("routes events to the frozen WorldApi (lamp_glow / tour_start + listener)", async () => {
    const glow = { id: "g", seq: 6, type: "lamp_glow", level: 0.5 };
    const roadmap = { id: "road-1", planId: "p1", steps: [] };
    const tourStart = { id: "t", seq: 7, type: "tour_start", roadmap };
    await withBus([glow, tourStart], 5, async (api, listeners) => {
      await vi.waitFor(() => expect(api.startTour).toHaveBeenCalledTimes(1));
      expect(api.setLampGlow).toHaveBeenCalledWith(0.5);
      expect(api.startTour).toHaveBeenCalledWith(roadmap);
      expect(listeners.onTourStart).toHaveBeenCalledWith("road-1");
    });
  });

  it("a malformed frame is LOUD — onError fires, nothing is silently dropped", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/api/world-state")) {
        return Promise.resolve(okJson(worldStateFixture({ lastEventSeq: 0 })));
      }
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode("event: narrate\ndata: {not json\n\n"));
          c.close();
        },
      });
      return Promise.resolve({ ok: true, status: 200, body } as unknown as Response);
    });
    const api = fakeWorldApi();
    const listeners = makeListeners();
    const bus = new WorldBus("http://test", IDENTITY, api, listeners);
    const running = bus.start();
    try {
      await vi.waitFor(() => expect(listeners.onError).toHaveBeenCalledTimes(1));
      expect(listeners.onConnectionChange).toHaveBeenLastCalledWith(false);
      expect(listeners.onNarrate).not.toHaveBeenCalled();
    } finally {
      bus.stop();
      await running;
    }
  });
});
