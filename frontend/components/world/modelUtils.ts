/**
 * modelUtils.ts — GLB preparation helpers implementing the locked look
 * (local visual spec: outlines, reflections, cel shading):
 *
 *  - toToon:        MeshStandardMaterial → MeshToonMaterial (3-step banded fill)
 *  - addOutlines:   inverted-hull outline shell, flat navy `ink`, per mesh
 *  - makeReflection: mirrored clone (scale.y = -1), teal-tinted, translucent
 *
 * All helpers mutate/clone THREE objects explicitly and fail loudly on misuse.
 */

import * as THREE from "three";
import { PALETTE } from "@/lib/theme";

let gradientMap: THREE.DataTexture | null = null;

/** Shared 3-step toon gradient (flat fills, 2 tones max per object — the locked local visual spec). */
function getGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([120, 190, 255, 255]); // 3 tones + pad (RGBA min 4)
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

/** Replace PBR materials with banded toon fills, preserving color/texture. */
export function toToon(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const convert = (mat: THREE.Material): THREE.Material => {
      if (mat instanceof THREE.MeshToonMaterial) return mat;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
      const toon = new THREE.MeshToonMaterial({
        color: mat.color.clone(),
        map: mat.map ?? null,
        gradientMap: getGradientMap(),
        transparent: mat.transparent,
        opacity: mat.opacity,
      });
      toon.name = mat.name;
      // Keep authored emissive (the lamp's LanternGlow) on the toon material.
      toon.emissive = mat.emissive.clone();
      toon.emissiveIntensity = mat.emissiveIntensity;
      return toon;
    };
    obj.material = Array.isArray(obj.material)
      ? obj.material.map(convert)
      : convert(obj.material);
  });
}

const OUTLINE_VERT = /* glsl */ `
  uniform float uThickness;
  void main() {
    vec3 p = position + normalize(normal) * uThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const OUTLINE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    gl_FragColor = vec4(uColor, uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Inverted-hull outline (locked visual spec): for every mesh under `root`,
 * add a child mesh sharing its geometry, drawn back-face-only, inflated along
 * normals, flat navy `ink`. Children inherit the mesh's transform, so outlines
 * track animation for free. Returns nothing; mutates `root`.
 */
export function addOutlines(root: THREE.Object3D, thickness: number): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.isOutline) meshes.push(obj);
  });
  for (const mesh of meshes) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uThickness: { value: thickness },
        uColor: { value: new THREE.Color(PALETTE.ink.hex) },
        uAlpha: { value: 1 },
      },
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
    });
    const shell = new THREE.Mesh(mesh.geometry, mat);
    shell.userData.isOutline = true;
    shell.raycast = () => null; // outlines are never click targets
    mesh.add(shell);
  }
}

const REFLECT_VERT = /* glsl */ `
  varying float vWorldY;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldY = world.y;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const REFLECT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uWater;
  uniform float uOpacity;
  uniform float uFadeDepth;
  varying float vWorldY;
  #include <fog_pars_fragment>
  void main() {
    // Strong at the waterline, dissolving within ~1 object-height below it;
    // color dragged toward the deep-water hue with depth (the locked local
    // visual spec: reflections are prominent, water-tinted, fading).
    float keep = smoothstep(-uFadeDepth, -0.15, vWorldY);
    vec3 col = mix(uWater, uColor, smoothstep(-uFadeDepth * 0.7, 0.0, vWorldY));
    gl_FragColor = vec4(col, uOpacity * keep);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Planar reflection, cheap variant (the locked local visual spec): a mirrored
 * clone hung upside-down under the waterline, slightly ELONGATED downward
 * (scale.y ≈ -1.22), rendered with a depth-fade shader (crisp at the
 * waterline, dissolves within ~1 object-height, colors dragged toward the
 * water hue; the lantern's warm glow reflects too). Place the returned object
 * as a sibling of the original inside the same animated group, with y=0 at
 * the waterline.
 */
export function makeReflection(
  source: THREE.Object3D,
  opacity = 0.5,
  fadeDepth = 5.5,
): THREE.Object3D {
  const clone = source.clone(true);
  const tint = new THREE.Color(PALETTE.reflectionTint.hex);
  const water = new THREE.Color(PALETTE.waterDeep.hex);
  clone.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.userData.isOutline = false;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const reflected = mats.map((m) => {
      const base =
        m instanceof THREE.MeshStandardMaterial ||
        m instanceof THREE.MeshToonMaterial
          ? m.color.clone()
          : new THREE.Color(0xffffff);
      // Reflection = object color dragged toward the water hue.
      const color = base.lerp(tint, 0.45);
      // The lantern's warm glow reflects too (the locked local visual spec).
      if (
        (m instanceof THREE.MeshStandardMaterial ||
          m instanceof THREE.MeshToonMaterial) &&
        (m.emissive.r + m.emissive.g + m.emissive.b) > 0.1
      ) {
        color.copy(m.emissive).lerp(tint, 0.25);
      }
      return new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uColor: { value: color },
            uWater: { value: water.clone() },
            uOpacity: { value: opacity },
            uFadeDepth: { value: fadeDepth },
          },
        ]),
        vertexShader: REFLECT_VERT,
        fragmentShader: REFLECT_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      });
    });
    obj.material = Array.isArray(obj.material) ? reflected : reflected[0];
    obj.raycast = () => null; // reflections are never click targets
  });
  clone.scale.y = -1.22; // slightly elongated, like the reference
  clone.renderOrder = 1;
  return clone;
}

/** Clone a loaded GLTF scene for one world instance (no skinning in our GLBs). */
export function cloneScene(scene: THREE.Object3D): THREE.Object3D {
  return scene.clone(true);
}

/**
 * Fade an entire prepared model group (toon fills + outline shells),
 * used by the reduced-motion variants (§7.4: sink/rise/dock become fades).
 * Materials become transparent while opacity < 1.
 */
export function setGroupOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m instanceof THREE.ShaderMaterial && m.uniforms.uAlpha) {
        m.uniforms.uAlpha.value = opacity;
        m.transparent = opacity < 1;
      } else if (m instanceof THREE.ShaderMaterial && m.uniforms.uOpacity) {
        // Reflection materials (uOpacity is the base opacity — scale it).
        if (m.userData.baseOpacity === undefined) {
          m.userData.baseOpacity = m.uniforms.uOpacity.value as number;
        }
        m.uniforms.uOpacity.value = (m.userData.baseOpacity as number) * opacity;
      } else if (
        m instanceof THREE.MeshToonMaterial ||
        m instanceof THREE.MeshStandardMaterial ||
        m instanceof THREE.MeshBasicMaterial
      ) {
        m.opacity = opacity;
        m.transparent = opacity < 1;
      }
    }
  });
}
