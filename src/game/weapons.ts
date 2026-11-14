// @ts-nocheck -- three.js geometry hot paths
// The user's 4 weapon models (STL), one per gun kind, normalised once: muzzle along +z, up +y, pistol grip at the origin,
// real-ish lengths in metres. Used in hands (CharacterModel) and as floor loot (Scene).
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";
import m4 from "@/assets/models/weapons/m4.stl.asset.json";
import revolver from "@/assets/models/weapons/revolver.stl.asset.json";
import shotgun from "@/assets/models/weapons/tactical_shotgun.stl.asset.json";
import smg from "@/assets/models/weapons/tactical_smg.stl.asset.json";
import { GUN_KINDS, type GunKind } from "./sim";

/** len = metres muzzle-to-stock; gf = grip position from the back (0..1); gy = grip height from the bottom (0..1) */
const SPEC: Record<GunKind, { url: string; len: number; gf: number; gy: number }> = {
  ar: { url: m4.url, len: 0.95, gf: 0.3, gy: 0.55 },
  shotgun: { url: shotgun.url, len: 0.92, gf: 0.28, gy: 0.5 },
  smg: { url: smg.url, len: 0.62, gf: 0.17, gy: 0.68 },
  pistol: { url: revolver.url, len: 0.42, gf: 0.14, gy: 0.62 },
};
/** Muzzle position in the normalised gun's local space (metres from the grip). */
export const MUZZLE: Record<GunKind, [number, number, number]> = Object.fromEntries(
  Object.entries(SPEC).map(([k, v]) => [k, [0, 0.05, v.len * (1 - v.gf)]]),
) as Record<GunKind, [number, number, number]>;
export const WEAPON_URLS = [m4.url, shotgun.url, smg.url, revolver.url];

const cache = new Map<GunKind, THREE.BufferGeometry>();
let all: Record<GunKind, THREE.BufferGeometry> | null = null;
function normalise(src: THREE.BufferGeometry, k: GunKind) {
  const g = src.clone();
  // STL axes: muzzle +y, up +z -> game axes: muzzle +z, up +y (proper rotation, det +1)
  g.applyMatrix4(new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.computeBoundingBox();
  const b = g.boundingBox!, s = SPEC[k].len / (b.max.z - b.min.z);
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + (b.max.y - b.min.y) * SPEC[k].gy), -(b.min.z + (b.max.z - b.min.z) * SPEC[k].gf));
  g.scale(s, s, s);
  g.computeBoundingSphere();
  return g;
}

/** Suspends until all 4 models are loaded. */
export function useWeaponGeos(): Record<GunKind, THREE.BufferGeometry> {
  const geos = useLoader(STLLoader, WEAPON_URLS) as THREE.BufferGeometry[];
  if (all) return all;
  const byUrl = new Map(WEAPON_URLS.map((u, i) => [u, geos[i]]));
  const out = {} as Record<GunKind, THREE.BufferGeometry>;
  for (const k of GUN_KINDS) {
    if (!cache.has(k)) cache.set(k, normalise(byUrl.get(SPEC[k].url)!, k));
    out[k] = cache.get(k)!;
  }
  all = out;
  return out;
}

const GUNMETAL = new THREE.Color("#3b3f46");
/** Season-1 style rarity tint over gunmetal. */
export function tintFor(rarityColor: string, out = new THREE.Color()) {
  return out.copy(GUNMETAL).lerp(new THREE.Color(rarityColor), 0.55);
}
