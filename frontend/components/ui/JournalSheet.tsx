"use client";

/**
 * JournalSheet.tsx — FR-4.3 journal view: the lamp's record of past
 * victories. Opened by the lamp's "Journal" pill (hostHandlers.onOpenJournal).
 *
 * A centered, compact cream sheet (same calm chrome as TaskSheet — one visual
 * language): a warm summary line, then the timeline of records, newest first.
 * Records come from the ONE canonical projection (uiStore.worldState — the
 * bus keeps it server-true; no second fetch path). Victories only — never
 * absence, never streaks (AGENTS.md §7.1). Close via "Return to harbour" or
 * Esc (§7.4).
 */

import { useEffect } from "react";
import { CHROME, PALETTE } from "@/lib/theme";
import ChromeButton from "./ChromeButton";
import { useUiStore } from "./uiStore";

/** Local date ("Mon, 20 Sep") in the user's IANA timezone (§4.4, FR-4.2). */
function dayIn(timezone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

const KIND_COPY: Record<string, { icon: string; verb: string }> = {
  deck_completed: { icon: "⛵", verb: "Deck completed" },
  task_done: { icon: "✓", verb: "Task done" },
};

export default function JournalSheet() {
  const open = useUiStore((s) => s.journalOpen);
  const setOpen = useUiStore((s) => s.setJournalOpen);
  const worldState = useUiStore((s) => s.worldState);

  // Esc = Return to harbour (§7.4 keyboard).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const records = worldState?.records ?? [];
  const timezone = worldState?.user.timezone ?? "UTC";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Journal — your record of victories"
        className="w-full max-w-md px-6 py-5"
        style={{
          background: PALETTE.chromeCream.hex,
          color: PALETTE.chromeInk.hex,
          borderRadius: CHROME.radiusCard,
          boxShadow: CHROME.shadowCard,
        }}
      >
        {/* FR-4.3 warm summary copy — victories only, never a bill for absence. */}
        <p className="mb-4 text-sm italic leading-relaxed opacity-80">
          {records.length > 0
            ? "Every small victory, kept safe in the lamplight."
            : "Your first victories will rest here, glowing softly."}
        </p>

        {records.length > 0 && (
          <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto" aria-label="Past victories">
            {records.map((r) => {
              const kind = KIND_COPY[r.kind] ?? { icon: "•", verb: r.kind };
              return (
                <li key={r.id} className="flex items-baseline gap-2 text-sm leading-relaxed">
                  <span aria-hidden>{kind.icon}</span>
                  <span className="flex-1">
                    <span className="font-semibold">{r.title}</span>{" "}
                    <span className="opacity-70">— {kind.verb}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs opacity-60">
                    {dayIn(timezone, r.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end">
          <ChromeButton onClick={() => setOpen(false)}>← Return to harbour</ChromeButton>
        </div>
      </div>
    </div>
  );
}
