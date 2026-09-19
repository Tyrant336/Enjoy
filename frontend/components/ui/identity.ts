"use client";

/**
 * identity.ts — user bootstrap (REQUIREMENTS §4.4: no auth).
 *
 * One UUID per browser, generated on first load, stored in localStorage as
 * `harbour_user_id`, sent on EVERY request as `X-Harbour-User-Id`. The IANA
 * timezone is detected once and sent as `X-Harbour-Timezone`. One module,
 * one way — every API call in the UI kit goes through `harbourFetch`
 * (api.ts), so headers can never be forgotten.
 */

import type { HarbourIdentity } from "@/lib/worldBus";

const STORAGE_KEY = "harbour_user_id";
const FALLBACK_TIMEZONE = "UTC";

let cached: HarbourIdentity | null = null;

export function getHarbourIdentity(): HarbourIdentity {
  if (cached) return cached;
  if (typeof window === "undefined") {
    // SSR render pass — identity is a browser concept; the client re-runs.
    return { userId: "ssr", timezone: FALLBACK_TIMEZONE };
  }
  let userId = window.localStorage.getItem(STORAGE_KEY);
  if (!userId) {
    userId = window.crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, userId);
  }
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  cached = { userId, timezone };
  return cached;
}
