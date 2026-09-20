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
import { CHROME, PALETTE } from "@/lib/theme";
import ChromeButton from "./ChromeButton";
import { useWorldStore } from "@/components/world/worldStore";
import {
  refreshWorldState,
  sendChat,
  uploadDocument,
  type UploadStage,
} from "./actions";
import { useUiStore } from "./uiStore";

/* ── upload (§7.3) ────────────────────────────────────────────────────────── */

const ACCEPTED_EXTENSIONS = [".pdf", ".pptx", ".docx", ".md", ".txt"] as const;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // §7.3: 25 MB, one file at a time
const CONSENT_STORAGE_KEY = "harbour_openrouter_consent";

const STAGE_COPY: Record<UploadStage, string> = {
  reading: "Reading your document…",
  cards: "Making your cards — this can take a little while…",
  atlas: "Growing your atlas…",
};

/** §7.3 client-side validation — returns the inline message or null. */
function validateUpload(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `This file type is not supported. Accepted formats: ${ACCEPTED_EXTENSIONS.join(" ")}.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That file is larger than 25 MB — try a smaller document.";
  }
  return null;
}

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
  const [uploadStage, setUploadStage] = useState<UploadStage | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be picked again later
    if (!file || uploadStage) return; // one at a time (§7.3)
    const problem = validateUpload(file);
    if (problem) {
      setUploadNote(problem); // soft-amber inline message, never silent
      return;
    }
    setUploadNote(null);
    // §7.3: one-time consent before the first cloud LLM call.
    if (window.localStorage.getItem(CONSENT_STORAGE_KEY) !== "yes") {
      setConsentFile(file);
      return;
    }
    void startUpload(file);
  }

  async function startUpload(file: File) {
    setUploadStage("reading");
    try {
      const deckName = file.name.replace(/\.[^.]+$/, ""); // minus extension
      const res = await uploadDocument(file, deckName, setUploadStage);
      if (!res) return; // the soft-amber banner carries the server message
      // The boat itself arrives via the spawn_boat bus→store path; without
      // the bus, re-read the canonical projection (same pattern as actions).
      if (!useUiStore.getState().busConnected) await refreshWorldState();
      useUiStore.getState().addTranscript({
        id: crypto.randomUUID(),
        who: "narrator",
        text: `“${res.deck.name}” just sailed into your fleet — ${res.deck.cardCount} cards, ready when you are.`,
      });
      if (res.kg.fallbackUsed === "keybert") {
        useUiStore.getState().addTranscript({
          id: crypto.randomUUID(),
          who: "narrator",
          text: "A small note: the atlas used its lighter extractor for this one — the map may be a little simpler than usual.",
        });
      }
    } finally {
      setUploadStage(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 14,
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {/* §7.3 one-time consent — cancel is a clean no-op. Rendered in the
          column flow (NOT a fixed overlay: this container's translateX makes
          `position: fixed` resolve against IT, not the viewport). */}
      {consentFile && (
        <div
          role="dialog"
          aria-label="Before your first upload"
          style={{
            background: PALETTE.chromeCream.hex,
            color: PALETTE.chromeInk.hex,
            borderRadius: CHROME.radiusCard,
            boxShadow: CHROME.shadowCard,
            padding: "14px 18px",
            maxWidth: 360,
            font: "500 14px system-ui, sans-serif",
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0 }}>
            Your text is sent to OpenRouter for processing.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <ChromeButton onClick={() => setConsentFile(null)}>Cancel</ChromeButton>
            <ChromeButton
              accent="sky"
              autoFocus
              onClick={() => {
                window.localStorage.setItem(CONSENT_STORAGE_KEY, "yes");
                const file = consentFile;
                setConsentFile(null);
                void startUpload(file);
              }}
            >
              Continue
            </ChromeButton>
          </div>
        </div>
      )}
      {/* Inline upload messages: soft-amber validation note / calm staged
          loading (slow teal pulse, no flashing — §7.2). */}
      {uploadNote && !uploadStage && (
        <div
          role="alert"
          className="px-4 py-2 text-sm font-semibold"
          style={{
            background: PALETTE.chromeCream.hex,
            color: PALETTE.chromeInk.hex,
            borderRadius: CHROME.radiusPill,
            boxShadow: CHROME.shadowCard,
            border: `2px solid ${PALETTE.softAmber.hex}`,
          }}
        >
          {uploadNote}
        </div>
      )}
      {uploadStage && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-2 text-sm"
          style={{
            background: PALETTE.chromeCream.hex,
            color: PALETTE.chromeInk.hex,
            borderRadius: CHROME.radiusPill,
            boxShadow: CHROME.shadowCard,
          }}
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full"
            style={{ background: PALETTE.waterDeep.hex }}
          />
          {STAGE_COPY[uploadStage]}
        </div>
      )}
      {transcript.length > 0 && (
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Harbour narration transcript"
          className="overflow-y-auto px-4 py-3 text-sm leading-relaxed"
          style={{
            background: PALETTE.chromeCream.hex,
            color: PALETTE.chromeInk.hex,
            borderRadius: CHROME.radiusCard,
            boxShadow: CHROME.shadowCard,
            maxHeight: 192,
            width: "min(420px, 60vw)",
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
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={onFilePicked}
          style={{ display: "none" }}
          aria-hidden
          tabIndex={-1}
        />
        <ChromeButton
          aria-label="Attach a document (PDF, slides, notes)"
          title="Add study material — .pdf .pptx .docx .md .txt, up to 25 MB"
          disabled={uploadStage !== null}
          onClick={() => fileRef.current?.click()}
          style={{ borderRadius: CHROME.radiusPill }}
        >
          📎
        </ChromeButton>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell the harbour what you're studying…"
          aria-label="Message the harbour"
          style={{
            background: PALETTE.chromeCream.hex,
            color: PALETTE.chromeInk.hex,
            boxShadow: CHROME.shadowButton,
            border: 0,
            outline: "none",
            borderRadius: CHROME.radiusPill,
            padding: "9px 16px",
            width: "min(340px, 46vw)",
            font: "500 14px system-ui, sans-serif",
          }}
        />
        <ChromeButton
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send message"
          className={sending ? "animate-pulse" : ""}
          style={{ borderRadius: CHROME.radiusPill }}
        >
          ➤
        </ChromeButton>
      </form>
    </div>
  );
}
