/**
 * worldBus.ts — THE SSE client for the harbour (Agent L, Phase 2).
 *
 * Consumes `GET /api/events` (REQUIREMENTS §5.3) and dispatches WorldEvents
 * to the frozen `WorldApi` signatures (lib/worldApi.ts — Agent T implements;
 * this bus only ever CONSUMES them, BUILDING.md §5.3).
 *
 * Guarantees (§4.2 / §5.3):
 * - Connects with the `X-Harbour-User-Id` header (EventSource cannot set
 *   headers, so this uses fetch streaming — one path).
 * - Processes events strictly in `seq` order; duplicate/older seqs are
 *   dropped (idempotent handlers); event `id`s are remembered so a
 *   re-delivered event is never applied twice.
 * - On a seq GAP or any reconnect: refetches `GET /api/world-state` and
 *   rebuilds BOTH projections from it — the 3D world via
 *   `worldApi.syncFromWorldState(state)` and the UI store via `onWorldState`
 *   (state is rebuilt, events are not replayed), then resumes from
 *   `lastEventSeq`.
 * - Connection loss is LOUD, never silent: `onConnectionChange(false)` fires
 *   (the "harbour mist" banner) and the bus keeps retrying with backoff.
 */

import type { WorldEvent, WorldState } from "./types";
import type { WorldApi } from "./worldApi";

export type HarbourIdentity = { userId: string; timezone: string };

export type WorldBusListeners = {
  /** A rebuilt projection after connect/gap (§4.2 state ownership). */
  onWorldState: (state: WorldState) => void;
  /** §5.3 narrate — narration text goes to the chat transcript (§7.4). */
  onNarrate: (event: Extract<WorldEvent, { type: "narrate" }>) => void;
  /** §5.3 tour_offer / tour_start / tour_end — drive the TourUI. */
  onTourOffer: (roadmapId: string) => void;
  onTourStart: (roadmapId: string) => void;
  onTourEnd: () => void;
  /** §5.3 error + transport failures (soft amber, still explicit). */
  onError: (message: string) => void;
  /** false = the mist is thick (offline indicator); true = connected. */
  onConnectionChange: (connected: boolean) => void;
};

type SseFrame = { id?: string; event?: string; data: string };

/** Parse one SSE byte stream into frames (id/event/data; comments ignored). */
async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let split: number;
      // SSE frames are separated by a blank line.
      while ((split = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split).replace(/^\r?\n\r?\n/, "");
        const frame: SseFrame = { data: "" };
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith(":") || line === "") continue; // heartbeat comment
          if (line.startsWith("id:")) frame.id = line.slice(3).trim();
          else if (line.startsWith("event:")) frame.event = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            frame.data = frame.data
              ? `${frame.data}\n${line.slice(5).trimStart()}`
              : line.slice(5).trimStart();
          }
        }
        if (frame.data) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class WorldBus {
  private lastSeq = 0;
  private seenIds = new Set<string>();
  private abort: AbortController | null = null;
  private running = false;

  constructor(
    private readonly baseUrl: string,
    private readonly identity: HarbourIdentity,
    private readonly api: WorldApi,
    private readonly listeners: WorldBusListeners,
  ) {}

  private headers(): HeadersInit {
    return {
      "X-Harbour-User-Id": this.identity.userId,
      "X-Harbour-Timezone": this.identity.timezone,
    };
  }

  /** GET /api/world-state → rebuild BOTH projections from the same state. */
  private async refetchWorldState(): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/api/world-state`, {
      headers: this.headers(),
      signal: this.abort?.signal,
    });
    if (!resp.ok) {
      throw new Error(`world-state refetch failed: HTTP ${resp.status}`);
    }
    const state = (await resp.json()) as WorldState;
    // One rebuild path (§4.2): the 3D projection AND the UI store rebuild from
    // the SAME WorldState — bootstrap, gap, and reconnect alike (contract
    // amendment 09fcee9, session 020).
    this.api.syncFromWorldState(state);
    this.listeners.onWorldState(state);
    this.lastSeq = state.lastEventSeq;
  }

  /** Dispatch one event (already seq-verified) to worldApi + listeners. */
  private dispatch(event: WorldEvent): void {
    switch (event.type) {
      case "narrate":
        this.listeners.onNarrate(event);
        break;
      case "camera_fly_to":
        this.api.flyTo(event.target, event.preset, event.durationMs);
        break;
      case "highlight":
        this.api.highlight(event.target);
        break;
      case "spawn_boat":
        this.api.spawnBoat(event.deck);
        break;
      case "enter_review_pov":
        this.api.enterReviewPOV(event.deckId);
        break;
      case "show_card":
        this.api.showCard(event.deckId, event.card);
        break;
      case "sink_boat":
        this.api.sinkBoat();
        break;
      case "rise_boat":
        this.api.riseBoat(event.card);
        break;
      case "exit_review_pov":
        this.api.exitReviewPOV();
        break;
      case "dock_at_lamp":
        this.api.dockAtLamp(event.deckId);
        break;
      case "lamp_glow":
        this.api.setLampGlow(event.level);
        break;
      case "tour_offer":
        this.api.offerTour(event.roadmapId);
        this.listeners.onTourOffer(event.roadmapId);
        break;
      case "tour_start":
        this.api.startTour(event.roadmap);
        this.listeners.onTourStart(event.roadmap.id);
        break;
      case "tour_end":
        this.api.endTour();
        this.listeners.onTourEnd();
        break;
      case "error":
        this.api.showError(event.message);
        this.listeners.onError(event.message);
        break;
    }
  }

  private handleEvent(event: WorldEvent): void {
    if (event.seq <= this.lastSeq) return; // idempotent: already applied
    if (this.seenIds.has(event.id)) return; // re-delivery guard
    this.seenIds.add(event.id);
    if (this.seenIds.size > 1000) {
      // Bounded memory: seq ordering already protects us from replays.
      this.seenIds = new Set([...this.seenIds].slice(-500));
    }
    this.lastSeq = event.seq;
    this.dispatch(event);
  }

  /** Connect + listen forever (until stop()). Reconnects with backoff. */
  async start(): Promise<void> {
    if (this.running) return; // one bus, one path
    this.running = true;
    this.abort = new AbortController();
    let backoffMs = 1000;
    while (this.running) {
      try {
        await this.refetchWorldState(); // rebuild state on (re)connect (§4.2)
        const resp = await fetch(`${this.baseUrl}/api/events`, {
          headers: this.headers(),
          signal: this.abort.signal,
        });
        if (!resp.ok || !resp.body) {
          throw new Error(`events stream failed: HTTP ${resp.status}`);
        }
        this.listeners.onConnectionChange(true);
        backoffMs = 1000;
        for await (const frame of readSseFrames(resp.body)) {
          if (frame.event === undefined) continue;
          // data payloads are WorldEvent JSON (§5.3); a malformed frame is a
          // hard, visible error — never a silently dropped event (§2.4).
          const event = JSON.parse(frame.data) as WorldEvent;
          if (event.seq > this.lastSeq + 1) {
            await this.refetchWorldState(); // gap → rebuild, resume from seq
          }
          this.handleEvent(event);
        }
        throw new Error("events stream ended unexpectedly");
      } catch (err) {
        if (!this.running) return; // stopped deliberately — clean exit
        this.listeners.onConnectionChange(false);
        this.listeners.onError(
          err instanceof Error ? err.message : "events stream error",
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 10_000);
      }
    }
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
  }
}
