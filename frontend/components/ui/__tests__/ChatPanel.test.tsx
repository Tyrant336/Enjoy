/**
 * ChatPanel.test.tsx — behavioral tests: send flow, bus-dedupe of the ack,
 * local labels-command handling, loud error path (§2).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPanel from "@/components/ui/ChatPanel";
import { useUiStore } from "@/components/ui/uiStore";
import { useWorldStore } from "@/components/world/worldStore";
import { errEnvelope, okJson, resetStores } from "./helpers";

const fetchMock = vi.fn();

function submitMessage(text: string) {
  const input = screen.getByLabelText("Message the harbour");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatPanel", () => {
  it("sends the message to /api/chat and appends user + ack lines (bus off)", async () => {
    fetchMock.mockResolvedValue(
      okJson({ ack: "On it — one small step at a time.", route: "narrate", plan: null, roadmapId: null }),
    );
    render(<ChatPanel />);

    submitMessage("hello harbour");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "hello harbour" });
    // §4.4: identity headers on every request.
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Harbour-User-Id"]).toBeTruthy();
    expect(headers["X-Harbour-Timezone"]).toBeTruthy();

    // Transcript: user line + narrator ack (no bus → ack IS the narration).
    await waitFor(() =>
      expect(screen.getByRole("log").textContent).toContain("On it — one small step"),
    );
    expect(screen.getByRole("log").textContent).toContain("hello harbour");
  });

  it("does NOT append the ack when the bus is connected (narrate event owns it)", async () => {
    useUiStore.getState().setBusConnected(true);
    fetchMock.mockResolvedValue(
      okJson({ ack: "On it.", route: "narrate", plan: null, roadmapId: null }),
    );
    render(<ChatPanel />);

    submitMessage("hi");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("hi");
    expect(log.textContent).not.toContain("On it.");
  });

  it("refetches world-state when the chat returns a plan (TaskSheet data)", async () => {
    const plan = { id: "p1", goal: "bio", empathyLine: "easy does it", granularity: 3, tasks: [] };
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/api/chat")
          ? okJson({ ack: "planned", route: "big_task", plan, roadmapId: "road-1" })
          : okJson({ user: {}, activePlan: plan }),
      ),
    );
    render(<ChatPanel />);

    submitMessage("I must learn biology");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "http://localhost:8000/api/world-state",
    );
    // Bus off → the ack's roadmapId becomes the tour offer locally.
    expect(useUiStore.getState().tourOfferId).toBe("road-1");
  });

  it("handles 'labels off'/'show labels' LOCALLY — never hits the API", async () => {
    render(<ChatPanel />);
    expect(useWorldStore.getState().labelsVisible).toBe(true);

    submitMessage("labels off");
    expect(useWorldStore.getState().labelsVisible).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("log").textContent).toContain("tucked away");

    submitMessage("show labels");
    expect(useWorldStore.getState().labelsVisible).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces API errors in the banner state (loud, §2 — never silent)", async () => {
    fetchMock.mockResolvedValue(errEnvelope(500, "The harbour lantern flickered."));
    render(<ChatPanel />);

    submitMessage("do something");

    await waitFor(() =>
      expect(useUiStore.getState().errorMessage).toBe("The harbour lantern flickered."),
    );
  });
});
