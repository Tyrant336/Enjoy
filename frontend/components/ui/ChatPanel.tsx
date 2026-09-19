"use client";

/**
 * ChatPanel.tsx — the single orchestrator entry (FR-5.1) + the narration
 * transcript (FR-5.5 / §7.4: all narrator text also appears in a readable
 * chat log).
 *
 * - Sends the message to POST /api/chat (via actions.sendChat).
 * - The narrator's reply normally arrives as a §5.3 `narrate` WorldEvent over
 *   the bus; the REST ack is appended as a narrator line ONLY when the bus is
 *   not connected (dedupe — never both).
 * - "labels on/off" and "show/hide labels" are intercepted LOCALLY and toggle
 *   the world's label layer (documented deviation: §5.3 has no label-toggle
 *   event; REQUIREMENTS §3 requires a chat command, so it is handled
 *   client-side, one place, here).
 */

import { useEffect, useRef, useState } from "react";
import { LABEL, PALETTE } from "@/lib/theme";
import { useWorldStore } from "@/components/world/worldStore";
import { refreshWorldState, sendChat } from "./actions";
import { useUiStore } from "./uiStore";

/** docs/LABELS.md chat command: "labels on|off", "show|hide labels". */
const LABELS_COMMAND = /^\s*(?:labels?\s+(on|off)|(show|hide)\s+labels?)\s*$/i;

/** Handle a label-toggle chat command locally. Returns true if consumed. */
function handleLabelsCommand(text: string): boolean {
  const match = LABELS_COMMAND.exec(text);
  if (!match) return false;
  const wantVisible = match[1] ? match[1].toLowerCase() === "on" : match[2].toLowerCase() === "show";
  const world = useWorldStore.getState();
  if (world.labelsVisible !== wantVisible) world.toggleLabels();
  useUiStore.getState().addTranscript({
    id: crypto.randomUUID(),
    who: "narrator",
    text: wantVisible
      ? "Labels are back on."
      : "Labels are tucked away — type “show labels” to bring them back.",
  });
  return true;
}

export default function ChatPanel() {
  const transcript = useUiStore((s) => s.transcript);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the latest narration in view (comfort motion, no jumps).
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    if (handleLabelsCommand(text)) return; // local command — never hits the API
    useUiStore.getState().addTranscript({
      id: crypto.randomUUID(),
      who: "user",
      text,
    });
    setSending(true);
    try {
      const res = await sendChat(text);
      if (res && !useUiStore.getState().busConnected) {
        // No bus → the ack IS the narration (never both, see header).
        useUiStore.getState().addTranscript({
          id: crypto.randomUUID(),
          who: "narrator",
          text: res.ack,
        });
        if (res.roadmapId) useUiStore.getState().setTourOffer(res.roadmapId);
      }
      if (res?.plan) {
        // A new plan changes the task sheet's data — re-read the projection.
        await refreshWorldState();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {transcript.length > 0 && (
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Harbour narration transcript"
          className="max-h-48 overflow-y-auto rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: `${PALETTE.mist.hex}E6`,
            color: PALETTE.ink.hex,
            boxShadow: LABEL.shadow,
          }}
        >
          {transcript.map((line) => (
            <p key={line.id} className="mb-1 last:mb-0">
              <span className="font-semibold">
                {line.who === "user" ? "You" : "Harbour"}
              </span>{" "}
              {line.text}
            </p>
          ))}
        </div>
      )}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell the harbour what you're studying…"
          aria-label="Message the harbour"
          className="min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none"
          style={{
            background: PALETTE.mist.hex,
            color: PALETTE.ink.hex,
            boxShadow: LABEL.shadow,
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send message"
          className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${sending ? "animate-pulse" : ""}`}
          style={{
            background: PALETTE.waterDeep.hex,
            color: PALETTE.mist.hex,
            boxShadow: LABEL.shadow,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
