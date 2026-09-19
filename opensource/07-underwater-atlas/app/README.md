# Knowledge Atlas — integration notes

> The data lives in `src/lib/atlas.js`. This document covers the page's data
> structures and how to adapt them; the page itself renders none of this text.
> Read this before touching the data.

## What this page is

An interactive 3D knowledge network. Nodes are concepts; edges are **directed
prerequisites** (A → B reads as "learn A before B"), plus an undirected `rel`
kind for sibling/related concepts. Seven clusters are each anchored to a fixed
bearing on the sphere, so the same data produces the same map every time — it
can be memorized like a map.

The built-in dataset is an "AI technology knowledge network" and is only a
sample. What is genuinely reusable is the rendering and interaction layer:
GPU-instanced self-luminous nodes, a signal-flow shader traveling along edges,
select-to-dim, and BFS shortest paths.

## Swap in your own data

Only three constants in `src/lib/atlas.js` need to change; nothing else does:

- `CLUSTERS` — `{id, name, color, anchor:[x,y,z]}`. `anchor` is the cluster's
  bearing on the sphere (normalized internally) and decides which region of
  the sky it occupies. Pick self-luminous colors — the page blends additively
  and murky colors smear.
- `NODES` — `[name, clusterId, weight 1-6, one-line gloss]`. Weight only
  affects sphere size, not layout.
- `EDGES` — `[source, target, 'pre' | 'rel']`. Names double as ids, so the
  edge table stays readable and editable without a lookup table.

40–300 nodes works best. Below 40 the "star map" feel falls apart; above 300
the CPU force layout (O(n²) repulsion) starts dropping frames — at that point
swap `layout()` for Barnes-Hut or switch to pre-baked coordinates.

## Have an agent fill in the data

Send the following prompt to the agent together with your source material
(papers, course syllabi, product docs, codebase notes):

```
Read the material I gave you and distill it into a knowledge network, output
exactly three JS constants I can paste into src/lib/atlas.js.

Rules:
1. CLUSTERS: 5–8, one per subject domain in the material. anchor = direction
   vectors spread over the unit sphere — related clusters near each other,
   unrelated ones far apart. color = bright self-luminous tones (HSL lightness
   60–75, saturation 60–90), hues at least 40 degrees apart.
2. NODES: 60–150. Keep names short — long labels collide in 3D. Weight 1–6
   marks how central a concept is (high-degree nodes get 5–6). The gloss is a
   single self-contained sentence; never write "see above".
3. EDGES: 'pre' for prerequisites (directed, basic → advanced), 'rel' for
   related siblings (undirected). Keep average degree at 3.5–5: below 3 the
   graph scatters into islands, above 6 it turns into a hairball. Rather drop
   a weak relation than force connectivity.
4. Output only the three const blocks, no commentary. Names in EDGES must
   match NODES verbatim.
```

## Dark and light themes

The Day/Night toggle on the toolbar switches four things — miss one and the
illusion breaks:

1. CSS tokens (`:root[data-theme=...]`)
2. Each cluster's color — every cluster carries `dark` and `light` variants;
   `applyTheme` writes the active one back to `c.color`, and everything else
   just reads `c.color` without knowing themes exist
3. The color buffers on the GPU (`aColor`, one each for nodes and edges)
4. **The blending mode.** The easiest to forget: additive blending on white
   paper burns every node into a gray smear and looks broken. The light theme
   must switch to `NormalBlending` and take the `uLight` branch in the
   shaders — nodes go from "glowing orbs" to "solid beads", edges from
   "light trails" to "ink lines".

## Tuning the look

- Node glow strength: the glow layer's `uMul` (2.7) and the core layer's
  fragment alpha, both in the two node materials inside `createAtlas()`.
- Signal-flow speed and density: the edge shader's `uTime*0.16` (speed) and
  `d*7.0` (pulse width).
- Dimming depth: `DIM = 0.12`. Raise it for more bustle, lower it for more
  focus.
- Label budget: `LABEL_BUDGET = 14`. CJK labels run wider than Latin ones;
  don't push past 20.

## Spinning on open

`let spin = true`. A static 3D graph doesn't read as 3D at first glance — let
it turn, and hand control back the moment the user drags (the `spin = false`
in `pointermove`). The toolbar's auto-orbit button and the spacebar both stop
it.
