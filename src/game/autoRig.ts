// @ts-nocheck -- typed-array hot paths
// Auto-rig for the user's static (unrigged) outfit meshes. At load time each model is normalised
// (feet at y=0, centred, fixed height), its joints are found from the silhouette (arms hanging at the
// sides, legs below the crotch), and every vertex gets skin weights for a 12-bone skeleton whose bone
// names match CharRefs. Each character instance then gets its own bones over the shared geometry.
import * as THREE from "three";

export const BONES = ["pelvis", "spine", "chest", "head", "lArm", "lFore", "rArm", "rFore", "lLeg", "lKnee", "rLeg", "rKnee"] as const;
export type BoneName = (typeof BONES)[number];
const PARENT: Record<BoneName, BoneName | null> = {
  pelvis: null, spine: "pelvis", chest: "spine", head: "chest",
  lArm: "chest", lFore: "lArm", rArm: "chest", rFore: "rArm",
  lLeg: "pelvis", lKnee: "lLeg", rLeg: "pelvis", rKnee: "rLeg",
};
const BI = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

export interface Rig {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  joints: Record<BoneName, THREE.Vector3>;
  /** wrist positions (model space) */
  wrist: { l: THREE.Vector3; r: THREE.Vector3 };
  inverses: THREE.Matrix4[];
  height: number;
}

