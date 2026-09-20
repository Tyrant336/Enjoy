"use client";

/**
 * api.ts — THE one fetch wrapper for the UI kit.
 *
 * Every request carries the harbour identity headers (§4.4) and every
 * non-2xx is turned into a loud `HarbourApiError` carrying the §5.2 envelope
 * — never a silently undefined response (AGENTS.md §2).
 */

import type { ErrorEnvelope } from "@/lib/types";
import { getHarbourIdentity } from "./identity";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class HarbourApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ErrorEnvelope,
  ) {
    super(envelope.message);
  }
}

export async function harbourFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { userId, timezone } = getHarbourIdentity();
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      // Multipart uploads (FormData) set their own boundary — never force
      // a JSON content-type on them.
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-Harbour-User-Id": userId,
      "X-Harbour-Timezone": timezone,
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    let envelope: ErrorEnvelope;
    try {
      envelope = (await resp.json()) as ErrorEnvelope;
    } catch {
      // A non-envelope error body means something upstream of our API broke —
      // still surface it loudly, never swallow (AGENTS.md §2.2).
      envelope = {
        code: `HTTP_${resp.status}`,
        message: `The harbour answered with HTTP ${resp.status}.`,
        detail: null,
        recoverable: resp.status < 500,
      };
    }
    throw new HarbourApiError(resp.status, envelope);
  }
  return (await resp.json()) as T;
}

export function harbourBaseUrl(): string {
  return BASE_URL;
}
