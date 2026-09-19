/**
 * TourUI.test.tsx — offer (Begin/Not now), "?" replay, Skip tour (= dismiss,
 * emits tour_end). Driven by uiStore; endpoints per §5.2.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TourUI from "@/components/ui/TourUI";
import { useUiStore } from "@/components/ui/uiStore";
import { okJson, resetStores } from "./helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(okJson({ roadmapId: "road-1" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TourUI", () => {
  it("shows the non-blocking offer; Begin tour POSTs start", async () => {
    useUiStore.getState().setTourOffer("road-1");
    render(<TourUI />);

    fireEvent.click(screen.getByText("Begin tour"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/tours/road-1/start");
    expect(init.method).toBe("POST");
    // Bus off → local state follows the ack.
    expect(useUiStore.getState().tourActive).toBe(true);
    expect(useUiStore.getState().tourOfferId).toBeNull();
  });

  it("'Not now' POSTs dismiss (offer clears, no tour)", async () => {
    useUiStore.getState().setTourOffer("road-1");
    render(<TourUI />);

    fireEvent.click(screen.getByText("Not now"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://localhost:8000/api/tours/road-1/dismiss",
    );
    expect(useUiStore.getState().tourActive).toBe(false);
    expect(useUiStore.getState().tourOfferId).toBeNull();
  });

  it("the '?' replay is always available with a roadmap, hidden mid-tour", async () => {
    useUiStore.getState().setTourOffer("road-1"); // also sets lastRoadmapId
    render(<TourUI />);

    fireEvent.click(screen.getByLabelText("Replay the harbour tour"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://localhost:8000/api/tours/road-1/replay",
    );
  });

  it("'Skip tour' is visible only during a tour and POSTs dismiss (tour_end)", async () => {
    useUiStore.getState().setTourStarted("road-1");
    render(<TourUI />);

    // §7.4: no replay button while a tour is playing.
    expect(screen.queryByLabelText("Replay the harbour tour")).toBeNull();

    fireEvent.click(screen.getByText("Skip tour"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://localhost:8000/api/tours/road-1/dismiss",
    );
    expect(useUiStore.getState().tourActive).toBe(false);
  });

  it("renders nothing without offer, tour, or roadmap", () => {
    const { container } = render(<TourUI />);
    expect(container.firstChild).toBeNull();
  });
});
