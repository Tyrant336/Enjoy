/**
 * modelUtils.ts — GLB preparation helpers implementing the locked look
 * (local visual spec: outlines, cel shading, planar-mirror water):
 *
 *  - toToon:      MeshStandardMaterial → MeshToonMaterial (4-step banded fill)
 *  - addOutlines: inverted-hull outline shell, flat navy `ink`, per mesh
 *  - fitToWater:  normalize a model to a world length + waterline draft
 *
 * Reflections are NOT made here: the ocean is a true planar mirror
 * (Ocean.tsx) — mirrored-geometry clones were removed (they rendered as
 * white blobs, never as tinted mirror images).
 *
 * All helpers mutate/clone THREE objects explicitly and fail loudly on misuse.
 */

import * as THREE from "three";
import { PALETTE } from "@/lib/theme";

let gradientMap: THREE.DataTexture | null = null;

/** Shared 4-step toon gradient — the few-band cel ramp of the bright-day grade. */
function getGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 150, 210, 255]); // 4 tones
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

/**
 * Normalize a loaded model to its world footprint: uniform scale so the
 * longest horizontal dimension is `length`, horizontally centered on the
 * origin, hull riding at `draft` below y=0 (the waterline — the hull visibly
 * floats). Returns the applied scale so callers can convert world-unit
 * widths (e.g. outline thickness) into geometry-local units.
 */
export function fitToWater(obj: THREE.Object3D, length: number, draft: number): number {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = length / Math.max(size.x, size.z, 0.001);
  obj.scale.setScalar(s);
  box.setFromObject(obj);
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  box.setFromObject(obj);
  obj.position.y -= box.min.y + draft;
  return s;
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
