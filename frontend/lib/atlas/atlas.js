/* ═══════════════════════════════════════════════════════════════════════
   SOURCE ATTRIBUTION (REQUIREMENTS §10): this file is adapted from
   opensource/07-underwater-atlas/app/src/lib/atlas.js — a project-provided
   Kimi-agent artifact ("Anki Abyss / Underwater Atlas") that ships with NO
   license file. Owner decision (2026-09-19, session 011): copy with this
   attribution comment; hackathon-accepted risk. See
   opensource/07-underwater-atlas/app/README.md and info.md.

   Adaptations for "enjoy" (Agent T, Phase 1 — docs/sessions/012):
   · NO canned data: the decks.js import (whose palette contained red
     #e0492e / #d63384) is NOT ported. Graph data arrives ONLY via
     loadPdfGraph() from frontend/lib/atlas/atlasAdapter.ts (one path,
     AGENTS.md §3). createAtlas() throws loudly without a loaded graph.
   · LOCKED dark-teal additive underwater look restored (REQUIREMENTS
     §2.2/§2.4): the shipped file had been re-themed to a bright "lagoon"
     with NormalBlending beads; here the scene is deep teal again and
     nodes/edges/rays blend additively (glowing orbs + light trails).
   · Node tuples accept a 5th element — extra metadata {deckIds, taskIds} —
     surfaced by the detail drawer (FR-3.5 "connecting the dots").
   ═══════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';

/* ─────────────────────────────────────────────────────────────────────────
   Graph assembly — rebuildable module state
   ───────────────────────────────────────────────────────────────────────── */

const R = 42;

let G = null;   // the one live graph; everything below reads it

export function loadPdfGraph(NODES, EDGES, CLUSTERS, meta = {}) {
  const clusters = CLUSTERS.map(c => ({ ...c }));
  const CMAP = Object.fromEntries(clusters.map(c => [c.id, c]));

  const nodes = NODES.map(([name, cid, w, desc, extra], i) => ({
    i, name, cid, w, desc, cluster: CMAP[cid],
    deckIds: extra?.deckIds ?? [], taskIds: extra?.taskIds ?? [],
    out: [], in: [], rel: [],
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    sx: 0, sy: 0, sz: 0, vis: true, alpha: 1, scale: 1,
  }));
  const byName = Object.fromEntries(nodes.map(n => [n.name, n]));

  /* Edges whose names don't match are dropped and named in the console —
     one typo in a hand-edited deck should never blank the whole page. */
  const edges = [];
  for (const [a, b, kind] of EDGES) {
    const s = byName[a], t = byName[b];
    if (!s || !t) { console.warn('[abyss] Dropped invalid edge:', a, '→', b); continue }
    edges.push({ s, t, kind, i: edges.length, alpha: 1 });
    if (kind === 'pre') { s.out.push(t); t.in.push(s) }
    else { s.rel.push(t); t.rel.push(s) }
  }
  const deg = n => n.out.length + n.in.length + n.rel.length;
  const adj = nodes.map(() => []);
  for (const e of edges) { adj[e.s.i].push(e.t.i); adj[e.t.i].push(e.s.i) }

  for (const c of clusters) {
    const [x, y, z] = c.anchor, l = Math.hypot(x, y, z) || 1;
    c.dir = [x / l, y / l, z / l];
  }

  /* Topological depth: concepts with no prerequisites are tier 0, the rest
     take "longest prerequisite chain + 1". Used by the Depths view. */
  const depth = new Array(nodes.length).fill(-1);
  let changed = true, guard = 0;
  for (const n of nodes) if (!n.in.length) depth[n.i] = 0;
  while (changed && guard++ < 40) {
    changed = false;
    for (const n of nodes) {
      let d = n.in.length ? -1 : 0;
      for (const p of n.in) if (depth[p.i] >= 0) d = Math.max(d, depth[p.i] + 1);
      if (d >= 0 && d !== depth[n.i]) { depth[n.i] = d; changed = true }
    }
  }
  for (let i = 0; i < depth.length; i++) if (depth[i] < 0) depth[i] = 2;
  const maxDepth = Math.max(...depth, 1);

  /* Three views share one force set and differ only in the anchor array.
     Reef: cluster bearings. School: one shell, longitude bands per cluster.
     Depths: the Y axis is topological depth. */
  const anchors = { atlas: [], shell: [], tier: [] };
  nodes.forEach((n, i) => {
    const d = n.cluster.dir;
    const pull = 1 - Math.min(deg(n), 12) / 26;   // hubs drift toward the center
    anchors.atlas.push([d[0] * R * pull, d[1] * R * pull, d[2] * R * pull]);

    const ci = clusters.indexOf(n.cluster);
    const within = nodes.filter(m => m.cid === n.cid).indexOf(n);
    const cnt = nodes.filter(m => m.cid === n.cid).length;
    const lon = (ci / clusters.length + within / cnt / clusters.length) * Math.PI * 2;
    const lat = (within / cnt - 0.5) * 1.5;
    anchors.shell.push([
      R * 0.95 * Math.cos(lat) * Math.cos(lon),
      R * 0.95 * Math.sin(lat),
      R * 0.95 * Math.cos(lat) * Math.sin(lon),
    ]);

    anchors.tier.push([
      d[0] * R * 0.72, (depth[i] / maxDepth - 0.5) * R * 1.5, d[2] * R * 0.72,
    ]);
  });

  nodes.forEach((n, i) => {
    const a = anchors.atlas[i];
    n.x = a[0] + (Math.random() - .5) * 16;
    n.y = a[1] + (Math.random() - .5) * 16;
    n.z = a[2] + (Math.random() - .5) * 16;
  });

  G = {
    clusters, nodes, edges, byName, adj, deg, depth, anchors,
    meta: { id: meta.id || 'reef', name: meta.name || 'Knowledge Reef' },
  };
  return G;
}

