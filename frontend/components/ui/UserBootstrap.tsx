"use client";

/**
 * UserBootstrap.tsx — mount-once wiring for the harbour (REQUIREMENTS §4.4).
 *
 * On mount:
 * 1. ensures the harbour identity exists (localStorage UUID + IANA tz),
 * 2. registers the world's production hostHandlers (hostWiring.ts),
 * 3. fetches /api/world-state into uiStore (the rebuilt projection, §4.2),
 * 4. if a real WorldApi is passed in, starts the WorldBus (SSE) — with no
 *    worldApi there is NO bus: the UI then works off REST + world-state
 *    refetches only (handoff §4.1: never start the bus against a stub).
 *
 * Renders nothing.
 */

import { useEffect } from "react";
import { WorldBus } from "@/lib/worldBus";
import type { WorldApi } from "@/lib/worldApi";
import { harbourBaseUrl } from "./api";
import { getHarbourIdentity } from "./identity";
import { refreshWorldState } from "./actions";
import { registerHostHandlers } from "./hostWiring";
import { useUiStore } from "./uiStore";

export default function UserBootstrap({ worldApi }: { worldApi?: WorldApi }) {
  useEffect(() => {
    const identity = getHarbourIdentity();
    registerHostHandlers();
    void refreshWorldState();

    if (!worldApi) return; // UI-only mode: REST + refetch, no SSE bus.

    const ui = () => useUiStore.getState();
    const bus = new WorldBus(harbourBaseUrl(), identity, worldApi, {
      onWorldState: (state) => ui().setWorldState(state),
      // §7.4: every narrator line also lands in the readable transcript.
      onNarrate: (event) =>
        ui().addTranscript({ id: event.id, who: "narrator", text: event.text }),
      onTourOffer: (roadmapId) => ui().setTourOffer(roadmapId),
      onTourStart: (roadmapId) => ui().setTourStarted(roadmapId),
      onTourEnd: () => ui().setTourEnded(),
      onError: (message) => ui().setError(message),
      onConnectionChange: (connected) => {
        ui().setBusConnected(connected);
        ui().setOffline(!connected);
      },
    });
    void bus.start();
    return () => bus.stop();
  }, [worldApi]);

  return null;
}
