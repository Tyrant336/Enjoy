# Knowledge Atlas — usage notes (for the agent)

A purely front-end, interactive 3D knowledge-network website (React + three.js +
custom GLSL shaders + SVG icons).
The site's presentation language follows the user's query language: whatever
language the user writes in is the language you use to explain and adapt the
site. This repo ships with English copy; if the user uses another language,
translate the UI strings and the dataset accordingly.

## Step one: ask the user

Before changing anything, use the ask_user tool to ask a few questions:

1. **Do you want to turn this page into a full-stack app?** That means adding a
   server and a database so data (e.g. nodes, edges, or notes the user
   maintains) is stored persistently — surviving reloads and syncing across
   devices — instead of living only inside this static page.
2. **What content should it show?** The built-in dataset is a sample "AI
   technology knowledge network" (81 concepts, 7 clusters). The rendering and
   interaction layer can carry any domain: a course syllabus, a paper
   landscape, product documentation, a team knowledge base, a tech radar…
   Given source material, distill it into new CLUSTERS / NODES / EDGES.
3. **Default theme and palette?** Dark or light as the default on open; keep
   the seven equal-luminance cluster colors or switch to a palette the user
   provides.
4. **Which interactions to keep?** Search, cluster toggles, the three views
   (atlas / sphere / tiers) and Shift-click shortest paths are all kept by
   default.

If the user gives no answers at all, just load the default site files and
change nothing.

## What this is / file layout

An interactive 3D knowledge star map: nodes are concepts, directed edges are
prerequisites (A → B = "learn A before B"), and undirected `rel` edges mark
related concepts. Seven clusters are anchored to fixed bearings on a sphere,
so the same data yields the same map on every open. The left rail holds search
and the cluster legend, the right drawer shows concept details, and the bottom
toolbar switches view / signal flow / labels / auto-orbit / zoom / theme.

```
index.html                entry, mounts React
package.json              deps: react / react-dom / three; built with vite
vite.config.ts
tsconfig.json  tsconfig.app.json  tsconfig.node.json
public/fonts/             Geist / Geist Mono variable fonts (woff2)
src/main.tsx              React mount entry
src/App.tsx               all DOM UI: sidebar, legend, list, detail drawer, toolbar
src/lib/atlas.js          data (CLUSTERS / NODES / EDGES) + the atlas engine
                          (layout, rendering, interaction)
src/styles/kit.css        design tokens and shared controls
src/styles/app.css        page layout and component styles
README.md                 data structures and how to swap in your own data
```

If the user only wants to look at the site, load it as-is. When they have
specific needs: UI copy lives in `src/App.tsx`, all data lives in the three
constants at the top of `src/lib/atlas.js` (see README.md for how to re-skin
the data), and static assets like fonts are in `public/fonts/`. `dist/` and
`node_modules/` are build output and dependencies — do not edit them.

Optional: You can use image and video generation tools if it suits user's query.

## Tech notes (3D / shaders)

Everything that matters is in `src/lib/atlas.js`, thoroughly commented — read
it before making changes. Quick reference:

- **Nodes are two THREE.Points layers with custom ShaderMaterials.** A large
  faint glow layer (atmosphere) and a small bright core layer (sphere feel),
  both additively blended. `gl_PointSize` converts world units to pixels via
  `uPx = h / (2·tan(fov/2))`, so perspective scaling is real and needs no
  hand tuning.
- **Edges are LineSegments with a signal-flow shader.** Each edge carries
  aT / aSeed / aDir attributes; the fragment shader moves a pulse of light
  from source to target with `fract(seed + t*0.16)` to express direction (no
  arrowheads). Brightness uses the shortest distance on the ring to avoid
  flicker at the wrap seam.
- **Layout is CPU force-directed.** O(n²) repulsion + springs + a weak pull
  toward cluster anchors, with alpha-temperature annealing. All three views
  share one force set and only swap the anchor array. 220 warm-up steps run
  at load so the first frame is already converged.
- **Picking does not use Raycaster.** Every frame already projects all nodes
  to screen coordinates for the labels; picking reuses those coordinates for
  nearest-neighbor lookup, with the radius derived from the rendered size.
- **Labels come from a fixed pool of 44 divs**, recycled, with overlap
  avoidance via bounding-box checks; allocating DOM per frame would make the
  GC hiccup.
- **A theme switch touches four places**: CSS tokens, the clusters' dark/light
  color variants, the aColor buffers on the GPU, and the blending mode —
  light mode must switch to NormalBlending and take the uLight branch in the
  shaders, or additive blending smears everything into gray on white paper.
- **All animation is "target value + per-frame exponential approach"**
  (frame-rate independent), so select-to-dim, camera moves and zoom always
  fade instead of jumping.

Constraints when swapping data: 40–300 nodes works best; pick bright
self-luminous cluster colors; keep average degree at 3.5–5. See README.md
for details.
