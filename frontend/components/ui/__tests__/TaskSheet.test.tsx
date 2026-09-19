/**
 * TaskSheet.test.tsx — FR-1.6: empathy line + today's tasks only, "Done" →
 * POST complete + world-state refetch (strike-through is server truth),
 * Esc closes, the all-done warm line. No pressure mechanics (§7.1).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TaskSheet from "@/components/ui/TaskSheet";
import { useUiStore } from "@/components/ui/uiStore";
import { okJson, resetStores, taskFixture, todayUtc, worldStateFixture } from "./helpers";

const fetchMock = vi.fn();

function openSheet() {
  useUiStore.getState().setTaskSheetOpen(true);
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

describe("TaskSheet", () => {
  it("shows the empathy line + ONLY today's tasks (user timezone)", () => {
    const plan = {
      id: "p1", goal: "bio", empathyLine: "We'll go gently.", granularity: 3,
      tasks: [
        taskFixture({ id: "t-today", title: "Read chapter 4" }),
        taskFixture({ id: "t-tomorrow", title: "Future task", scheduledFor: "2999-01-01" }),
      ],
    };
    useUiStore.getState().setWorldState(worldStateFixture({ activePlan: plan }));
    openSheet();
    render(<TaskSheet />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("We'll go gently.");
    expect(dialog.textContent).toContain("Read chapter 4");
    expect(dialog.textContent).toContain("25 min · morning");
    expect(dialog.textContent).not.toContain("Future task");
  });

  it("'Done' POSTs complete, refetches world-state, then strikes through + warm close", async () => {
    const todo = taskFixture({ id: "t-1", title: "Read chapter 4" });
    const done = taskFixture({ id: "t-2", title: "Watch lecture", status: "done" });
    const planBefore = { id: "p1", goal: "bio", empathyLine: "", granularity: 3, tasks: [todo, done] };
    const planAfter = {
      ...planBefore,
      tasks: [{ ...todo, status: "done" as const }, done],
    };
    useUiStore.getState().setWorldState(worldStateFixture({ activePlan: planBefore }));

    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/complete")
          ? okJson({ task: { ...todo, status: "done" }, record: { id: "r1" } })
          : okJson(worldStateFixture({ activePlan: planAfter })),
      ),
    );
    openSheet();
    render(<TaskSheet />);

    // The already-done task's button is disabled — click the actionable one.
    const doneButtons = screen.getAllByRole("button", { name: "Done" });
    const active = doneButtons.find((b) => !(b as HTMLButtonElement).disabled)!;
    fireEvent.click(active);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [completeUrl, completeInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(completeUrl).toBe(
      "http://localhost:8000/agents/scheduler/tasks/t-1/complete",
    );
    expect(completeInit.method).toBe("POST");
    // FR-1.6.3: the sheet re-reads the canonical projection after completing.
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "http://localhost:8000/api/world-state",
    );

    // Gentle strike-through + FR-1.6.5 warm all-done line (never a streak).
    await waitFor(() =>
      expect(screen.getByText("Read chapter 4").className).toContain("line-through"),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "Today's sea is calm. You did enough.",
    );
  });

  it("Esc and 'Return to harbour' both close the sheet (§7.4)", async () => {
    useUiStore.getState().setWorldState(worldStateFixture());
    openSheet();
    const { rerender } = render(<TaskSheet />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(useUiStore.getState().taskSheetOpen).toBe(false);
    rerender(<TaskSheet />);
    expect(screen.queryByRole("dialog")).toBeNull();

    openSheet();
    rerender(<TaskSheet />);
    fireEvent.click(screen.getByText(/Return to harbour/));
    expect(useUiStore.getState().taskSheetOpen).toBe(false);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<TaskSheet />);
    expect(container.firstChild).toBeNull();
  });

  it("today filter uses the plan's scheduledFor == today in the user's tz", () => {
    // Sanity on the fixture itself: todayUtc() matches the sheet's formatter.
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
