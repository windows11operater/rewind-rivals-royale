// @ts-nocheck -- strict index checks relaxed for game hot paths
import { useGLTF } from "@react-three/drei";
import { Suspense, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { getRig, instantiate } from "./autoRig";
import type { Skin } from "./data";
import type { GunKind } from "./sim";
import { useWeaponGeos } from "./weapons";

/**
 * One of the user's outfit models, auto-rigged (autoRig.ts) with its own bones.
 * Bone refs keep the old rig names: hips (lLeg/rLeg) -> knees (lKnee/rKnee); shoulders (lArm/rArm) ->
 * elbows (lFore/rFore); pelvis -> spine -> chest -> head. "l" is the model's +x side, "r" its -x side
 * (the model faces +z), and the weapon / pickaxe sit in the right hand.
 */
export interface CharRefs {
  root: THREE.Group | null;
  pelvis: THREE.Bone | null;
  lLeg: THREE.Bone | null;
  rLeg: THREE.Bone | null;
  lArm: THREE.Bone | null;
  rArm: THREE.Bone | null;
  spine: THREE.Bone | null;
  chest: THREE.Bone | null;
  head: THREE.Bone | null;
  lFore: THREE.Bone | null;
  rFore: THREE.Bone | null;
  lKnee: THREE.Bone | null;
  rKnee: THREE.Bone | null;
  /** held weapon: one mesh per kind, toggle with setGun */
  gun: THREE.Group | null;
  guns: Partial<Record<GunKind, THREE.Mesh>>;
  gunMat: THREE.MeshStandardMaterial | null;
  gunKind: GunKind | null;
  pick: THREE.Group | null;
  glider: THREE.Group | null;
  /** rest height of the pelvis bone */
  pelvisY: number;
}

const shared = {
  handle: new THREE.MeshStandardMaterial({ color: "#5a3a1e", roughness: 0.8 }),
  grip: new THREE.MeshStandardMaterial({ color: "#222" }),
  head: new THREE.MeshStandardMaterial({ color: "#a9bccf", metalness: 0.75, roughness: 0.28 }),
  bar: new THREE.MeshStandardMaterial({ color: "#333" }),
};

function pickaxe() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.95, 8), shared.handle); a.position.y = 0.4;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), shared.grip); b.position.y = 0.03;
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.62, 4), shared.head); c.position.y = 0.86; c.rotation.z = Math.PI / 2;
  g.add(a, b, c);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

function glider(color: string) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 3), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  canopy.rotation.x = -Math.PI / 2;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4), shared.bar); bar.position.y = -0.5;
  g.add(canopy, bar);
  g.position.y = 2.7;
  g.visible = false;
  return g;
}

export function setGun(r: CharRefs, kind: GunKind | null, tint?: THREE.Color) {
  if (!r.gun) return;
  r.gun.visible = !!kind;
  if (kind !== r.gunKind || (kind && r.guns[kind] && !r.guns[kind]!.visible)) {
    for (const k in r.guns) r.guns[k as GunKind]!.visible = k === kind;
    r.gunKind = kind;
  }
  if (tint && r.gunMat) r.gunMat.color.copy(tint);
}

export const CharacterModel = forwardRef<CharRefs, { skin: Skin; detail?: "high" | "low"; armed?: boolean }>(function CharacterModel({ skin, detail = "low", armed = true }, ref) {
  const url = detail === "high" ? skin.model : skin.lo;
  const { scene } = useGLTF(url);
  const built = useMemo(() => {
    const rig = getRig(url, scene);
    const { mesh, bones } = instantiate(rig);
    const root = new THREE.Group();
    root.add(mesh);
    // right hand: weapon + pickaxe, a little past the wrist along the forearm
    const el = rig.joints.rFore, wr = rig.wrist.r;
    const hand = wr.clone().sub(el);
    hand.add(hand.clone().normalize().multiplyScalar(0.06));
    const gun = new THREE.Group();
    gun.position.copy(hand); gun.rotation.x = Math.PI / 2;
    const gunMat = new THREE.MeshStandardMaterial({ color: "#5a5f66", metalness: 0.55, roughness: 0.42 });
    gun.visible = false;
    const pick = pickaxe();
    pick.position.copy(hand).add(new THREE.Vector3(0, 0, 0.04));
    pick.rotation.x = Math.PI / 2.4;
    pick.visible = false;
    bones.rFore.add(gun, pick);
    const gl = glider(skin.accent);
    root.add(gl);
    const refs: CharRefs = {
      root, pelvis: bones.pelvis, lLeg: bones.lLeg, rLeg: bones.rLeg, lArm: bones.lArm, rArm: bones.rArm, spine: bones.spine, chest: bones.chest, head: bones.head,
      lFore: bones.lFore, rFore: bones.rFore, lKnee: bones.lKnee, rKnee: bones.rKnee,
      gun, guns: {}, gunMat, gunKind: null, pick, glider: gl, pelvisY: bones.pelvis.position.y,
    };
    return refs;
  }, [url, scene, skin.accent]);
  useImperativeHandle(ref, () => built, [built]);
  return (
    <>
      <primitive object={built.root} />
      {armed && <Suspense fallback={null}><HandGuns refs={built} /></Suspense>}
    </>
  );
});

/** Adds the four weapon meshes to the hand once the weapon models have loaded (never blocks the outfit). */
function HandGuns({ refs }: { refs: CharRefs }) {
  const weapons = useWeaponGeos();
  useLayoutEffect(() => {
    const made: THREE.Mesh[] = [];
    for (const k of Object.keys(weapons) as GunKind[]) {
      if (refs.guns[k]) continue;
      const m = new THREE.Mesh(weapons[k], refs.gunMat!);
      m.visible = refs.gunKind === k; m.castShadow = true;
      refs.guns[k] = m; refs.gun!.add(m); made.push(m);
    }
    return () => { for (const m of made) { refs.gun!.remove(m); for (const k in refs.guns) if (refs.guns[k as GunKind] === m) delete refs.guns[k as GunKind]; } };
  }, [weapons, refs]);
  return null;
}

/** Start fetching outfit models early (lobby + matches). */
export function preloadSkins(skins: Skin[], detail: "high" | "low" | "both" = "both") {
  for (const s of skins) {
    if (detail !== "low") useGLTF.preload(s.model);
    if (detail !== "high") useGLTF.preload(s.lo);
  }
}

/**
 * Warms outfits in the background: loads each model and builds its rig one at a time, so opening the
 * Locker / Item Shop or switching outfits shows the character immediately. Render inside a Canvas.
 */
export function RigWarmer({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  if (i >= urls.length) return null;
  return <Suspense fallback={null}><WarmOne key={urls[i]} url={urls[i]} onDone={() => setTimeout(() => setI((v) => v + 1), 120)} /></Suspense>;
}
function WarmOne({ url, onDone }: { url: string; onDone: () => void }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    const run = () => { getRig(url, scene); onDone(); };
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(run, { timeout: 1500 }); else setTimeout(run, 60);
  }, [url, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
