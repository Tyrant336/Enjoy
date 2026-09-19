/**
 * Banners.test.tsx — soft-amber dismissible error (role=alert) + the
 * self-clearing "harbour mist" offline indicator (role=status). §2.5/§7.2.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Banners from "@/components/ui/Banners";
import { useUiStore } from "@/components/ui/uiStore";
import { resetStores } from "./helpers";

beforeEach(resetStores);
afterEach(cleanup);

describe("Banners", () => {
  it("shows the error as an explicit alert and dismisses it", () => {
    const { rerender } = render(<Banners />);
    useUiStore.getState().setError("The harbour lantern flickered.");
    rerender(<Banners />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The harbour lantern flickered.");

    fireEvent.click(screen.getByLabelText("Dismiss error"));
    expect(useUiStore.getState().errorMessage).toBeNull();
    rerender(<Banners />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the mist while offline and clears on reconnect (not dismissible)", () => {
    const { rerender } = render(<Banners />);
    useUiStore.getState().setOffline(true);
    rerender(<Banners />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("The harbour mist is thick");
    expect(screen.queryByLabelText("Dismiss error")).toBeNull();

    useUiStore.getState().setOffline(false);
    rerender(<Banners />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing when all is well", () => {
    const { container } = render(<Banners />);
    expect(container.firstChild).toBeNull();
  });
});
