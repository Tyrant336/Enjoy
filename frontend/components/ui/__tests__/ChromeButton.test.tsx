/**
 * ChromeButton.test.tsx — the one shared chrome button (calm cream chrome
 * language): cream/ink base, hover scale 1.05 over 80 ms (nothing else),
 * dimmed = .55, accents, disabled = .6 with no hover scale.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ChromeButton from "@/components/ui/ChromeButton";
import { CHROME, PALETTE } from "@/lib/theme";

afterEach(cleanup);

/** jsdom serializes hex colors to `rgb(r, g, b)` — compare in that form. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe("ChromeButton", () => {
  it("renders its label with the cream/ink base style", () => {
    render(<ChromeButton>🏷 Labels</ChromeButton>);
    const btn = screen.getByRole("button", { name: /Labels/ });
    expect(btn.style.background).toBe(rgb(PALETTE.chromeCream.hex));
    expect(btn.style.color).toBe(rgb(PALETTE.chromeInk.hex));
    expect(btn.style.borderRadius).toBe(`${CHROME.radiusButton}px`);
    expect(btn.style.boxShadow).toBe(CHROME.shadowButton);
    expect(btn.style.font).toBe(CHROME.font);
    expect(btn.style.border).toBe("0px");
  });

  it("scales to 1.05 on hover and back, over 80 ms — nothing else changes", () => {
    render(<ChromeButton>Hover me</ChromeButton>);
    const btn = screen.getByRole("button", { name: "Hover me" });
    expect(btn.style.transform).toBe("none");
    const bgBefore = btn.style.background;

    fireEvent.mouseEnter(btn);
    expect(btn.style.transform).toBe(`scale(${CHROME.hoverScale})`);
    expect(btn.style.transition).toBe(`transform ${CHROME.hoverMs}ms`);
    expect(btn.style.background).toBe(bgBefore); // hover changes ONLY transform

    fireEvent.mouseLeave(btn);
    expect(btn.style.transform).toBe("none");
  });

  it("dimmed renders at opacity .55 (toggle-off state)", () => {
    render(<ChromeButton dimmed>Off</ChromeButton>);
    expect(screen.getByRole("button", { name: "Off" }).style.opacity).toBe("0.55");
  });

  it("accents recolor the surface; sand keeps ink text, others white", () => {
    render(
      <>
        <ChromeButton accent="sky">Sky</ChromeButton>
        <ChromeButton accent="sage">Sage</ChromeButton>
        <ChromeButton accent="cornflower">Corn</ChromeButton>
        <ChromeButton accent="mauve">Mauve</ChromeButton>
        <ChromeButton accent="sand">Sand</ChromeButton>
      </>,
    );
    const cases: [string, string, string][] = [
      ["Sky", rgb(PALETTE.skyAction.hex), "rgb(255, 255, 255)"],
      ["Sage", rgb(PALETTE.sageAction.hex), "rgb(255, 255, 255)"],
      ["Corn", rgb(PALETTE.cornflower.hex), "rgb(255, 255, 255)"],
      ["Mauve", rgb(PALETTE.mauve.hex), "rgb(255, 255, 255)"],
      ["Sand", rgb(PALETTE.paleSand.hex), rgb(PALETTE.chromeInk.hex)],
    ];
    for (const [name, bg, color] of cases) {
      const btn = screen.getByRole("button", { name });
      expect(btn.style.background).toBe(bg);
      expect(btn.style.color).toBe(color);
    }
  });

  it("disabled renders at opacity .6 and never hover-scales", () => {
    render(<ChromeButton disabled>Nope</ChromeButton>);
    const btn = screen.getByRole("button", { name: "Nope" });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.style.opacity).toBe("0.6");
    fireEvent.mouseEnter(btn);
    expect(btn.style.transform).toBe("none");
  });
});