export const currentGraph = () => G;

/* ─────────────────────────────────────────────────────────────────────────
   Anki card generation — one card per node, one per prerequisite edge.
   ───────────────────────────────────────────────────────────────────────── */

export function cardForNode(n) {
  return { front: `What is ${n.name}?`, back: n.desc };
}

/* ═══════════════════════════════════════════════════════════════════════
   3D — LOCKED dark-teal additive underwater look (REQUIREMENTS §2.2/§2.4)
   ═══════════════════════════════════════════════════════════════════════ */

const FOV = 46;
const VIEW_NAMES = { atlas: 'REEF VIEW', shell: 'SCHOOL VIEW', tier: 'DEPTHS VIEW' };

/* Abyss palette (scene-side; matches frontend/lib/theme.ts tokens):
   deep #07232E · mid #13535D · top #298E99 · floor #10333B. */
const WATER = 0x0d3540;

export function createAtlas({ els, emit }) {
  const graph = G;
  if (!graph) {
    // Fail loudly (AGENTS.md §2): never boot on missing/canned data.
    throw new Error('[abyss] createAtlas() called before loadPdfGraph() — no graph data');
  }
  const { clusters, nodes, edges, adj, deg, depth, anchors } = graph;

  const ac = new AbortController();
  const { signal } = ac;
  const bind = (t, ev, fn, o) => t.addEventListener(ev, fn, { ...o, signal });
  let raf = 0;

  const { stage } = els;
  let renderer, scene, camera, glowPts, corePts, lineSeg;
  let ok = true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch { ok = false }
  if (!renderer) ok = false;

  if (!ok) { emit.gate(true); return { dispose() { } } }
  {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    stage.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(WATER, 0.0028);
    camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1600);
    renderer.setClearColor(WATER, 1);

    const hex = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b] };

    /* ── Force layout (CPU, annealed) ────────────────────────────────
       The KR/KA ratio decides whether the map reads well: too much
       repulsion balloons the graph out of frame; too much anchor pull
       flattens the topology into seven discs. */
    let alpha = 1, view = 'atlas';
    const REST = 9, KS = 0.04, KR = 130, KA = 0.05;

    function layout() {
      if (alpha < 0.004) return;
      const a = anchors[view];
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const q = nodes[j];
          let dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
          let d2 = dx * dx + dy * dy + dz * dz + 0.6;
          const f = KR / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d; dz /= d;
          p.vx += dx * f; p.vy += dy * f; p.vz += dz * f;
          q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f;
        }
      }
      for (const e of edges) {
        const p = e.s, q = e.t;
        let dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const f = (d - REST) * KS;
        dx /= d; dy /= d; dz /= d;
        p.vx += dx * f; p.vy += dy * f; p.vz += dz * f;
        q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f;
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], an = a[i];
        n.vx += (an[0] - n.x) * KA; n.vy += (an[1] - n.y) * KA; n.vz += (an[2] - n.z) * KA;
        const damp = 0.82;
        n.vx *= damp; n.vy *= damp; n.vz *= damp;
        n.x += n.vx * alpha; n.y += n.vy * alpha; n.z += n.vz * alpha;
      }
      alpha *= 0.988;
    }
    // Warm up so the first frame is already converged.
    for (let k = 0; k < 220; k++) layout();

    /* Framing distance derives from the converged bounding sphere, never a
       hard-coded number — those are guaranteed wrong after any data change. */
    function fitDist() {
      let r = 0;
      for (const n of nodes) r = Math.max(r, Math.hypot(n.x, n.y, n.z));
      return r / Math.sin(FOV * Math.PI / 360) * 0.97;
    }

    /* ── Water dome: the deep-teal abyss. A big BackSide sphere; custom
          gradient instead of scene.background so the dim daylight from the
          surface can live inside the water column. */
    const domeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform float uTime;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 deep = vec3(0.012, 0.075, 0.095);   // abyss floor dark
          vec3 mid  = vec3(0.045, 0.230, 0.270);   // deep teal column
          vec3 top  = vec3(0.110, 0.450, 0.500);   // toward the lit surface
          vec3 col = mix(deep, mid, smoothstep(-1.0, -0.05, h));
          col = mix(col, top, smoothstep(0.0, 0.85, h));
          // Dim surface glare: a soft cool halo at the zenith, never hot.
          vec3 sun = normalize(vec3(0.22, 1.0, 0.14));
          float sd = max(dot(d, sun), 0.0);
          col += pow(sd, 24.0) * vec3(0.35, 0.55, 0.55) * 0.30;
          col += pow(sd, 5.0)  * vec3(0.20, 0.38, 0.38) * 0.12;
          // Gentle caustic shimmer drifting across the water column.
          float ca = sin(d.x * 24.0 + uTime * 0.35) * sin(d.z * 21.0 - uTime * 0.27);
          col += ca * 0.012 * smoothstep(-0.3, 0.6, h);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 28), domeMat);
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    scene.add(dome);

    /* ── Seafloor: a dark teal disc below the graph with an animated
          caustic shimmer and a soft fade into the water at its rim. */
    const SAND_Y = -56, SAND_R = 128;
    const sandMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uTime;
        void main(){
          float r = length(vUv);
          vec3 sand = vec3(0.055, 0.180, 0.205);   // deep teal floor, no warm sand
          // Faint ripple bands, like wind-combed sand.
          float rip = sin(vUv.x * 34.0 + sin(vUv.y * 9.0) * 2.2) * 0.5 + 0.5;
          sand *= 0.94 + rip * 0.06;
          // Caustics: two interfering wave sets, sharpened into dim teal nets.
          float w1 = sin(vUv.x * 20.0 + uTime * 0.7) * sin(vUv.y * 17.0 - uTime * 0.55);
          float w2 = sin((vUv.x - vUv.y) * 13.0 + uTime * 0.42);
          float ca = pow(max(0.0, 1.0 - abs(w1 + w2) * 0.52), 6.0);
          sand += ca * vec3(0.35, 0.75, 0.75) * 0.16;
          // Darken slightly under the graph: the reef casts a soft shadow.
          sand *= 1.0 - smoothstep(0.5, 0.0, r) * 0.18;
          float alpha = smoothstep(1.0, 0.72, r) * 0.96;
          gl_FragColor = vec4(sand, alpha);
        }`,
    });
    const sand = new THREE.Mesh(new THREE.CircleGeometry(SAND_R, 72), sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = SAND_Y;
    sand.renderOrder = -9;
    scene.add(sand);

    /* ── God rays: soft translucent shafts swaying down from the surface. */
    const RAY_VERT = /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const RAY_FRAG = /* glsl */`
      varying vec2 vUv;
      uniform float uTime, uSeed;
      void main(){
        float x = vUv.x;
        float a = smoothstep(0.0, 0.42, x) * smoothstep(1.0, 0.58, x);
        a *= 0.10 + 0.90 * pow(vUv.y, 1.7);                        // bright at the surface
        a *= 0.72 + 0.28 * sin(uTime * 0.45 + uSeed * 11.0 + vUv.y * 4.0);
        gl_FragColor = vec4(vec3(0.75, 0.95, 0.92), a * 0.13);
      }`;
    const rayGeo = new THREE.PlaneGeometry(1, 150);
    const rays = [];
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSeed: { value: i * 0.173 + 0.05 } },
        vertexShader: RAY_VERT, fragmentShader: RAY_FRAG,
        transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(rayGeo, mat);
      const ang = i / 7 * Math.PI * 2 + 0.6;
      const rad = 18 + (i % 3) * 17;
      m.position.set(Math.cos(ang) * rad, 18, Math.sin(ang) * rad);
      m.scale.x = 9 + (i % 4) * 4.5;
      m.rotation.y = -ang + Math.PI / 2 + (i % 2 ? 0.5 : -0.35);
      m.userData.tilt = (i % 2 ? -1 : 1) * (0.10 + (i % 3) * 0.04);
      m.userData.seed = i * 1.37;
      m.renderOrder = -8;
      rays.push(m); scene.add(m);
    }

    /* ── Bubbles: a Points layer rising through the water column.
          Positions are computed in the vertex shader from a seed, so the
          CPU never touches them after upload. */
    const NB = 140;
    const bseed = new Float32Array(NB);
    for (let i = 0; i < NB; i++) bseed[i] = (i + 0.5) / NB + (i % 7) * 0.31;
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
    bgeo.setAttribute('aSeed', new THREE.BufferAttribute(bseed, 1));
    const bubMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 300 } },
      transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uPx;
        varying float vAlpha;
        float h1(float s){ return fract(sin(s * 12.9898) * 43758.5453); }
        float h2(float s){ return fract(sin(s * 78.233) * 12543.123); }
        void main(){
          float r = 14.0 + h1(aSeed) * 68.0;
          float ang = h2(aSeed) * 6.2831;
          float speed = 2.6 + fract(aSeed * 7.7) * 4.2;
          float y = mod(fract(aSeed * 3.3) * 135.0 + uTime * speed, 135.0) - 52.0;
          float x = cos(ang) * r + sin(uTime * 0.5 + aSeed * 9.0) * 1.6;
          float z = sin(ang) * r + cos(uTime * 0.4 + aSeed * 7.0) * 1.6;
          vAlpha = 1.0 - smoothstep(28.0, 78.0, y);            // dissolve near the surface
          vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
          float size = 0.35 + fract(aSeed * 5.1) * 0.55;
          gl_PointSize = size * uPx / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        void main(){
          vec2 pc = gl_PointCoord - 0.5;
          float d = length(pc) * 2.0;
          if (d > 1.0) discard;
          float ring = smoothstep(1.0, 0.78, d) * smoothstep(0.42, 0.72, d);
          float body = smoothstep(1.0, 0.2, d) * 0.10;
          float hl = smoothstep(0.34, 0.0, length(gl_PointCoord - vec2(0.36, 0.34)));
          gl_FragColor = vec4(vec3(0.75, 0.95, 0.95), (ring * 0.40 + body + hl * 0.35) * vAlpha);
        }`,
    });
    const bubbles = new THREE.Points(bgeo, bubMat);
    bubbles.frustumCulled = false;
    scene.add(bubbles);

    /* ── Nodes: self-luminous glowing orbs, ADDITIVE blending (LOCKED
          dark underwater look, REQUIREMENTS §2.4). Two layers share one
          geometry: a wide faint halo (atmosphere) and a small bright core. */
    const N = nodes.length;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const siz = new Float32Array(N), alp = new Float32Array(N), scl = new Float32Array(N);
    nodes.forEach((n, i) => {
      const c = hex(n.cluster.color);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      // Diameter in world units; the shader converts to pixels with real
      // perspective, so size relations stay true while zooming.
      siz[i] = n.size = 0.95 + n.w * 0.40;
      alp[i] = 1; scl[i] = 1;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));

    const NODE_VERT = /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aScale;
      varying vec3 vColor; varying float vAlpha;
      uniform float uPx, uMul;
      void main(){
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * aScale * uMul * uPx / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`;

    // uPx = h / (2·tan(fov/2)) — pixels per world unit at unit distance.
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 300 }, uMul: { value: 2.7 } },
      vertexShader: NODE_VERT,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // The halo stains the dark water around the orb (additive).
          float halo = pow(1.0 - d, 2.4);
          gl_FragColor = vec4(vColor * halo * 0.55, halo * vAlpha);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 300 }, uMul: { value: 1.0 } },
      vertexShader: NODE_VERT,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // Glowing core: hottest at the center, cooling toward the rim —
          // additive blending can only add light, never take it away.
          float disc = smoothstep(1.0, 0.86, d);
          float edge = smoothstep(0.30, 1.0, d);
          vec3 c = vColor * (1.15 - edge * 0.55);
          // Specular glint up-left, as if lit from the surface.
          vec2 sp = gl_PointCoord - vec2(0.36, 0.34);
          float spec = exp(-dot(sp, sp) * 22.0);
          c += spec * 0.75;
          gl_FragColor = vec4(c, disc * vAlpha);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    glowPts = new THREE.Points(geo, glowMat);
    corePts = new THREE.Points(geo, coreMat);
    glowPts.frustumCulled = false; corePts.frustumCulled = false;
    scene.add(glowPts, corePts);

    /* ── Edges: cluster hues with a glinting pulse traveling source→target
          (signal-flow, ADDITIVE light trails on the dark water).
          Direction needs no arrowheads — in 3D they always end up facing
          away from the camera; a moving glint never does. */
    const E = edges.length;
    const epos = new Float32Array(E * 6), ecol = new Float32Array(E * 6);
    const et = new Float32Array(E * 2), eseed = new Float32Array(E * 2);
    const ealp = new Float32Array(E * 2), edir = new Float32Array(E * 2);
    edges.forEach((e, i) => {
      const a = hex(e.s.cluster.color), b = hex(e.t.cluster.color);
      ecol.set(a, i * 6); ecol.set(b, i * 6 + 3);
      et[i * 2] = 0; et[i * 2 + 1] = 1;
      const sd = (i * 0.6180339887) % 1;
      eseed[i * 2] = sd; eseed[i * 2 + 1] = sd;
      ealp[i * 2] = ealp[i * 2 + 1] = 1;
      edir[i * 2] = edir[i * 2 + 1] = e.kind === 'pre' ? 1 : 0;
    });
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    egeo.setAttribute('aColor', new THREE.BufferAttribute(ecol, 3));
    egeo.setAttribute('aT', new THREE.BufferAttribute(et, 1));
    egeo.setAttribute('aSeed', new THREE.BufferAttribute(eseed, 1));
    egeo.setAttribute('aAlpha', new THREE.BufferAttribute(ealp, 1));
    egeo.setAttribute('aDir', new THREE.BufferAttribute(edir, 1));

    const lineMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFlow: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aT, aSeed, aAlpha, aDir;
        varying vec3 vColor; varying float vT, vSeed, vAlpha, vDir;
        void main(){
          vColor = aColor; vT = aT; vSeed = aSeed; vAlpha = aAlpha; vDir = aDir;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision mediump float;
        varying vec3 vColor; varying float vT, vSeed, vAlpha, vDir;
        uniform float uTime, uFlow;
        void main(){
          // The glint position loops 0..1; brightness uses the shortest
          // distance on the ring, otherwise it flickers at the wrap seam.
          float head = fract(vSeed + uTime * 0.16);
          float d = abs(vT - head);
          d = min(d, 1.0 - d);
          float pulse = exp(-pow(d * 7.0, 2.0)) * vDir * uFlow;
          vec3 base = vColor * 0.30;
          vec3 glint = mix(vColor, vec3(1.0), 0.60);   // the pulse flashes toward white
          gl_FragColor = vec4(mix(base, glint, pulse), vAlpha * (0.42 + 0.58 * pulse));
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    lineSeg = new THREE.LineSegments(egeo, lineMat);
    lineSeg.frustumCulled = false;
    scene.add(lineSeg);

    /* ── Camera control: hand-written, damped.
          Damping is the only thing that turns the feel from "toy" into
          "instrument", so it is not optional. */
    const D0 = fitDist();
    const cam = {
      theta: 0.7, phi: 1.32, dist: D0,
      tTheta: 0.7, tPhi: 1.32, tDist: D0,
      tx: 0, ty: 0, tz: 0, cx: 0, cy: 0, cz: 0,
    };
    let dragging = false, lastX = 0, lastY = 0, moved = 0;
    const el = renderer.domElement;

    bind(el, 'pointerdown', e => {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    bind(el, 'pointerup', e => { dragging = false; el.releasePointerCapture(e.pointerId) });
    bind(el, 'pointermove', e => {
      const r = el.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.live = true;
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
      cam.tTheta -= dx * 0.0052;
      cam.tPhi = Math.max(0.12, Math.min(Math.PI - 0.12, cam.tPhi - dy * 0.0052));
      spin = false; syncTools();
    });
    bind(el, 'pointerleave', () => { mouse.live = false });
    // Zooming in means a smaller distance, so "＋" maps to dolly(1/1.18).
    const zlvl = els.zlvl;
    const syncZoom = () => { zlvl.textContent = Math.round(D0 / cam.tDist * 100) + '%' };
    const dolly = f => {
      cam.tDist = Math.max(D0 * 0.22, Math.min(D0 * 2.6, cam.tDist * f));
      syncZoom();
    };
    bind(el, 'wheel', e => {
      e.preventDefault();
      dolly(1 + Math.sign(e.deltaY) * 0.11);
    }, { passive: false });
    const zoomReset = () => { cam.tDist = D0; syncZoom() };
    syncZoom();

    /* ── Picking: no Raycaster. Every frame already projects all nodes to
          screen coordinates for the labels; nearest-neighbor lookup on
          those coordinates is far more reliable than tuning a raycaster
          threshold for variably sized Points. */
    const mouse = { x: -1, y: -1, live: false };
    let hover = null, selected = null, pathSet = null;
    // Drift on open: a static 3D graph doesn't read as 3D at first glance.
    let spin = true, showLabels = true, flow = true;
    const off = new Set();
    const DIM = 0.12;

    const v3 = new THREE.Vector3();
    function project(w, h) {
      const px = coreMat.uniforms.uPx.value;
      for (const n of nodes) {
        v3.set(n.x, n.y, n.z);
        const dist = camera.position.distanceTo(v3);
        v3.project(camera);
        n.sx = (v3.x * 0.5 + 0.5) * w;
        n.sy = (-v3.y * 0.5 + 0.5) * h;
        n.sz = v3.z;
        // Picking radius derives from the rendered size — a guessed constant
        // always disagrees with the eye after some resize.
        n.sr = n.size * n.scale * px / Math.max(dist, 1) * 0.5;
      }
    }

    bind(el, 'click', e => {
      if (moved > 5) return;               // the end of a drag must not count as a click
      if (!hover) { if (!e.shiftKey) clearSel(); return }
      if (e.shiftKey && selected && hover !== selected) { makePath(selected, hover); return }
      select(hover);
    });

    /* ── State: selection / neighborhood / path decide the target alpha of
          every node and edge. Real animation is per-frame exponential
          approach, so state changes always fade. */
    const nT = new Float32Array(nodes.length), sT = new Float32Array(nodes.length), eT = new Float32Array(edges.length);
    let query = '';
    function targets() {
      nT.fill(1); sT.fill(1); eT.fill(1);
      const q = query;
      const hit = n => !q || n.name.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q);

      for (const n of nodes) {
        n.vis = !off.has(n.cid) && hit(n);
        if (!n.vis) { nT[n.i] = 0; sT[n.i] = 0.6 }
      }
      for (const e of edges) if (!e.s.vis || !e.t.vis) eT[e.i] = 0;

      if (pathSet) {
        for (const n of nodes) if (n.vis) { nT[n.i] = pathSet.has(n.i) ? 1 : DIM; sT[n.i] = pathSet.has(n.i) ? 1.25 : 0.8 }
        for (const e of edges) if (eT[e.i]) eT[e.i] = (pathSet.has(e.s.i) && pathSet.has(e.t.i)) ? 1.35 : DIM * 0.5;
      } else if (selected) {
        const near = new Set([selected.i, ...adj[selected.i]]);
        for (const n of nodes) if (n.vis) { nT[n.i] = near.has(n.i) ? 1 : DIM; sT[n.i] = n === selected ? 1.75 : near.has(n.i) ? 1.15 : 0.75 }
        for (const e of edges) if (eT[e.i]) eT[e.i] = (e.s === selected || e.t === selected) ? 1.4 : DIM * 0.45;
      }
      if (hover && hover.vis) { nT[hover.i] = 1; sT[hover.i] = Math.max(sT[hover.i], 1.6) }
      return { nT, sT, eT };
    }

    function select(n) {
      selected = n; pathSet = null;
      els.pathbar.classList.remove('on');
      // Bring the target into the camera's center without changing distance.
      cam.tx = n.x; cam.ty = n.y; cam.tz = n.z;
      cam.tDist = Math.min(cam.tDist, D0 * 0.72);
      drawDrawer(n); drawList(); syncHud();
    }
    function clearSel() {
      selected = null; pathSet = null;
      cam.tx = cam.ty = cam.tz = 0;
      els.pathbar.classList.remove('on');
      drawDrawer(null); drawList(); syncHud();
    }

    function makePath(a, b) {
      // BFS: every edge has weight 1, so Dijkstra would only make this longer.
      const prev = new Array(nodes.length).fill(-1), seen = new Set([a.i]);
      const q = [a.i];
      while (q.length) {
        const cur = q.shift();
        if (cur === b.i) break;
        for (const nx of adj[cur]) if (!seen.has(nx) && nodes[nx].vis) { seen.add(nx); prev[nx] = cur; q.push(nx) }
      }
      if (!seen.has(b.i)) { els.chain.textContent = 'No current connects these two'; els.pathbar.classList.add('on'); return }
      const chain = []; let cur = b.i;
      while (cur !== -1) { chain.unshift(cur); if (cur === a.i) break; cur = prev[cur] }
      pathSet = new Set(chain);
      els.chain.innerHTML = chain.map(i => nodes[i].name).join('<em>→</em>');
      els.pathbar.classList.add('on');
      syncHud();
    }
    function clearPath() { pathSet = null; els.pathbar.classList.remove('on'); syncHud() }

    /* ── Label pool: a fixed number of divs, reused. Allocating DOM per
          frame would make the GC hiccup within a minute. */
    const labelHost = els.labels;
    const LABEL_BUDGET = 14;
    const pool = Array.from({ length: 44 }, () => {
      const d = document.createElement('div');
      d.className = 'lab'; d.style.opacity = 0;
      labelHost.appendChild(d); return d;
    });
    const topDeg = [...nodes].sort((a, b) => deg(b) - deg(a)).slice(0, LABEL_BUDGET).map(n => n.i);

    function drawLabels(w, h) {
      let k = 0;
      const want = new Set();
      if (showLabels) topDeg.forEach(i => want.add(i));
      if (selected) { want.add(selected.i); adj[selected.i].forEach(i => want.add(i)) }
      if (pathSet) pathSet.forEach(i => want.add(i));
      if (hover) want.add(hover.i);

      const list = [...want].map(i => nodes[i])
        .filter(n => n.vis && n.sz < 1 && n.sx > -60 && n.sx < w + 60 && n.sy > -20 && n.sy < h + 20)
        .sort((a, b) => a.sz - b.sz);

      const taken = [];
      for (const n of list) {
        if (k >= pool.length) break;
        // Crude but sufficient avoidance: skip overlapping bounding boxes.
        const wpx = n.name.length * 11.5 + 8;
        const box = [n.sx - wpx / 2, n.sy - 18, wpx, 16];
        if (taken.some(t => box[0] < t[0] + t[2] && box[0] + box[2] > t[0] && box[1] < t[1] + t[3] && box[1] + box[3] > t[1])) continue;
        taken.push(box);
        const d = pool[k++];
        d.textContent = n.name;
        d.className = 'lab' + (n === hover || n === selected ? '' : ' sm');
        d.style.transform = `translate(-50%,-50%) translate(${n.sx.toFixed(1)}px,${(n.sy - 17).toFixed(1)}px)`;
        d.style.opacity = Math.min(1, n.alpha * 1.3);
        d.style.color = (n === hover || n === selected) ? n.cluster.color : '';
      }
      for (; k < pool.length; k++) pool[k].style.opacity = 0;
    }

    /* ── Main loop ─────────────────────────────────────────────────── */
    let last = performance.now(), fpsAcc = 0, fpsN = 0;
    const posAttr = geo.getAttribute('position'), alpAttr = geo.getAttribute('aAlpha'), sclAttr = geo.getAttribute('aScale');
    const eposAttr = egeo.getAttribute('position'), ealpAttr = egeo.getAttribute('aAlpha');

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        glowMat.uniforms.uPx.value = coreMat.uniforms.uPx.value = bubMat.uniforms.uPx.value =
          h / (2 * Math.tan(camera.fov * Math.PI / 360));
      }

      layout();

      if (spin) cam.tTheta += dt * 0.09;
      const k = 1 - Math.pow(0.0016, dt);      // frame-rate independent exponential approach
      cam.theta += (cam.tTheta - cam.theta) * k;
      cam.phi += (cam.tPhi - cam.phi) * k;
      cam.dist += (cam.tDist - cam.dist) * k;
      cam.cx += (cam.tx - cam.cx) * k; cam.cy += (cam.ty - cam.cy) * k; cam.cz += (cam.tz - cam.cz) * k;
      camera.position.set(
        cam.cx + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta),
        cam.cy + cam.dist * Math.cos(cam.phi),
        cam.cz + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta),
      );
      camera.lookAt(cam.cx, cam.cy, cam.cz);

      // Water life: dome shimmer, sand caustics, swaying rays, rising bubbles.
      const t = now / 1000;
      domeMat.uniforms.uTime.value = t;
      sandMat.uniforms.uTime.value = t;
      bubMat.uniforms.uTime.value = t;
      for (const m of rays) {
        m.material.uniforms.uTime.value = t;
        m.rotation.z = m.userData.tilt + Math.sin(t * 0.22 + m.userData.seed) * 0.055;
      }

      project(w, h);

      // Picking: nearest on screen within a threshold; depth breaks ties
      // in favor of the node closer to the camera.
      if (mouse.live && !dragging) {
        let best = null;
        for (const n of nodes) {
          if (!n.vis || n.sz > 1) continue;
          const dx = n.sx - mouse.x, dy = n.sy - mouse.y;
          const r = n.sr + 7;              // +7px: small beads are nearly unclickable otherwise
          if (dx * dx + dy * dy > r * r) continue;
          if (!best || n.sz < best.sz) best = n;
        }
        if (best !== hover) { hover = best; el.style.cursor = best ? 'pointer' : 'grab'; syncHud() }
      }

      const { nT, sT, eT } = targets();
      const ka = 1 - Math.pow(0.002, dt);
      for (const n of nodes) {
        n.alpha += (nT[n.i] - n.alpha) * ka;
        n.scale += (sT[n.i] - n.scale) * ka;
        posAttr.array[n.i * 3] = n.x; posAttr.array[n.i * 3 + 1] = n.y; posAttr.array[n.i * 3 + 2] = n.z;
        alpAttr.array[n.i] = n.alpha; sclAttr.array[n.i] = n.scale;
      }
      posAttr.needsUpdate = alpAttr.needsUpdate = sclAttr.needsUpdate = true;

      for (const e of edges) {
        e.alpha += (eT[e.i] - e.alpha) * ka;
        const o = e.i * 6;
        eposAttr.array[o] = e.s.x; eposAttr.array[o + 1] = e.s.y; eposAttr.array[o + 2] = e.s.z;
        eposAttr.array[o + 3] = e.t.x; eposAttr.array[o + 4] = e.t.y; eposAttr.array[o + 5] = e.t.z;
        ealpAttr.array[e.i * 2] = ealpAttr.array[e.i * 2 + 1] = e.alpha;
      }
      eposAttr.needsUpdate = ealpAttr.needsUpdate = true;

      lineMat.uniforms.uTime.value = t;
      lineMat.uniforms.uFlow.value += ((flow ? 1 : 0) - lineMat.uniforms.uFlow.value) * ka;

      drawLabels(w, h);
      renderer.render(scene, camera);

      fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++;
      if (fpsN >= 30) { els.sFps.textContent = Math.round(fpsAcc / fpsN); fpsAcc = fpsN = 0 }
    }
    raf = requestAnimationFrame(frame);

    /* ── Controls ──────────────────────────────────────────────────── */
    function reheat(t = 0.55) { alpha = Math.max(alpha, t) }

    function setView(v) {
      view = v;
      els.hudMode.textContent = VIEW_NAMES[view];
      reheat(1);
    }
    const toggleFlow = () => { flow = !flow; syncTools() };
    const toggleLabel = () => { showLabels = !showLabels; syncTools() };
    const toggleSpin = () => { spin = !spin; syncTools() };
    function reset() {
      cam.tTheta = 0.7; cam.tPhi = 1.32; cam.tDist = fitDist(); clearSel(); reheat(0.8); syncZoom();
    }
    function syncTools() { emit.tools({ flow, label: showLabels, spin }) }

    bind(window, 'keydown', e => {
      if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return }
      if (e.key === 'Escape') clearSel();
      else if (e.key === 'l' || e.key === 'L') { showLabels = !showLabels; syncTools() }
      else if (e.key === 'r' || e.key === 'R') reset();
      else if (e.key === ' ') { e.preventDefault(); spin = !spin; syncTools() }
      else if (e.key === '/' ) { e.preventDefault(); els.q.focus() }
      else if (e.key === '=' || e.key === '+') dolly(1 / 1.18);
      else if (e.key === '-' || e.key === '_') dolly(1.18);
    });

    function syncHud() {
      els.hudSel.textContent =
        pathSet ? `Path · ${pathSet.size} hops` : selected ? selected.name : hover ? hover.name : 'Nothing selected';
    }

    /* ── Sidebar and drawer ────────────────────────────────────────── */
    function toggleCluster(id) {
      if (off.has(id)) { off.delete(id) } else { off.add(id) }
      drawList(); reheat(0.4);
    }

    function drawList() {
      const q = els.q.value.trim().toLowerCase();
      const rows = nodes
        .filter(n => !off.has(n.cid) && (!q || n.name.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)))
        .sort((a, b) => deg(b) - deg(a));
      emit.list({
        q,
        rows: rows.map(n => ({ i: n.i, name: n.name, color: n.cluster.color, deg: deg(n), on: n === selected })),
      });
      els.sNode.textContent = rows.length;
      const ec = edges.filter(e => rows.includes(e.s) && rows.includes(e.t)).length;
      els.sEdge.textContent = ec;
      els.sDeg.textContent = rows.length ? (ec * 2 / rows.length).toFixed(1) : '0';
    }
    const selectAt = i => select(nodes[i]);
    const hoverAt = i => { hover = i === null ? null : nodes[i] };

    function setQuery(v) {
      query = v.trim().toLowerCase();
      drawList(); reheat(0.25);
    }

    /* FR-3.5: the detail drawer carries the node's gloss plus its linked
       deck/task ids ("connecting the dots") — injected by atlasAdapter. */
    function drawDrawer(n) {
      emit.drawer(n && {
        i: n.i, name: n.name, desc: n.desc, cname: n.cluster.name, color: n.cluster.color,
        deg: deg(n), depth: depth[n.i],
        deckIds: n.deckIds, taskIds: n.taskIds,
        card: cardForNode(n),
        groups: [['Prerequisites', n.in, 'PRE'], ['Enables', n.out, 'NEXT'], ['Related concepts', n.rel, 'REL']]
          .filter(([, arr]) => arr.length)
          .map(([title, arr, tag]) => ({
            title, tag, items: arr.map(m => ({ i: m.i, name: m.name, color: m.cluster.color })),
          })),
      });
    }
    /* "Center here": move this node's anchor to the origin and let
       everything else re-converge around it. */
    function centerOn(i) {
      const n = nodes[i], a = anchors[view], base = a[n.i].slice();
      for (let k = 0; k < a.length; k++) { a[k][0] -= base[0]; a[k][1] -= base[1]; a[k][2] -= base[2] }
      cam.tx = cam.ty = cam.tz = 0; reheat(1);
    }
    function startPath(i) {
      const n = nodes[i];
      els.chain.innerHTML = `Start at <b style="color:${n.cluster.color}">${n.name}</b> — hold Shift and click another node`;
      els.pathbar.classList.add('on');
    }

    els.hudMode.textContent = VIEW_NAMES[view];
    emit.clusters(clusters.map(c => ({
      id: c.id, name: c.name, color: c.color,
      count: nodes.filter(n => n.cid === c.id).length,
    })));
    drawList(); drawDrawer(null); syncTools(); syncHud();

    return {
      setView, toggleFlow, toggleLabel, toggleSpin, reset,
      dolly, zoomReset, toggleCluster, selectAt, hoverAt, setQuery,
      clearPath, centerOn, startPath,
      dispose() {
        ac.abort(); cancelAnimationFrame(raf);
        renderer.dispose(); el.remove();
        labelHost.innerHTML = '';         // pooled label divs belong to this atlas
      },
    };
  }
}
