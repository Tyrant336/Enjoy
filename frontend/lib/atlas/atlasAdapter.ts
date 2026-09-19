/**
 * atlasAdapter.ts — THE one data path into the underwater engine
 * (REQUIREMENTS §4.3.3, AGENTS.md §3 "one way, one path").
 *
 * Maps the canonical KnowledgeGraph (lib/types.ts, §5.1 — the shape of
 * `GET /agents/kg/graph`; Phase 1 feeds it from lib/fixtures/atlas-seed.json)
 * to the engine constants consumed by `lib/atlas/atlas.js` `loadPdfGraph`:
 *
 *   CLUSTERS ← one per deck/subject; color from the locked no-red
 *              CLUSTER_PALETTE (FR-3.6); anchor = deterministic sphere
 *              bearing (hash of cluster id → fixed direction — same data,
 *              same map, §2.4).
 *   NODES    ← [label, clusterId, weight 1–6 by degree, gloss, {deckIds, taskIds}]
 *   EDGES    ← REQUIRES | PART_OF → 'pre' (directed), the rest → 'rel'.
 *
 * Boundary validation (AGENTS.md §2.4): malformed graph = hard error naming
 * the offending payload, never a partial/garbled map.
 */

import type { KGEdgeType, KnowledgeGraph } from "@/lib/types";
import { CLUSTER_PALETTE } from "@/lib/theme";

export type AtlasCluster = {
  id: string;
  name: string;
  color: string;
  anchor: [number, number, number];
};
/** Engine node tuple: [name, clusterId, weight 1–6, gloss, extra metadata]. */
export type AtlasNodeTuple = [
  name: string,
  clusterId: string,
  weight: number,
  gloss: string,
  extra: { deckIds: string[]; taskIds: string[] },
];
export type AtlasEdgeTuple = [source: string, target: string, kind: "pre" | "rel"];

export type AtlasGraphConstants = {
  CLUSTERS: AtlasCluster[];
  NODES: AtlasNodeTuple[];
  EDGES: AtlasEdgeTuple[];
  meta: { id: string; name: string };
};

/** djb2 — deterministic, same input → same bearing on every open (§4.3.3). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic sphere bearing from the cluster id (uniform-ish spread). */
function bearingFor(clusterId: string): [number, number, number] {
  const h = hashString(clusterId);
  const lon = ((h % 360) * Math.PI) / 180;
  // asinh spread keeps latitudes off the poles.
  const v = (((h >> 7) % 1000) / 1000) * 2 - 1; // -1..1
  const lat = v * 1.1;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
}

/** REQUIRES/PART_OF are directed prerequisites; the rest are siblings. */
function edgeKind(type: KGEdgeType): "pre" | "rel" {
  return type === "REQUIRES" || type === "PART_OF" ? "pre" : "rel";
}

export function adaptGraphToAtlas(graph: KnowledgeGraph): AtlasGraphConstants {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
    throw new Error("atlasAdapter: graph must be { nodes: [], links: [] }");
  }

  // Cluster order is deterministic: sorted ids → fixed palette assignment.
  const clusterIds = [
    ...new Set(graph.nodes.map((n) => n.clusterId)),
  ].sort();
  if (clusterIds.length > CLUSTER_PALETTE.length) {
    throw new Error(
      `atlasAdapter: ${clusterIds.length} clusters exceeds the locked no-red palette of ${CLUSTER_PALETTE.length} (FR-3.6)`,
    );
  }

  const CLUSTERS: AtlasCluster[] = clusterIds.map((id, i) => ({
    id,
    // Short display name: deck-thermo-basics → Thermo basics.
    name: id.replace(/^deck-/, "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    color: CLUSTER_PALETTE[i].hex,
    anchor: bearingFor(id),
  }));

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const l of graph.links) {
    if (!byId.has(l.source) || !byId.has(l.target)) {
      throw new Error(
        `atlasAdapter: dangling link ${l.source} → ${l.target} (node id not in graph)`,
      );
    }
  }
  const degree = new Map<string, number>();
  for (const l of graph.links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }

  const labels = new Set<string>();
  const NODES: AtlasNodeTuple[] = graph.nodes.map((n) => {
    if (labels.has(n.label)) {
      throw new Error(
        `atlasAdapter: duplicate node label '${n.label}' — engine names double as ids`,
      );
    }
    labels.add(n.label);
    if (!clusterIds.includes(n.clusterId)) {
      throw new Error(
        `atlasAdapter: node '${n.id}' has unknown clusterId '${n.clusterId}'`,
      );
    }
    // Weight 1–6 by degree (hubs get 5–6, leaves 1).
    const deg = degree.get(n.id) ?? 0;
    const weight = Math.max(1, Math.min(6, Math.round(deg / 2)));
    return [
      n.label,
      n.clusterId,
      weight,
      n.gloss,
      { deckIds: n.deckIds, taskIds: n.taskIds },
    ];
  });

  // Dedupe identical engine edges: multiple canonical edge types can map to
  // the same engine kind (e.g. CONTRASTS_WITH + EXAMPLE_OF both → 'rel'),
  // which would otherwise push the same neighbor into a list twice.
  const seenEdge = new Set<string>();
  const EDGES: AtlasEdgeTuple[] = [];
  for (const l of graph.links) {
    const tuple: AtlasEdgeTuple = [
      byId.get(l.source)!.label,
      byId.get(l.target)!.label,
      edgeKind(l.type),
    ];
    const key = tuple.join("|");
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    EDGES.push(tuple);
  }

  return {
    CLUSTERS,
    NODES,
    EDGES,
    meta: { id: "harbour-atlas", name: "Knowledge Atlas" },
  };
}
