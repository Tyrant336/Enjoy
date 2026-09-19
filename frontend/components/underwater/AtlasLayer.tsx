"use client";

/**
 * AtlasLayer.tsx — Layer B: the underwater knowledge atlas (REQUIREMENTS
 * §4.3 "two scenes", FR-3.4/3.5). Full-screen layer that mounts the locked
 * 07 engine (frontend/lib/atlas/atlas.js) on its OWN canvas, visible only in
 * underwater mode with strict mount/unmount (a single engine instance).
 *
 * Data: ONE path — fixture/API KnowledgeGraph → atlasAdapter → loadPdfGraph
 * (§4.3.3). Node click → engine detail drawer with gloss + linked deck/task
 * ids (FR-3.5). A visible "Surface" control always exists underwater (§4.3.2).
 * WebGL unavailable or malformed data → explicit soft-amber state (AGENTS.md §2).
 */

import { useEffect, useRef, useState } from "react";
import { createAtlas, loadPdfGraph } from "@/lib/atlas/atlas.js";
import { adaptGraphToAtlas } from "@/lib/atlas/atlasAdapter";
import type { KnowledgeGraph } from "@/lib/types";
import { LABEL, MOTION, PALETTE } from "@/lib/theme";
import { useWorldStore } from "@/components/world/worldStore";
import seedGraph from "@/lib/fixtures/atlas-seed.json";

type ClusterChip = { id: string; name: string; color: string; count: number };
type DrawerData = {
  i: number;
  name: string;
  desc: string;
  cname: string;
  color: string;
  deg: number;
  depth: number;
  deckIds: string[];
  taskIds: string[];
  card: { front: string; back: string };
  groups: { title: string; tag: string; items: { i: number; name: string; color: string }[] }[];
};
type AtlasApi = {
  setView: (v: string) => void;
  toggleFlow: () => void;
  toggleLabel: () => void;
  toggleSpin: () => void;
  reset: () => void;
  dolly: (f: number) => void;
  zoomReset: () => void;
  toggleCluster: (id: string) => void;
  selectAt: (i: number) => void;
  hoverAt: (i: number | null) => void;
  setQuery: (v: string) => void;
  clearPath: () => void;
  centerOn: (i: number) => void;
  startPath: (i: number) => void;
  dispose: () => void;
};

export default function AtlasLayer() {
  const worldMode = useWorldStore((s) => s.worldMode);
  // Strict mount/unmount: the engine exists only while underwater (§4.3.1).
  if (worldMode !== "underwater") return null;
  return <AtlasEngine />;
}

