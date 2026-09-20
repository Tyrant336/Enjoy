/**
 * ViewPanel.test.tsx — top-right view controls: camera presets, dive/surface
 * by worldMode, labels toggle (dimmed when off), camera buttons hidden during
 * review (the review POV owns the camera).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ViewPanel from "@/components/ui/ViewPanel";
import { useWorldStore } from "@/components/world/worldStore";
import { resetStores } from "./helpers";

beforeEach(() => {
  resetStores();
  useWorldStore.setState({
    worldMode: "harbour",
    diveDestination: "underwater",
    labelsVisible: true,
    reviewing: null,
  });
});

afterEach(cleanup);

describe("ViewPanel", () => {
  it("🎣 Today / 💡 Lamp / 🌍 Global request the right camera presets", () => {
    render(<ViewPanel />);

    fireEvent.click(screen.getByRole("button", { name: "🎣 Today" }));
    expect(useWorldStore.getState().cameraRequest.preset).toBe("fishboat");

    fireEvent.click(screen.getByRole("button", { name: "💡 Lamp" }));
    expect(useWorldStore.getState().cameraRequest.preset).toBe("lamp");

    fireEvent.click(screen.getByRole("button", { name: "🌍 Global" }));
    expect(useWorldStore.getState().cameraRequest.preset).toBe("topdown");
  });

  it("🌊 Atlas dives from harbour; ↑ Surface surfaces from underwater", () => {
    const { rerender } = render(<ViewPanel />);

    fireEvent.click(screen.getByRole("button", { name: "🌊 Atlas" }));
    expect(useWorldStore.getState().worldMode).toBe("diving");

    // Mid-transition the dive control is disabled (no double-dive).
    rerender(<ViewPanel />);
    expect(
      (screen.getByRole("button", { name: "🌊 Atlas" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    useWorldStore.setState({ worldMode: "underwater" });
    rerender(<ViewPanel />);
    fireEvent.click(screen.getByRole("button", { name: "↑ Surface" }));
    expect(useWorldStore.getState().worldMode).toBe("diving");
    expect(useWorldStore.getState().diveDestination).toBe("harbour");
  });

  it("🏷 Labels toggles labelsVisible and is dimmed + aria-pressed when off", () => {
    const { rerender } = render(<ViewPanel />);
    const btn = screen.getByRole("button", { name: "🏷 Labels" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.style.opacity).toBe("1");

    fireEvent.click(btn);
    expect(useWorldStore.getState().labelsVisible).toBe(false);

    rerender(<ViewPanel />);
    const off = screen.getByRole("button", { name: "🏷 Labels" });
    expect(off.getAttribute("aria-pressed")).toBe("false");
    expect(off.style.opacity).toBe("0.55");
  });

  it("hides the camera buttons while reviewing; dive/surface is disabled", () => {
    useWorldStore.setState({
      reviewing: {
        deckId: "d1",
        card: null,
        answerRevealed: false,
        lastGrade: null,
        sinkingGrade: null,
        riseNonce: 0,
      },
    });
    render(<ViewPanel />);

    expect(screen.queryByRole("button", { name: "🎣 Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "💡 Lamp" })).toBeNull();
    expect(screen.queryByRole("button", { name: "🌍 Global" })).toBeNull();

    // Labels stays available; Atlas is visible but disabled during review.
    expect(screen.getByRole("button", { name: "🏷 Labels" })).toBeTruthy();
    const atlas = screen.getByRole("button", { name: "🌊 Atlas" }) as HTMLButtonElement;
    expect(atlas.disabled).toBe(true);
    fireEvent.click(atlas);
    expect(useWorldStore.getState().worldMode).toBe("harbour"); // unchanged
  });
});
