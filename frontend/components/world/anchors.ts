"use client";

/**
 * anchors.ts — screen-space anchors where Agent L's UI mounts onto world
 * objects (Phase 2 task: the "Today" task-sheet hook). The world owns the 3D
 * positions; L renders the sheet itself.
 *
 * SHAPE (for the monitor to relay):
 *   registerAnchor("today", worldPosGetter)   — Fishboat does this
 *   useScreenAnchor("today") → { x, y, visible } | null  — L's TaskSheet uses
 * The hook re-renders only when the projected position moves ≥1 px.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";

type AnchorGetter = () => THREE.Vector3;

const anchors = new Map<string, AnchorGetter>();
const listeners = new Set<() => void>();

let camera: THREE.Camera | null = null;
let viewportW = 0;
let viewportH = 0;

export function registerAnchorCamera(cam: THREE.Camera, w: number, h: number): void {
  camera = cam;
  viewportW = w;
  viewportH = h;
  listeners.forEach((fn) => fn());
}

export function registerAnchor(name: string, getter: AnchorGetter): () => void {
  anchors.set(name, getter);
  listeners.forEach((fn) => fn());
  return () => {
    anchors.delete(name);
    listeners.forEach((fn) => fn());
  };
}

export type ScreenAnchor = { x: number; y: number; visible: boolean };

function compute(name: string): ScreenAnchor | null {
  const getter = anchors.get(name);
  if (!getter || !camera) return null;
  const v = getter().clone().project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * viewportW,
    y: (-v.y * 0.5 + 0.5) * viewportH,
    visible: v.z < 1,
  };
}

/** Subscribes to an anchor's screen position (rAF-driven, 1 px threshold). */
export function useScreenAnchor(name: string): ScreenAnchor | null {
  const [value, setValue] = useState<ScreenAnchor | null>(null);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const next = compute(name);
      setValue((prev) => {
        if (!next || !prev) return next;
        if (
          Math.abs(next.x - prev.x) < 1 &&
          Math.abs(next.y - prev.y) < 1 &&
          next.visible === prev.visible
        ) {
          return prev;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const resub = () => setValue(compute(name));
    listeners.add(resub);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      listeners.delete(resub);
    };
  }, [name]);

  return value;
}