function AtlasEngine() {
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const surface = useWorldStore((s) => s.surface);

  const stage = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const hudMode = useRef<HTMLElement>(null);
  const hudSel = useRef<HTMLDivElement>(null);
  const pathbar = useRef<HTMLDivElement>(null);
  const chain = useRef<HTMLSpanElement>(null);
  const zlvl = useRef<HTMLButtonElement>(null);
  const sNode = useRef<HTMLSpanElement>(null);
  const sEdge = useRef<HTMLSpanElement>(null);
  const sDeg = useRef<HTMLSpanElement>(null);
  const sFps = useRef<HTMLSpanElement>(null);
  const q = useRef<HTMLInputElement>(null);
  const api = useRef<AtlasApi | null>(null);

  const [fatal, setFatal] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [clusters, setClusters] = useState<ClusterChip[]>([]);
  const [clusterOff, setClusterOff] = useState<string[]>([]);

  useEffect(() => {
    // §7.2: an empty atlas is a gentle placeholder, never a broken engine.
    const graph = seedGraph as unknown as KnowledgeGraph;
    if (graph.nodes.length === 0) return;

    let a: AtlasApi;
    try {
      const { CLUSTERS, NODES, EDGES, meta } = adaptGraphToAtlas(graph);
      loadPdfGraph(NODES, EDGES, CLUSTERS, meta);
      const engine = createAtlas({
        els: {
          stage: stage.current!, labels: labels.current!,
          hudMode: hudMode.current!, hudSel: hudSel.current!,
          pathbar: pathbar.current!, chain: chain.current!,
          zlvl: zlvl.current!, sNode: sNode.current!, sEdge: sEdge.current!,
          sDeg: sDeg.current!, sFps: sFps.current!, q: q.current!,
        },
        emit: {
          gate: (down: boolean) => {
            if (down) setFatal("WebGL is unavailable on this device.");
          },
          drawer: setDrawer,
          clusters: (c: ClusterChip[]) => {
            setClusters(c);
          },
          list: () => {}, // the sidebar list is a Phase-2 surface
          tools: () => {},
        },
      });
      a = engine as unknown as AtlasApi;
    } catch (err) {
      // Fail loudly: malformed fixture/engine failure = explicit amber state.
      // (microtask: React forbids synchronous setState inside an effect body)
      const message = err instanceof Error ? err.message : String(err);
      queueMicrotask(() => setFatal(message));
      return;
    }
    api.current = a;
    // §7.4: reduced motion → no auto-orbit on open.
    if (reducedMotion) a.toggleSpin();
    return () => {
      a.dispose();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = (seedGraph as unknown as KnowledgeGraph).nodes.length === 0;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, background: PALETTE.abyssDeep.hex }}>
      {/* Engine label chips (.lab divs are engine-managed DOM). */}
      <style>{`
        .atlas-stage canvas{display:block;position:absolute;inset:0;width:100%;height:100%}
        .atlas-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}
        .atlas-labels .lab{position:absolute;white-space:nowrap;font-size:12px;
          letter-spacing:.01em;color:${PALETTE.mist.hex};will-change:transform,opacity;
          text-shadow:0 0 5px rgba(4,22,27,.9),0 0 10px rgba(4,22,27,.7)}
        .atlas-labels .lab.sm{font-size:10.5px;color:#bfe6e2}
        .atlas-pathbar{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);
          background:${LABEL.fill};color:${LABEL.text};border-radius:999px;
          padding:7px 14px;font-size:12.5px;box-shadow:${LABEL.shadow};
          display:none;align-items:center;gap:10px;z-index:4}
        .atlas-pathbar.on{display:flex}
        .atlas-pathbar em{font-style:normal;margin:0 4px;color:${PALETTE.greyBlue.hex}}
      `}</style>

      {/* Engine stage (canvas mounts here) + projected-label host. */}
      <div ref={stage} className="atlas-stage" style={{ position: "absolute", inset: 0 }} />
      <div ref={labels} className="atlas-labels" />

      {/* §7.2 empty-atlas placeholder. */}
      {empty && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 5 }}>
          <div style={{ color: PALETTE.mist.hex, fontFamily: "system-ui", fontSize: 15, opacity: 0.85 }}>
            Your atlas is still forming — add material and watch it grow.
          </div>
        </div>
      )}

      {/* Explicit error state (soft amber, never silent). */}
      {fatal && (
        <div role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 6 }}>
          <div style={{
            background: PALETTE.mist.hex, border: `2px solid ${PALETTE.softAmber.hex}`,
            borderRadius: 14, padding: "18px 26px", maxWidth: 420,
            color: PALETTE.ink.hex, fontFamily: "system-ui", boxShadow: LABEL.shadow,
          }}>
            <strong>The atlas could not surface.</strong>
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5 }}>{fatal}</p>
          </div>
        </div>
      )}

      {/* Path bar (engine-driven; shows BFS path instructions/results). */}
      <div ref={pathbar} className="atlas-pathbar">
        <span ref={chain} />
        <button type="button" onClick={() => api.current?.clearPath()}
          style={{ border: "none", background: "none", cursor: "pointer", color: LABEL.text }}>
          ✕
        </button>
      </div>

      {/* Minimal instrument strip: search + stats + zoom (mono numerals). */}
      <div style={{
        position: "absolute", left: 16, top: 16, zIndex: 4, display: "flex",
        flexDirection: "column", gap: 8, fontFamily: "system-ui",
      }}>
        <input
          ref={q}
          type="search"
          placeholder="Search the atlas…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => api.current?.setQuery(e.target.value)}
          style={{
            background: "rgba(7,35,46,.72)", color: PALETTE.mist.hex,
            border: "1px solid rgba(237,237,221,.25)", borderRadius: 999,
            padding: "7px 14px", fontSize: 13, outline: "none", width: 210,
          }}
        />
        <div style={{
          display: "flex", gap: 10, fontSize: 11, color: "#9fd4cf",
          fontFamily: "ui-monospace, monospace", paddingLeft: 4,
        }}>
          <span><span ref={sNode}>—</span> nodes</span>
          <span><span ref={sEdge}>—</span> edges</span>
          <span>deg <span ref={sDeg}>—</span></span>
          <span><span ref={sFps}>—</span> fps</span>
        </div>
        {/* Cluster legend chips (FR-3.6 palette swatches; click = toggle). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {clusters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                api.current?.toggleCluster(c.id);
                setClusterOff((o) => (o.includes(c.id) ? o.filter((x) => x !== c.id) : [...o, c.id]));
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "fit-content",
                background: "rgba(7,35,46,.72)", border: "1px solid rgba(237,237,221,.18)",
                borderRadius: 999, padding: "4px 12px", cursor: "pointer",
                color: PALETTE.mist.hex, fontSize: 12,
                opacity: clusterOff.includes(c.id) ? 0.4 : 1,
                transition: `opacity 300ms ${MOTION.ease}`,
              }}
            >
              <i style={{ width: 9, height: 9, borderRadius: 99, background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
              {c.name} · {c.count}
            </button>
          ))}
        </div>
      </div>

      {/* HUD: view name + hover/selection readout; zoom controls. */}
      <div style={{
        position: "absolute", right: 16, top: 64, zIndex: 4, textAlign: "right",
        fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#8fc9c4",
        lineHeight: 1.8, pointerEvents: "none",
      }}>
        <b ref={hudMode} style={{ color: "#cfe9e5", fontWeight: 500 }}>REEF VIEW</b>
        <div ref={hudSel}>Nothing selected</div>
      </div>
      <div style={{ position: "absolute", right: 16, bottom: 16, zIndex: 4, display: "flex", gap: 6 }}>
        <button type="button" style={toolBtn} onClick={() => api.current?.dolly(1.18)}>−</button>
        <button type="button" style={toolBtn} ref={zlvl} onClick={() => api.current?.zoomReset()}>100%</button>
        <button type="button" style={toolBtn} onClick={() => api.current?.dolly(1 / 1.18)}>＋</button>
        <button type="button" style={toolBtn} onClick={() => api.current?.reset()}>Reset</button>
      </div>

      {/* §4.3.2: a visible "Surface" control ALWAYS exists underwater.
          (Offset left of the app-level Labels toggle in the top corner.) */}
      <div style={{ position: "absolute", top: 16, right: 100, zIndex: 4 }}>
        <button
          type="button"
          onClick={surface}
          style={{
            background: LABEL.fill, color: LABEL.text, boxShadow: LABEL.shadow,
            border: "none", borderRadius: 999, padding: "8px 16px",
            fontSize: 13, fontWeight: 550, cursor: "pointer",
            fontFamily: "ui-rounded, system-ui, sans-serif",
          }}
        >
          ↑ Surface
        </button>
      </div>

      {/* FR-3.5 detail drawer: gloss + linked deck/task ids + neighbors. */}
      {drawer && (
        <aside style={{
          position: "absolute", right: 0, top: 60, bottom: 0, width: 320, zIndex: 5,
          background: "rgba(7,35,46,.88)", backdropFilter: "blur(12px)",
          borderLeft: "1px solid rgba(237,237,221,.16)",
          padding: "20px 20px 24px", overflowY: "auto",
          color: PALETTE.mist.hex, fontFamily: "system-ui",
        }}>
          <div style={{ fontSize: 11, color: "#8fc9c4", display: "flex", alignItems: "center", gap: 7 }}>
            <i style={{ width: 9, height: 9, borderRadius: 99, background: drawer.color, boxShadow: `0 0 8px ${drawer.color}` }} />
            {drawer.cname} · degree {drawer.deg} · depth {drawer.depth}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "8px 0 6px" }}>{drawer.name}</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#d6efeb", margin: 0 }}>{drawer.desc}</p>

          {(drawer.deckIds.length > 0 || drawer.taskIds.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".08em", color: "#8fc9c4", textTransform: "uppercase" }}>
                Connected dots
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                {drawer.deckIds.map((id) => (
                  <span key={id} style={idChip}>⛵ {id}</span>
                ))}
                {drawer.taskIds.map((id) => (
                  <span key={id} style={idChip}>✓ {id}</span>
                ))}
              </div>
            </div>
          )}

          {drawer.groups.map((g) => (
            <div key={g.tag} style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".08em", color: "#8fc9c4", textTransform: "uppercase" }}>
                {g.title} · {g.items.length}
              </div>
              {g.items.map((m) => (
                <button
                  key={m.i}
                  type="button"
                  onClick={() => api.current?.selectAt(m.i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    background: "none", border: "none", padding: "6px 2px",
                    cursor: "pointer", color: PALETTE.mist.hex, fontSize: 13, textAlign: "left",
                  }}
                >
                  <i style={{ width: 8, height: 8, borderRadius: 99, background: m.color, boxShadow: `0 0 6px ${m.color}` }} />
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <span style={{ fontSize: 10, fontFamily: "ui-monospace, monospace", color: "#8fc9c4" }}>{g.tag}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  background: "rgba(7,35,46,.72)",
  color: PALETTE.mist.hex,
  border: "1px solid rgba(237,237,221,.25)",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "ui-monospace, monospace",
};

const idChip: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  border: "1px solid rgba(237,237,221,.28)",
  borderRadius: 999,
  padding: "3px 10px",
  color: PALETTE.mist.hex,
};