export const CHAR_HEIGHT = 1.95;
const rigs = new Map<string, Rig>();
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Rig for a loaded GLB scene, cached per key (model URL). Never mutates the cached scene. */
export function getRig(key: string, scene: THREE.Object3D, height = CHAR_HEIGHT): Rig {
  const hit = rigs.get(key);
  if (hit) return hit;
  let src: THREE.Mesh | null = null;
  scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
  if (!src) throw new Error("model has no mesh");
  scene.updateMatrixWorld(true);
  const g0 = src.geometry, P = g0.attributes.position, N = g0.attributes.normal, U = g0.attributes.uv;
  const n = P.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(src.matrixWorld);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(src.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
    if (U) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
  }
  // normalise: feet at 0, centred on x/z, fixed height
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const s = height / (y1 - y0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < n; i++) { pos[i * 3] = (pos[i * 3] - cx) * s; pos[i * 3 + 1] = (pos[i * 3 + 1] - y0) * s; pos[i * 3 + 2] = (pos[i * 3 + 2] - cz) * s; }
  const H = height;

  // ---- silhouette analysis: horizontal slices, clusters of x separated by gaps ----
  const NS = 100, gap = 0.012 * H;
  const bins: number[][] = Array.from({ length: NS }, () => []);
  for (let i = 0; i < n; i++) bins[Math.min(NS - 1, Math.floor((pos[i * 3 + 1] / H) * NS))].push(i);
  type Cl = { a: number; b: number; c: number; idx: number[] };
  const clusters: Cl[][] = bins.map((b) => {
    const sorted = b.slice().sort((p, q) => pos[p * 3] - pos[q * 3]);
    const out: Cl[] = [];
    let cur: number[] = [];
    for (let k = 0; k < sorted.length; k++) {
      if (cur.length && pos[sorted[k] * 3] - pos[cur[cur.length - 1] * 3] > gap) { out.push(mk(cur)); cur = []; }
      cur.push(sorted[k]);
    }
    if (cur.length) out.push(mk(cur));
    return out;
  });
  function mk(idx: number[]): Cl { let sx = 0; for (const i of idx) sx += pos[i * 3]; return { a: pos[idx[0] * 3], b: pos[idx[idx.length - 1] * 3], c: sx / idx.length, idx }; }
  const arm = new Int8Array(n); // 0 none, 1 left (+x), -1 right (-x)
  const binY = (b: number) => ((b + 0.5) / NS) * H;
  const armInfo = { l: { top: -1, bot: -1, cx: new Map<number, number>() }, r: { top: -1, bot: -1, cx: new Map<number, number>() } };
  for (const side of [1, -1] as const) {
    const info = side > 0 ? armInfo.l : armInfo.r;
    const cand = (b: number) => {
      const cl = clusters[b];
      if (cl.length < 2) return null;
      const c = side > 0 ? cl[cl.length - 1] : cl[0];
      const w = c.b - c.a;
      if (w > 0.11 * H || Math.abs(c.c) < 0.1 * H) return null;
      if (side > 0 ? c.a < 0.03 * H : c.b > -0.03 * H) return null;
      return c;
    };
    let start = -1;
    for (let b = Math.floor(0.8 * NS); b >= Math.floor(0.58 * NS); b--) if (cand(b)) { start = b; break; }
    if (start < 0) continue;
    let miss = 0, last = start;
    for (let b = start; b >= Math.floor(0.34 * NS); b--) {
      const c = cand(b);
      if (!c) { if (++miss > 2) break; continue; }
      // stay continuous with the arm above (no jumping onto a leg)
      const prev = info.cx.get(last);
      if (prev !== undefined && Math.abs(c.c - prev) > 0.06 * H) { if (++miss > 2) break; continue; }
      miss = 0; last = b;
      info.cx.set(b, c.c);
      for (const i of c.idx) arm[i] = side;
    }
    info.top = start; info.bot = last;
  }
  const lineX = (info: typeof armInfo.l, y: number, side: number) => {
    if (!info.cx.size) return 0.17 * H * side;
    let best = 0, bd = Infinity;
    for (const [b, x] of info.cx) { const d = Math.abs(binY(b) - y); if (d < bd) { bd = d; best = x; } }
    return best;
  };
  const sideJ = (side: 1 | -1) => {
    const info = side > 0 ? armInfo.l : armInfo.r;
    const top = info.top >= 0 ? binY(info.top) : 0.72 * H, bot = info.bot >= 0 ? binY(info.bot) - 0.5 * H / NS : 0.42 * H;
    const shY = Math.min(top + 0.06 * H, 0.82 * H);
    const wrY = Math.max(bot + 0.075 * H, 0.4 * H);
    const elY = (shY + wrY) / 2;
    return { sh: new THREE.Vector3(lineX(info, top, side) * 0.92, shY, 0), el: new THREE.Vector3(lineX(info, elY, side), elY, 0), wr: new THREE.Vector3(lineX(info, wrY, side), wrY, 0) };
  };
  const L = sideJ(1), R = sideJ(-1);
  // arm z: mean z of arm vertices around each joint height
  const meanZ = (side: number, y: number, fallback: number) => {
    let s2 = 0, c = 0;
    for (let i = 0; i < n; i++) if (arm[i] === side && Math.abs(pos[i * 3 + 1] - y) < 0.03 * H) { s2 += pos[i * 3 + 2]; c++; }
    return c ? s2 / c : fallback;
  };
  for (const [J, sd] of [[L, 1], [R, -1]] as const) { J.el.z = meanZ(sd, J.el.y, 0); J.wr.z = meanZ(sd, J.wr.y, J.el.z); J.sh.z = meanZ(sd, J.sh.y - 0.06 * H, 0) * 0.5; }

  // crotch: highest slice (below 56%) whose non-arm vertices split around x = 0
  let crotch = 0.46 * H;
  for (let b = Math.floor(0.56 * NS); b >= Math.floor(0.3 * NS); b--) {
    const cl = clusters[b].filter((c) => !c.idx.some((i) => arm[i]));
    if (cl.length >= 2 && cl.some((c) => c.b < 0.01 * H) && cl.some((c) => c.a > -0.01 * H) && !cl.some((c) => c.a < -0.005 * H && c.b > 0.005 * H)) { crotch = binY(b); break; }
  }
  const hipY = crotch + 0.03 * H, kneeY = 0.055 * H + (crotch - 0.055 * H) * 0.5;
  const sideMean = (y0: number, y1: number, side: number) => {
    let sx = 0, sz = 0, c = 0;
    for (let i = 0; i < n; i++) { const y = pos[i * 3 + 1]; if (y < y0 || y > y1 || arm[i]) continue; const x = pos[i * 3]; if (x * side <= 0) continue; sx += x; sz += pos[i * 3 + 2]; c++; }
    return c ? [sx / c, sz / c] : [0.08 * H * side, 0];
  };
  const [lhx, lhz] = sideMean(crotch - 0.08 * H, crotch - 0.03 * H, 1), [rhx, rhz] = sideMean(crotch - 0.08 * H, crotch - 0.03 * H, -1);
  const [lkx, lkz] = sideMean(kneeY - 0.02 * H, kneeY + 0.02 * H, 1), [rkx, rkz] = sideMean(kneeY - 0.02 * H, kneeY + 0.02 * H, -1);
  // neck: narrowest slice between 78% and 90%
  let neckY = 0.835 * H, nw = Infinity;
  for (let b = Math.floor(0.78 * NS); b <= Math.floor(0.9 * NS); b++) {
    const cl = clusters[b].filter((c) => c.a < 0.05 * H && c.b > -0.05 * H);
    if (!cl.length) continue;
    const w = Math.max(...cl.map((c) => c.b)) - Math.min(...cl.map((c) => c.a));
    if (w < nw) { nw = w; neckY = binY(b); }
  }
  const spineY = hipY + 0.07 * H, chestY = Math.max(spineY + 0.05 * H, (spineY + neckY) / 2 + 0.02 * H);
  const J: Record<BoneName, THREE.Vector3> = {
    pelvis: new THREE.Vector3(0, hipY, (lhz + rhz) / 2),
    spine: new THREE.Vector3(0, spineY, (lhz + rhz) / 2),
    chest: new THREE.Vector3(0, chestY, 0),
    head: new THREE.Vector3(0, neckY, 0),
    lArm: L.sh, lFore: L.el, rArm: R.sh, rFore: R.el,
    lLeg: new THREE.Vector3(lhx, hipY, lhz), lKnee: new THREE.Vector3(lkx, kneeY, lkz),
    rLeg: new THREE.Vector3(rhx, hipY, rhz), rKnee: new THREE.Vector3(rkx, kneeY, rkz),
  };

  // ---- weights (dense, 12 per vertex), then smoothed over the mesh and cut to the top 4 ----
  const NB = BONES.length;
  let W = new Float32Array(n * NB);
  const put = (i: number, b: BoneName, w: number) => { W[i * NB + BI[b]] += w; };
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], ax = Math.abs(x);
    const sd = x >= 0 ? "l" : "r";
    const S = sd === "l" ? L : R;
    if (arm[i]) {
      const t = sstep(S.el.y - 0.035 * H, S.el.y + 0.035 * H, y);
      put(i, (sd + "Arm") as BoneName, t); put(i, (sd + "Fore") as BoneName, 1 - t);
      continue;
    }
    if (y > neckY - 0.02 * H && ax < 0.11 * H) {
      const t = sstep(neckY - 0.02 * H, neckY + 0.02 * H, y);
      put(i, "head", t); put(i, "chest", 1 - t);
      continue;
    }
    if (y >= hipY - 0.06 * H) {
      // torso split pelvis / spine / chest
      const tw = new Map<BoneName, number>();
      if (y < spineY) { const t = sstep(hipY - 0.02 * H, spineY, y); tw.set("pelvis", 1 - t); tw.set("spine", t); }
      else if (y < chestY) { const t = sstep(spineY, chestY, y); tw.set("spine", 1 - t); tw.set("chest", t); }
      else tw.set("chest", 1);
      // shoulder caps follow the upper arm
      const shX = Math.abs(S.sh.x);
      let a = y > S.sh.y - 0.14 * H ? sstep(0.6 * shX, 1.02 * shX, ax) * (1 - sstep(S.sh.y + 0.02 * H, S.sh.y + 0.07 * H, y)) : 0;
      // hips blend into the thighs
      const l = sstep(hipY + 0.02 * H, hipY - 0.06 * H, y) * sstep(0.0, 0.03 * H, ax);
      const rest = 1 - a - l * (1 - a);
      for (const [b, w] of tw) put(i, b, w * Math.max(0, rest));
      if (a) put(i, (sd + "Arm") as BoneName, a);
      if (l) put(i, (sd + "Leg") as BoneName, l * (1 - a));
      continue;
    }
    const kn = sd === "l" ? J.lKnee.y : J.rKnee.y;
    const t = sstep(kn - 0.035 * H, kn + 0.035 * H, y);
    put(i, (sd + "Leg") as BoneName, t); put(i, (sd + "Knee") as BoneName, 1 - t);
  }
  // smoothing over triangle edges
  const idx = g0.index ? g0.index.array : null;
  if (idx) {
    const deg = new Uint32Array(n);
    for (let k = 0; k < idx.length; k++) deg[idx[k]] += 2;
    const off = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
    const adj = new Uint32Array(off[n]), fill = off.slice(0, n);
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k], b = idx[k + 1], c = idx[k + 2];
      adj[fill[a]++] = b; adj[fill[a]++] = c; adj[fill[b]++] = a; adj[fill[b]++] = c; adj[fill[c]++] = a; adj[fill[c]++] = b;
    }
    for (let it = 0; it < 3; it++) {
      const W2 = new Float32Array(W.length);
      for (let i = 0; i < n; i++) {
        const d = off[i + 1] - off[i];
        for (let b = 0; b < NB; b++) {
          let acc = 0;
          for (let k = off[i]; k < off[i + 1]; k++) acc += W[adj[k] * NB + b];
          W2[i * NB + b] = d ? W[i * NB + b] * 0.5 + (acc / d) * 0.5 : W[i * NB + b];
        }
      }
      W = W2;
    }
  }
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const order = new Array(NB);
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < NB; b++) order[b] = b;
    order.sort((p, q) => W[i * NB + q] - W[i * NB + p]);
    let tot = 0;
    for (let k = 0; k < 4; k++) tot += W[i * NB + order[k]];
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = order[k]; sw[i * 4 + k] = tot > 0 ? W[i * NB + order[k]] / tot : k === 0 ? 1 : 0; }
    if (tot <= 0) si[i * 4] = BI.chest;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (N) geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (U) geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  if (idx) geometry.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  if (!N) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = (Array.isArray(src.material) ? src.material[0] : src.material) as THREE.Material;
  // bind-pose inverses
  const { list } = makeBones(J);
  list[0].updateMatrixWorld(true);
  const inverses = list.map((b) => b.matrixWorld.clone().invert());
  const rig: Rig = { geometry, material, joints: J, wrist: { l: L.wr, r: R.wr }, inverses, height };
  rigs.set(key, rig);
  return rig;
}

export function makeBones(J: Record<BoneName, THREE.Vector3>) {
  const map = {} as Record<BoneName, THREE.Bone>;
  const list: THREE.Bone[] = [];
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const p = PARENT[name];
    b.position.copy(J[name]);
    if (p) { b.position.sub(J[p]); map[p].add(b); }
    map[name] = b; list.push(b);
  }
  return { map, list };
}

/** A fresh skinned instance of a rig (own bones, shared geometry + material). */
export function instantiate(rig: Rig) {
  const { map, list } = makeBones(rig.joints);
  for (const k of ["lArm", "rArm"] as const) map[k].rotation.order = "YXZ";
  const skeleton = new THREE.Skeleton(list, rig.inverses);
  const mesh = new THREE.SkinnedMesh(rig.geometry, rig.material);
  mesh.add(map.pelvis);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  return { mesh, bones: map, skeleton };
}
