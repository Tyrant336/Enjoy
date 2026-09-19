/**
 * UserBootstrap.test.tsx — mount-once wiring: identity headers, world-state
 * into uiStore, hostHandlers registration, and the bus starting ONLY when a
 * real WorldApi is injected (handoff §4.1 — never against a stub).
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserBootstrap from "@/components/ui/UserBootstrap";
import { useUiStore } from "@/components/ui/uiStore";
import { useWorldStore } from "@/components/world/worldStore";
import { fakeWorldApi, okJson, resetStores, sseResponseOpen, worldStateFixture } from "./helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UserBootstrap", () => {
  it("without a WorldApi: fetches world-state, registers host handlers, NO bus", async () => {
    const ws = worldStateFixture({ lastEventSeq: 3 });
    fetchMock.mockResolvedValue(okJson(ws));

    render(<UserBootstrap />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/world-state");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Harbour-User-Id"]).toBeTruthy();

    expect(useUiStore.getState().worldState?.lastEventSeq).toBe(3);
    // The world's production handlers are wired (world never calls REST itself).
    const handlers = useWorldStore.getState().hostHandlers;
    expect(typeof handlers.onOpenDeck).toBe("function");
    expect(typeof handlers.onOpenToday).toBe("function");
    expect(typeof handlers.onGrade).toBe("function");
    expect(typeof handlers.onAcceptTour).toBe("function");
    // No bus without a real world API.
    expect(useUiStore.getState().busConnected).toBe(false);
  });

  it("with a WorldApi: starts the bus, syncs BOTH projections, feeds the transcript", async () => {
    const ws = worldStateFixture({ lastEventSeq: 0 });
    const narrate = { id: "ev-1", seq: 1, type: "narrate", text: "Welcome back." };
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/api/events") ? sseResponseOpen([narrate]) : okJson(ws),
      ),
    );
    const api = fakeWorldApi();

    const { unmount } = render(<UserBootstrap worldApi={api} />);

    // The bus connected and replayed the event stream.
    await waitFor(() =>
      expect(useUiStore.getState().transcript.map((l) => l.text)).toContain(
        "Welcome back.",
      ),
    );
    // Contract amendment 09fcee9: the 3D projection rebuilt from world-state.
    expect(api.syncFromWorldState).toHaveBeenCalledWith(ws);
    // The SSE stream was opened with identity headers (fetch, not EventSource).
    const eventsCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).endsWith("/api/events"),
    );
    expect(eventsCall).toBeTruthy();
    expect(useUiStore.getState().busConnected).toBe(true);

    unmount(); // stops the bus (cleanup path)
  });

  it("renders nothing", () => {
    fetchMock.mockResolvedValue(okJson(worldStateFixture()));
    const { container } = render(<UserBootstrap />);
    expect(container.firstChild).toBeNull();
  });
});
