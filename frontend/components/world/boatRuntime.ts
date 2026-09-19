"use client";

/**
 * boatRuntime.ts — per-frame live transforms of the fleet, kept OUT of
 * Zustand (writing the store 60×/s would re-render the world). Boat
 * components write their live angle/position/heading here every frame;
 * CameraRig (review POV), ReviewMode (card/grade boat placement) and the
 * dock animation read from it.
 *
 * Fail loudly: readers throw when asked for a boat that isn't registered
 * (a stale deckId is a bug, never a silent origin fallback).
 */

import * as THREE from "three";

export type BoatRuntime = {
  /** Live circle angle (rad) — frozen while reviewing/docking/docked. */
  angle: number;
  /** Live world position on the water (y ≈ 0, bob excluded). */
  pos: THREE.Vector3;
  /** Unit heading on the XZ plane (direction of travel / bow). */
  forward: THREE.Vector3;
};

const registry = new Map<string, BoatRuntime>();

export function writeBoatRuntime(deckId: string, rt: BoatRuntime): void {
  registry.set(deckId, rt);
}

export function readBoatRuntime(deckId: string): BoatRuntime {
  const rt = registry.get(deckId);
  if (!rt) {
    throw new Error(`boatRuntime: no live boat registered for deck '${deckId}'`);
  }
  return rt;
}

export function hasBoatRuntime(deckId: string): boolean {
  return registry.has(deckId);
}

export function dropBoatRuntime(deckId: string): void {
  registry.delete(deckId);
}
