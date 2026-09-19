"use client";

/**
 * TaskSheet.tsx — FR-1.6 "Today" interaction.
 *
 * Clicking the fishboat's "Today" pill (hostHandlers.onOpenToday) opens this
 * centered, compact cream sheet — no side panel, the composition stays
 * intact. It shows the active plan's empathy line + today's scheduled tasks
 * (scheduledFor == today in the user's timezone). Each task has a
 * text-labelled "Done" → POST complete, then the canonical world-state is
 * re-read so the strike-through and lamp glow are server truth. Close via
 * the "Return to harbour" button or Esc.
 *
 * All done → "Today's sea is calm. You did enough." (victories only, §7.1).
 */

import { useEffect } from "react";
import { LABEL, PALETTE } from "@/lib/theme";
import { completeTask } from "./actions";
import { getHarbourIdentity } from "./identity";
import { useUiStore } from "./uiStore";

/** Today's local date ("YYYY-MM-DD") in the user's IANA timezone (§4.4). */
function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function TaskSheet() {
  const open = useUiStore((s) => s.taskSheetOpen);
  const setOpen = useUiStore((s) => s.setTaskSheetOpen);
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

  const plan = worldState?.activePlan ?? null;
  const timezone = worldState?.user.timezone ?? getHarbourIdentity().timezone;
  const today = todayIn(timezone);
  const todaysTasks = (plan?.tasks ?? []).filter((t) => t.scheduledFor === today);
  const allDone = todaysTasks.length > 0 && todaysTasks.every((t) => t.status === "done");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Today's tasks"
        className="w-full max-w-md rounded-3xl px-6 py-5"
        style={{
          background: PALETTE.mist.hex,
          color: PALETTE.ink.hex,
          boxShadow: LABEL.shadow,
        }}
      >
        {/* FR-1.6.2: the plan's empathy line leads — warmth before tasks. */}
        {plan?.empathyLine && (
          <p className="mb-4 text-sm italic leading-relaxed opacity-80">
            {plan.empathyLine}
          </p>
        )}

        {todaysTasks.length === 0 ? (
          <p className="py-2 text-sm leading-relaxed">
            Nothing is scheduled for today — the sea is open.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todaysTasks.map((task) => {
              const done = task.status === "done";
              return (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2"
                  style={{ background: `${PALETTE.ink.hex}0D` }}
                >
                  <div className="min-w-0">
                    {/* FR-1.6.3: gentle strike-through, never a tally. */}
                    <p
                      className={`truncate text-sm font-semibold ${done ? "line-through opacity-60" : ""}`}
                    >
                      {task.title}
                    </p>
                    <p className="text-xs opacity-70">
                      {task.estimateMinutes} min
                      {task.slot ? ` · ${task.slot}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => void completeTask(task.id)}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                    style={{
                      background: PALETTE.waterDeep.hex,
                      color: PALETTE.mist.hex,
                      border: "none",
                      cursor: done ? "default" : "pointer",
                    }}
                  >
                    Done
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* FR-1.6.5: victories only — a warm close, never a streak. */}
        {allDone && (
          <p className="mt-4 text-sm font-semibold" style={{ color: PALETTE.waterDeep.hex }}>
            Today&apos;s sea is calm. You did enough.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: LABEL.fill,
              color: LABEL.text,
              boxShadow: LABEL.shadow,
              border: `1px solid ${PALETTE.ink.hex}33`,
              cursor: "pointer",
            }}
          >
            Return to harbour (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
