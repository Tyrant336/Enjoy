"use client";

/**
 * Banners.tsx — the two ambient banners (AGENTS.md §2.5: errors reach the
 * user AS errors, never a silent empty world).
 *
 * - Error: soft-amber, dismissible, role="alert" — unmistakably an error,
 *   never red (NFR-2). Fed by uiStore.errorMessage (REST failures, SSE
 *   error events, transport failures).
 * - Offline: "The harbour mist is thick — reconnecting…" while the bus is
 *   down (§7.2). Not dismissible — it clears itself on reconnect.
 */

import { LABEL, PALETTE } from "@/lib/theme";
import { useUiStore } from "./uiStore";

export default function Banners() {
  const errorMessage = useUiStore((s) => s.errorMessage);
  const setError = useUiStore((s) => s.setError);
  const offline = useUiStore((s) => s.offline);

  if (!errorMessage && !offline) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            background: LABEL.fill,
            color: LABEL.text,
            boxShadow: LABEL.shadow,
            border: `2px solid ${PALETTE.softAmber.hex}`,
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="rounded-full px-2 py-0.5 text-xs"
            style={{
              background: "transparent",
              color: LABEL.text,
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}
      {offline && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          style={{
            background: LABEL.fill,
            color: LABEL.text,
            boxShadow: LABEL.shadow,
          }}
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full"
            style={{ background: PALETTE.waterDeep.hex }}
          />
          The harbour mist is thick — reconnecting…
        </div>
      )}
    </div>
  );
}
