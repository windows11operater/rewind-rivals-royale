// @ts-nocheck -- strict index checks relaxed for game hot paths
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CharacterModel, setGun, type CharRefs } from "./CharacterModel";
import { RARITY_COLORS, SKINS } from "./data";
import { islandTop } from "./island";
import { ART, paintOverlay } from "./mapArt";
import { CELL, GUN_KINDS, MAP, SEA, SWING, type Build, type GunKind, type Input, type Sim } from "./sim";
import { MUZZLE, tintFor, useWeaponGeos } from "./weapons";

export const MAT_COLORS = { wood: "#c58f52", brick: "#b5633f", metal: "#aeb8c2" };

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256, rep = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
function setInst(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0) {
  E.set(rx, ry, 0, "YXZ"); Q.setFromEuler(E);
  M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
  mesh.setMatrixAt(i, M4);
}

/* ---------------- ground, sky, foliage ---------------- */

/**
 * The island ground: a smooth heightfield built from the same height grid the sim walks on (so feet always
 * touch the ground), textured with the island's top-down picture. Town streets/plazas/pitch are blended on
 * top in world space, plus a fine procedural grain so close-up ground isn't blurry.
 */
const ISLAND_SEG = 360;
function Island({ sim }: { sim: Sim }) {
  const mesh = useMemo(() => {
    const T = sim.terrain, H = MAP, N = ISLAND_SEG, row = N + 1;
    const pos = new Float32Array(row * row * 3), uv = new Float32Array(row * row * 2);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -H + (i / N) * 2 * H, z = -H + (j / N) * 2 * H, k = j * row + i;
      pos[k * 3] = x; pos[k * 3 + 1] = T.raw(x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = i / N; uv[k * 2 + 1] = 1 - j / N;
    }
    const idx = new Uint32Array(N * N * 6);
    let n = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const top = islandTop ? new THREE.Texture(islandTop) : null;
    if (top) { top.colorSpace = THREE.SRGBColorSpace; top.anisotropy = 8; top.needsUpdate = true; }
    const overlay = new THREE.CanvasTexture(paintOverlay(sim));
    overlay.colorSpace = THREE.SRGBColorSpace; overlay.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: top, color: top ? "#ffffff" : "#5fc843", roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.overlayMap = { value: overlay };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vOvUv;\nvarying vec3 vWp;\nvarying float vUp;")
        .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
          vec4 ovW = modelMatrix * vec4(transformed, 1.0);
          vWp = ovW.xyz; vUp = normal.y;
          vOvUv = vec2((ovW.x + ${(ART / 2).toFixed(1)}) / ${ART.toFixed(1)}, 1.0 - (ovW.z + ${(ART / 2).toFixed(1)}) / ${ART.toFixed(1)});`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform sampler2D overlayMap;
          varying vec2 vOvUv; varying vec3 vWp; varying float vUp;
          float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          // cartoon grade: a touch brighter + more saturated, like the classic island
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = clamp(mix(vec3(lum), diffuseColor.rgb, 1.22) * 1.06, 0.0, 1.0);
          // fine grain so the ground reads up close
          float gr = vn(vWp.xz * 1.7) * 0.6 + vn(vWp.xz * 6.0) * 0.4;
          diffuseColor.rgb *= 0.9 + gr * 0.2;
          // steep slopes show a little dirt
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.47, 0.36, 0.24), smoothstep(0.82, 0.62, vUp) * 0.55);
          // wet sand just above the waterline
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.78, 0.55), smoothstep(${(SEA + 1.4).toFixed(2)}, ${(SEA + 0.3).toFixed(2)}, vWp.y) * step(${(SEA - 0.6).toFixed(2)}, vWp.y) * 0.7);
          vec4 ovC = texture2D(overlayMap, vOvUv);
          diffuseColor.rgb = mix(diffuseColor.rgb, ovC.rgb, ovC.a);`);
    };
    mat.customProgramCacheKey = () => "island-ground-v2";
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }, [sim]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

function Ocean() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, SEA, 0]}>
      <planeGeometry args={[5000, 5000]} />
      <meshStandardMaterial color="#3d9be0" roughness={0.25} metalness={0.1} />
    </mesh>
  );
}

function Sky() {
  const tex = useMemo(() => canvasTex((g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "#4aa6f0"); gr.addColorStop(0.42, "#8fd0ff"); gr.addColorStop(0.5, "#d9f0ff"); gr.addColorStop(1, "#d9f0ff");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }), []);
  useEffect(() => { tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; }, [tex]);
  return (
    <mesh>
      <sphereGeometry args={[1400, 32, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

function Clouds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const clouds = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ x: Math.cos(i * 2.4) * (200 + (i * 37) % 500), z: Math.sin(i * 2.4) * (200 + (i * 53) % 500), y: 120 + (i * 13) % 50, s: 14 + (i * 7) % 16 })), []);
  useLayoutEffect(() => {
    const m = ref.current!;
    let n = 0;
    for (const c of clouds) for (let j = 0; j < 4; j++) setInst(m, n++, c.x + (j - 1.5) * c.s * 0.9, c.y + (j % 2) * c.s * 0.25, c.z + (j % 3) * 4, c.s * (j === 1 || j === 2 ? 1.2 : 0.85), c.s * 0.55, c.s * 0.8);
    m.instanceMatrix.needsUpdate = true;
  }, [clouds]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, clouds.length * 4]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial color="#ffffff" emissive="#dfefff" emissiveIntensity={0.35} roughness={1} fog={false} />
    </instancedMesh>
  );
}

/** Trees and rocks: instanced, harvestable. Destroyed ones vanish; the one being hit wobbles. */
function Trees({ sim }: { sim: Sim }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const blob = useRef<THREE.InstancedMesh>(null);
  const pine = useRef<THREE.InstancedMesh>(null);
  const rock = useRef<THREE.InstancedMesh>(null);
  const layout = useMemo(() => {
    let nb = 0, np = 0;
    return sim.trees.map((t) => (t.k === 0 ? { b: (nb += 5) - 5, p: -1 } : { b: -1, p: (np += 3) - 3 }));
  }, [sim]);
  const counts = useMemo(() => ({ b: Math.max(1, sim.trees.filter((t) => t.k === 0).length * 5), p: Math.max(1, sim.trees.filter((t) => t.k === 1).length * 3) }), [sim]);
  const greens = ["#4db53a", "#5fc843", "#3f9f34", "#57bd3e"];
  const PARTS = [[0, 3.6, 0, 2.1], [1.0, 3.0, 0.4, 1.45], [-0.8, 3.1, -0.6, 1.5], [0.1, 4.8, 0.1, 1.35], [-0.3, 3.3, 1.0, 1.3]];
  /** write tree i's instances; (wx, wz) leans the crown for the hit wobble */
  const placeTree = (i: number, wx = 0, wz = 0) => {
    const t = sim.trees[i], L = layout[i], g = sim.terrain.ground(t.x, t.z), s = t.dead ? 0.0001 : t.s;
    setInst(trunk.current!, i, t.x + wx * 0.3, g + 1.3 * t.s - 0.2, t.z + wz * 0.3, s, s, s);
    if (L.b >= 0) PARTS.forEach(([ox, oy, oz, r], k) => {
      setInst(blob.current!, L.b + k, t.x + ox * t.s + wx * oy * t.s, g + oy * t.s, t.z + oz * t.s + wz * oy * t.s, r * s, r * s * 0.92, r * s, i);
    });
    else for (let k = 0; k < 3; k++) setInst(pine.current!, L.p + k, t.x + wx * (2.6 + k * 1.5) * t.s, g + (2.6 + k * 1.5) * t.s, t.z + wz * (2.6 + k * 1.5) * t.s, (2.2 - k * 0.55) * s, 2.4 * s, (2.2 - k * 0.55) * s, i + k);
  };
  const placeRock = (i: number, wx = 0, wz = 0) => {
    const r = sim.rocks[i], s = r.dead ? 0.0001 : r.s;
    setInst(rock.current!, i, r.x + wx, sim.terrain.ground(r.x, r.z) + r.s * 0.3, r.z + wz, s, s * 0.7, s, i * 2, i);
  };
  const flush = () => { for (const m of [trunk, blob, pine, rock]) m.current!.instanceMatrix.needsUpdate = true; };
  useLayoutEffect(() => {
    sim.trees.forEach((t, i) => {
      placeTree(i);
      const L = layout[i];
      if (L.b >= 0) for (let k = 0; k < 5; k++) blob.current!.setColorAt(L.b + k, C.set(greens[(i + k) % 4]));
      else for (let k = 0; k < 3; k++) pine.current!.setColorAt(L.p + k, C.set(k === 2 ? "#3c9a3a" : "#2f8a35"));
    });
    sim.rocks.forEach((_, i) => placeRock(i));
    flush();
    for (const m of [blob, pine]) if (m.current!.instanceColor) m.current!.instanceColor.needsUpdate = true;
  }, [sim]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useRef({ ver: sim.propVer, shaking: null as null | { kind: string; i: number } });
  useFrame(() => {
    const st = seen.current;
    let dirty = false;
    if (st.ver !== sim.propVer) { st.ver = sim.propVer; sim.trees.forEach((_, i) => placeTree(i)); sim.rocks.forEach((_, i) => placeRock(i)); dirty = true; }
    const sh = sim.shake;
    if (sh) {
      const k = sh.t / (sh.kind === "tree" ? 0.35 : 0.25), w = Math.sin(k * 26) * k * (sh.kind === "tree" ? 0.05 : 0.06);
      if (sh.kind === "tree") placeTree(sh.i, sh.dx * w, sh.dz * w); else placeRock(sh.i, sh.dx * w, sh.dz * w);
      st.shaking = { kind: sh.kind, i: sh.i }; dirty = true;
    } else if (st.shaking) { if (st.shaking.kind === "tree") placeTree(st.shaking.i); else placeRock(st.shaking.i); st.shaking = null; dirty = true; }
    if (dirty) flush();
  });
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, sim.trees.length]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.22, 0.36, 2.6, 7]} /><meshStandardMaterial color="#7a5232" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={blob} args={[undefined, undefined, counts.b]} castShadow frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={pine} args={[undefined, undefined, counts.p]} castShadow frustumCulled={false}>
        <coneGeometry args={[1, 1, 8]} /><meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={rock} args={[undefined, undefined, sim.rocks.length]} castShadow receiveShadow frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#9a9ea3" flatShading roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function GrassTufts({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 5000;
  useLayoutEffect(() => {
    const m = ref.current!;
    let n = 0, tries = 0;
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    while (n < N && tries++ < N * 3) {
      const x = (rnd() - 0.5) * 470, z = (rnd() - 0.5) * 470;
      if (sim.nearRoad(x, z, 1) || sim.terrain.water(x, z)) continue;
      if (sim.houses.some((h) => Math.abs(h.x - x) < h.w / 2 + 1 && Math.abs(h.z - z) < h.d / 2 + 1)) continue;
      if (sim.pitch && Math.abs(x - sim.pitch.x) < 10 && Math.abs(z - sim.pitch.z) < 15) continue;
      if (Math.abs(x) < 30 && z > -55 && z < 15) continue;
      const s = 0.5 + rnd() * 0.6;
      setInst(m, n, x, sim.terrain.ground(x, z) + s * 0.25, z, s * 0.5, s, s * 0.5, rnd() * 6);
      m.setColorAt(n++, C.set(rnd() < 0.5 ? "#6ad048" : "#55b83a"));
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [sim]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <coneGeometry args={[0.35, 0.6, 3]} /><meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}

/* ---------------- towns ---------------- */

function ClockTower({ sim }: { sim: Sim }) {
  const hourH = useRef<THREE.Group[]>([]);
  const minH = useRef<THREE.Group[]>([]);
  const stone = useMemo(() => canvasTex((g, s) => {
    g.fillStyle = "#d1bf9e"; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < s; x += 32) { g.strokeStyle = "rgba(90,70,40,0.35)"; g.lineWidth = 2; g.strokeRect(x, y, 32, 16); }
  }, 256, 1), []);
  useEffect(() => { stone.repeat.set(2, 6); }, [stone]);
  useFrame(() => {
    const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
    hourH.current.forEach((g) => g && (g.rotation.z = -(h / 12) * Math.PI * 2));
    minH.current.forEach((g) => g && (g.rotation.z = -(m / 60) * Math.PI * 2));
  });
  const c = sim.clock;
  if (!c) return null;
  const half = c.s / 2;
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh position={[0, c.h + 0.5, 0]} castShadow><boxGeometry args={[c.s + 1, 1, c.s + 1]} /><meshStandardMaterial color="#8c7a5c" /></mesh>
      <mesh position={[0, c.h + 3, 0]} castShadow><boxGeometry args={[c.s - 1.5, 4, c.s - 1.5]} /><meshStandardMaterial color="#cdb894" /></mesh>
      <mesh position={[0, c.h + 8, 0]} rotation-y={Math.PI / 4} castShadow><coneGeometry args={[(c.s - 0.5) * 0.75, 6, 4]} /><meshStandardMaterial color="#3d5a78" flatShading /></mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation-y={(i * Math.PI) / 2}>
          <group position={[0, c.h - 3, half + 0.06]}>
            <mesh><circleGeometry args={[2.3, 32]} /><meshStandardMaterial color="#5a4a30" /></mesh>
            <mesh position={[0, 0, 0.02]}><circleGeometry args={[2.05, 32]} /><meshStandardMaterial color="#fdf8e8" emissive="#fff6d6" emissiveIntensity={0.25} /></mesh>
            {Array.from({ length: 12 }, (_, j) => <mesh key={j} position={[Math.sin((j / 12) * Math.PI * 2) * 1.75, Math.cos((j / 12) * Math.PI * 2) * 1.75, 0.04]}><boxGeometry args={[0.12, 0.3, 0.02]} /><meshBasicMaterial color="#222" /></mesh>)}
            <group ref={(g) => { hourH.current[i] = g!; }} position={[0, 0, 0.06]}><mesh position={[0, 0.5, 0]}><boxGeometry args={[0.16, 1.0, 0.03]} /><meshBasicMaterial color="#111" /></mesh></group>
            <group ref={(g) => { minH.current[i] = g!; }} position={[0, 0, 0.08]}><mesh position={[0, 0.75, 0]}><boxGeometry args={[0.1, 1.5, 0.03]} /><meshBasicMaterial color="#111" /></mesh></group>
          </group>
        </group>
      ))}
    </group>
  );
}

function Cars({ sim }: { sim: Sim }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => { sim.cars.forEach((c, i) => { const g = refs.current[i]; if (g) g.visible = !c.dead; }); });
  return (
    <>
      {sim.cars.map((c, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }} position={[c.x, sim.terrain.ground(c.x, c.z), c.z]} rotation-y={c.alongZ ? 0 : Math.PI / 2}>
          <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[2, 0.8, 4.3]} /><meshStandardMaterial color={c.color} metalness={0.4} roughness={0.35} /></mesh>
          <mesh position={[0, 1.35, -0.3]} castShadow><boxGeometry args={[1.8, 0.65, 2.2]} /><meshStandardMaterial color={c.color} metalness={0.4} roughness={0.35} /></mesh>
          <mesh position={[0, 1.36, -0.3]}><boxGeometry args={[1.84, 0.5, 2.0]} /><meshStandardMaterial color="#26384a" roughness={0.1} metalness={0.6} /></mesh>
          {[[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]].map(([x, z], j) => (
            <mesh key={j} position={[x, 0.38, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.38, 0.38, 0.3, 12]} /><meshStandardMaterial color="#1d1d1f" /></mesh>
          ))}
          <mesh position={[0, 0.75, 2.16]}><boxGeometry args={[1.6, 0.2, 0.02]} /><meshBasicMaterial color="#fff6c8" /></mesh>
        </group>
      ))}
    </>
  );
}

function Streetlights({ sim }: { sim: Sim }) {
  const pole = useRef<THREE.InstancedMesh>(null);
  const arm = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    sim.lamps.forEach((l, i) => {
      const y = sim.terrain.ground(l.x, l.z);
      setInst(pole.current!, i, l.x, y + 3, l.z, 1, 1, 1);
      const ax = l.x + Math.sin(l.rot) * 0.9, az = l.z + Math.cos(l.rot) * 0.9;
      setInst(arm.current!, i, ax, y + 5.9, az, 0.12, 0.12, 1.9, l.rot);
      const hx = l.x + Math.sin(l.rot) * 1.8, hz = l.z + Math.cos(l.rot) * 1.8;
      setInst(head.current!, i, hx, y + 5.8, hz, 0.5, 0.2, 0.8, l.rot);
    });
    for (const m of [pole, arm, head]) m.current!.instanceMatrix.needsUpdate = true;
  }, [sim]);
  const n = Math.max(1, sim.lamps.length);
  return (
    <>
      <instancedMesh ref={pole} args={[undefined, undefined, n]} castShadow><cylinderGeometry args={[0.09, 0.14, 6, 6]} /><meshStandardMaterial color="#5d6670" metalness={0.6} roughness={0.4} /></instancedMesh>
      <instancedMesh ref={arm} args={[undefined, undefined, n]}><boxGeometry /><meshStandardMaterial color="#5d6670" metalness={0.6} roughness={0.4} /></instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, n]}><boxGeometry /><meshStandardMaterial color="#fff3c4" emissive="#ffe39a" emissiveIntensity={0.8} /></instancedMesh>
    </>
  );
}

function Pitch({ sim }: { sim: Sim }) {
  const p = sim.pitch;
  if (!p) return null;
  const goal = (z: number, rot: number) => (
    <group position={[p.x, sim.terrain.ground(p.x, z), z]} rotation-y={rot}>
      {[-2.2, 2.2].map((x) => <mesh key={x} position={[x, 1.1, 0]} castShadow><cylinderGeometry args={[0.08, 0.08, 2.2, 8]} /><meshStandardMaterial color="#ffffff" /></mesh>)}
      <mesh position={[0, 2.2, 0]} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[0.08, 0.08, 4.5, 8]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[0, 1.1, -0.9]} rotation-x={0.4}><planeGeometry args={[4.4, 2.4]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.35} side={THREE.DoubleSide} wireframe /></mesh>
    </group>
  );
  return <>{goal(p.z - p.d / 2, 0)}{goal(p.z + p.d / 2, Math.PI)}</>;
}

function Chests({ sim }: { sim: Sim }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    sim.chests.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.visible = !c.opened;
      const glow = g.children[2] as THREE.Mesh;
      if (glow) glow.rotation.y = clock.elapsedTime * 1.5;
    });
  });
  return (
    <>
      {sim.chests.map((c, i) => (
        <group key={c.id} position={[c.x, c.y, c.z]} rotation={[0, c.rot, 0]} ref={(g) => { refs.current[i] = g; }}>
          <mesh position={[0, 0.35, 0]} castShadow><boxGeometry args={[1.1, 0.7, 0.7]} /><meshStandardMaterial color="#b8862e" metalness={0.6} roughness={0.35} emissive="#7a4a00" emissiveIntensity={0.5} /></mesh>
          <mesh position={[0, 0.78, 0]}><boxGeometry args={[1.14, 0.2, 0.74]} /><meshStandardMaterial color="#e8c34a" metalness={0.8} roughness={0.2} emissive="#a07000" emissiveIntensity={0.6} /></mesh>
          <mesh position={[0, 1.4, 0]}><octahedronGeometry args={[0.18]} /><meshBasicMaterial color="#fff2a0" /></mesh>
        </group>
      ))}
    </>
  );
}

/* ---------------- loot, builds, blueprint ---------------- */

const LOOT_CAP = 120;

/** Floor loot: the user's weapon models (rarity-tinted, slowly spinning over a rarity glow); heals as small crates. */
function Loot({ sim }: { sim: Sim }) {
  const geos = useWeaponGeos();
  const guns = useRef<Partial<Record<GunKind, THREE.InstancedMesh>>>({});
  const glow = useRef<THREE.InstancedMesh>(null);
  const heals = useRef<THREE.InstancedMesh>(null);
  const cnt = useMemo(() => ({ ar: 0, shotgun: 0, smg: 0, pistol: 0 } as Record<GunKind, number>), []);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    for (const k of GUN_KINDS) cnt[k] = 0;
    let nh = 0, ng = 0;
    const t = clock.elapsedTime;
    for (let i = 0; i < sim.loot.length; i++) {
      const l = sim.loot[i];
      const bob = Math.sin(t * 2 + i) * 0.06;
      if (l.item.t === "gun") {
        const m = guns.current[l.item.k];
        if (!m || cnt[l.item.k] >= LOOT_CAP) continue;
        const j = cnt[l.item.k]++;
        setInst(m, j, l.x, l.y + 0.55 + bob, l.z, 1.25, 1.25, 1.25, t * 0.9 + i);
        m.setColorAt(j, tintFor(RARITY_COLORS[l.item.r], tint));
        if (ng < LOOT_CAP * 2) { setInst(glow.current!, ng, l.x, l.y + 0.04, l.z, 0.7, 1, 0.7, 0, -Math.PI / 2); glow.current!.setColorAt(ng++, tint.set(RARITY_COLORS[l.item.r])); }
      } else if (nh < LOOT_CAP * 2) {
        const sh = l.item.k === "mini" || l.item.k === "big";
        setInst(heals.current!, nh, l.x, l.y + 0.35 + bob, l.z, 0.45, 0.45, 0.45, t + i);
        heals.current!.setColorAt(nh++, tint.set(sh ? "#4ab0ff" : "#ff5a5a"));
      }
    }
    for (const k of GUN_KINDS) { const m = guns.current[k]; if (!m) continue; m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    for (const [m, n] of [[glow.current!, ng], [heals.current!, nh]] as const) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  return (
    <>
      {GUN_KINDS.map((k) => (
        <instancedMesh key={k} ref={(m) => { if (m) guns.current[k] = m; }} args={[geos[k], undefined, LOOT_CAP]} frustumCulled={false} castShadow>
          <meshStandardMaterial metalness={0.55} roughness={0.4} emissive="#1a1a1a" />
        </instancedMesh>
      ))}
      <instancedMesh ref={glow} args={[undefined, undefined, LOOT_CAP * 2]} frustumCulled={false}>
        <circleGeometry args={[1, 24]} /><meshBasicMaterial transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={heals} args={[undefined, undefined, LOOT_CAP * 2]} frustumCulled={false} castShadow>
        <boxGeometry /><meshStandardMaterial emissive="#222" roughness={0.5} />
      </instancedMesh>
    </>
  );
}

function Tracers({ sim }: { sim: Sim }) {
  const tracers = useRef<THREE.InstancedMesh>(null);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const T = tracers.current!;
    const tn = Math.min(60, sim.tracers.length);
    for (let i = 0; i < tn; i++) {
      const t = sim.tracers[i];
      a.set(t.x1, t.y1, t.z1); b.set(t.x2, t.y2, t.z2);
      const len = a.distanceTo(b);
      V.copy(a).add(b).multiplyScalar(0.5);
      Q.setFromUnitVectors(up, b.sub(a).normalize());
      M4.compose(V, Q, S.set(0.04, len, 0.04));
      T.setMatrixAt(i, M4);
    }
    T.count = tn; T.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={tracers} args={[undefined, undefined, 60]} frustumCulled={false}><cylinderGeometry args={[1, 1, 1, 4]} /><meshBasicMaterial color="#ffe9a0" /></instancedMesh>;
}

function panelTex() {
  return canvasTex((g, s) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 3, s);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 14; g.strokeRect(0, 0, s, s);
    g.strokeStyle = "rgba(0,0,0,0.2)"; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  });
}

function Builds({ sim }: { sim: Sim }) {
  const boxes = useRef<THREE.InstancedMesh>(null);
  const ramps = useRef<THREE.InstancedMesh>(null);
  const cones = useRef<THREE.InstancedMesh>(null);
  const tex = useMemo(panelTex, []);
  const MAX = useMemo(() => sim.builds.reduce((n, b) => n + Math.max(1, b.boxes.length), 0) + 2500, [sim]);
  useFrame(() => {
    const B = boxes.current!, R = ramps.current!, K = cones.current!;
    let nb = 0, nr = 0, nk = 0;
    for (const b of sim.builds) {
      const dmg = 0.55 + 0.45 * (b.hp / b.max);
      C.set(b.color ?? MAT_COLORS[b.mat]).multiplyScalar(b.world ? 0.75 + 0.25 * (b.hp / b.max) : dmg);
      if (b.kind === "ramp" && nr < MAX) {
        setInst(R, nr, b.cx, b.y0 + CELL / 2, b.cz, CELL, 0.22, CELL * Math.SQRT2, (b.dir * Math.PI) / 2, -Math.PI / 4);
        R.setColorAt(nr++, C);
      } else if (b.kind === "cone" && nk < MAX) {
        setInst(K, nk, b.cx, b.y0 + 1, b.cz, CELL * 0.707, 2, CELL * 0.707, Math.PI / 4);
        K.setColorAt(nk++, C);
      } else for (const q of b.boxes) {
        if (nb >= MAX) break;
        const y0 = q.y0 ?? 0;
        setInst(B, nb, (q.minX + q.maxX) / 2, (y0 + q.h) / 2, (q.minZ + q.maxZ) / 2, q.maxX - q.minX, q.h - y0, q.maxZ - q.minZ);
        B.setColorAt(nb++, C);
      }
    }
    for (const [m, n] of [[B, nb], [R, nr], [K, nk]] as const) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });
  return (
    <>
      <instancedMesh ref={boxes} args={[undefined, undefined, MAX]} frustumCulled={false} castShadow receiveShadow><boxGeometry /><meshStandardMaterial map={tex} roughness={0.8} /></instancedMesh>
      <instancedMesh ref={ramps} args={[undefined, undefined, MAX]} frustumCulled={false} castShadow receiveShadow><boxGeometry /><meshStandardMaterial map={tex} roughness={0.8} /></instancedMesh>
      <instancedMesh ref={cones} args={[undefined, undefined, MAX]} frustumCulled={false} castShadow><coneGeometry args={[1, 1, 4]} /><meshStandardMaterial map={tex} roughness={0.8} flatShading /></instancedMesh>
    </>
  );
}

function Blueprint({ sim }: { sim: Sim }) {
  const g = useRef<THREE.Group>(null);
  const wall = useRef<THREE.Mesh>(null), floor = useRef<THREE.Mesh>(null), ramp = useRef<THREE.Mesh>(null), cone = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => canvasTex((c, s) => {
    c.fillStyle = "rgba(90,180,255,0.55)"; c.fillRect(0, 0, s, s);
    c.strokeStyle = "rgba(220,245,255,0.95)"; c.lineWidth = 3;
    for (let i = 0; i <= s; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.moveTo(0, i); c.lineTo(s, i); c.stroke(); }
    c.lineWidth = 12; c.strokeRect(0, 0, s, s);
  }), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, color: "#ffffff" }), [tex]);
  useFrame(({ clock }) => {
    const b: Build | null = sim.preview;
    g.current!.visible = !!b;
    if (!b) return;
    mat.color.set(sim.previewOk ? "#bfe6ff" : "#ff8a8a");
    mat.opacity = 0.6 + Math.sin(clock.elapsedTime * 6) * 0.12;
    for (const r of [wall, floor, ramp, cone]) r.current!.visible = false;
    const H = CELL / 2;
    if (b.kind === "wall") {
      const m = wall.current!; m.visible = true;
      if (b.dir === 0) { m.position.set(b.cx, b.y0 + H, b.cz + H); m.rotation.set(0, 0, 0); }
      else { m.position.set(b.cx + H, b.y0 + H, b.cz); m.rotation.set(0, Math.PI / 2, 0); }
    } else if (b.kind === "floor") { const m = floor.current!; m.visible = true; m.position.set(b.cx, b.y0 + 0.13, b.cz); }
    else if (b.kind === "ramp") { const m = ramp.current!; m.visible = true; m.position.set(b.cx, b.y0 + H, b.cz); m.rotation.set(-Math.PI / 4, (b.dir * Math.PI) / 2, 0, "YXZ"); }
    else { const m = cone.current!; m.visible = true; m.position.set(b.cx, b.y0 + 1, b.cz); }
  });
  return (
    <group ref={g}>
      <mesh ref={wall} material={mat}><boxGeometry args={[CELL, CELL, 0.3]} /></mesh>
      <mesh ref={floor} material={mat}><boxGeometry args={[CELL, 0.26, CELL]} /></mesh>
      <mesh ref={ramp} material={mat}><boxGeometry args={[CELL, 0.24, CELL * Math.SQRT2]} /></mesh>
      <mesh ref={cone} material={mat} rotation-y={Math.PI / 4}><coneGeometry args={[CELL * 0.707, 2, 4]} /></mesh>
    </group>
  );
}

/* ---------------- characters & bus ---------------- */

/** Drives every outfit's bones from sim state: idle, run, jump, skydive, glide, harvest, shoot, build, heal. */

/* ---------------- harvesting + gun effects (textures drawn once) ---------------- */

function spriteTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let FX: null | Record<"weak" | "spark" | "arrows" | "flash" | "wood" | "brick" | "metal", THREE.Texture> = null;
function fxTextures() {
  if (FX) return FX;
  const weak = spriteTex((g, s) => {
    const c = s / 2;
    g.lineCap = "round";
    g.strokeStyle = "#2f9dff"; g.lineWidth = s * 0.07;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(c, c, s * 0.42, k * 2.094 + 0.25, k * 2.094 + 1.75); g.stroke(); }
    g.strokeStyle = "#9fe3ff"; g.lineWidth = s * 0.045;
    g.beginPath(); g.arc(c, c, s * 0.3, 0, Math.PI * 2); g.stroke();
    const gr = g.createRadialGradient(c, c, 0, c, c, s * 0.19);
    gr.addColorStop(0, "#ffd66a"); gr.addColorStop(0.6, "#ff8a1c"); gr.addColorStop(1, "#e2560e");
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, s * 0.19, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = s * 0.018; g.beginPath(); g.arc(c, c, s * 0.2, 0, Math.PI * 2); g.stroke();
  });
  const spark = spriteTex((g, s) => {
    const c = s / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(170,225,255,0.9)"); gr.addColorStop(1, "rgba(60,150,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = "#ffffff";
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + (k % 2) * 0.2, L = (k % 3 === 0 ? 0.5 : 0.34) * s;
      g.beginPath(); g.moveTo(c + Math.cos(a) * L, c + Math.sin(a) * L);
      g.lineTo(c + Math.cos(a + 0.12) * s * 0.06, c + Math.sin(a + 0.12) * s * 0.06); g.lineTo(c + Math.cos(a - 0.12) * s * 0.06, c + Math.sin(a - 0.12) * s * 0.06); g.fill();
    }
  });
  const arrows = spriteTex((g, s) => {
    g.fillStyle = "#ff8f1f"; g.strokeStyle = "#6a2a00"; g.lineWidth = s * 0.01;
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(s / 2, s / 2); g.rotate(k * Math.PI / 2 + Math.PI / 4);
      g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(-s * 0.07, -s * 0.44); g.lineTo(s * 0.07, -s * 0.44); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  });
  const flash = spriteTex((g, s) => {
    const c = s / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, "rgba(255,255,230,1)"); gr.addColorStop(0.2, "rgba(255,210,90,0.95)"); gr.addColorStop(0.55, "rgba(255,120,30,0.5)"); gr.addColorStop(1, "rgba(255,80,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,240,180,0.9)";
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95); g.lineTo(c + Math.cos(a + 0.3) * c * 0.15, c + Math.sin(a + 0.3) * c * 0.15); g.lineTo(c + Math.cos(a - 0.3) * c * 0.15, c + Math.sin(a - 0.3) * c * 0.15); g.fill(); }
  });
  const wood = spriteTex((g, s) => {
    // two white birch logs, like the classic harvest pop
    for (const [y, x] of [[0.58, 0.12], [0.34, 0.2]]) {
      const Y = y * s, X = x * s, W = s * 0.66, Hh = s * 0.2;
      g.fillStyle = "#f4f1ea"; g.strokeStyle = "#3a3a3a"; g.lineWidth = s * 0.02;
      g.beginPath(); g.roundRect(X, Y, W, Hh, Hh / 2); g.fill(); g.stroke();
      g.fillStyle = "#9b9890"; for (let k = 1; k < 4; k++) g.fillRect(X + (W * k) / 4, Y + Hh * 0.2, s * 0.02, Hh * 0.6);
      g.fillStyle = "#d9b88a"; g.beginPath(); g.ellipse(X + W - Hh * 0.35, Y + Hh / 2, Hh * 0.3, Hh * 0.45, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  });
  const brick = spriteTex((g, s) => {
    g.strokeStyle = "#3a1a10"; g.lineWidth = s * 0.02;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2 + (r % 2); k++) {
      const w = s * 0.3, x = s * 0.14 + k * w + (r % 2 ? -w / 2 : 0), y = s * 0.24 + r * s * 0.18;
      g.fillStyle = r % 2 ? "#c45a37" : "#b04a2e"; g.fillRect(x, y, w - s * 0.02, s * 0.16); g.strokeRect(x, y, w - s * 0.02, s * 0.16);
    }
  });
  const metal = spriteTex((g, s) => {
    g.fillStyle = "#c9d2dc"; g.strokeStyle = "#39424d"; g.lineWidth = s * 0.025;
    g.beginPath(); g.roundRect(s * 0.18, s * 0.26, s * 0.64, s * 0.48, s * 0.05); g.fill(); g.stroke();
    g.fillStyle = "#7d8792"; for (const [x, y] of [[0.25, 0.33], [0.75, 0.33], [0.25, 0.67], [0.75, 0.67]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.03, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(s * 0.24, s * 0.4, s * 0.52, s * 0.05);
  });
  FX = { weak, spark, arrows, flash, wood, brick, metal };
  return FX;
}

function hpTex() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 48;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { c, t, last: "" };
}
function drawHp(h: ReturnType<typeof hpTex>, hp: number, max: number) {
  const key = hp + "/" + max;
  if (h.last === key) return;
  h.last = key;
  const g = h.c.getContext("2d")!, W = 256, H = 48;
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgba(10,20,30,0.75)"; g.fillRect(0, 8, W, 32);
  g.fillStyle = "#5fe04a"; g.fillRect(3, 11, (W - 6) * Math.max(0, hp / max), 26);
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(3, 11, (W - 6) * Math.max(0, hp / max), 6);
  g.font = "bold 26px Oswald, sans-serif"; g.textBaseline = "middle"; g.fillStyle = "#ffffff"; g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = 4;
  const txt = `${Math.ceil(hp)}  |  ${max}`;
  g.strokeText(txt, 12, 25); g.fillText(txt, 12, 25);
  h.t.needsUpdate = true;
}

const FX_POOL = 28;
/**
 * The classic harvesting look: blue weak-point circle on the object, white-blue hit spark, popping
 * resource icons, orange crit arrows and a green HP bar by the hit. Reads sim.weak / harvestFx / hpBar.
 */
function HarvestFx({ sim }: { sim: Sim }) {
  const tex = useMemo(fxTextures, []);
  const hp = useMemo(hpTex, []);
  const weak = useRef<THREE.Mesh>(null);
  const bar = useRef<THREE.Sprite>(null);
  const pool = useRef<THREE.Sprite[]>([]);
  const sprites = useMemo(() => Array.from({ length: FX_POOL }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    sp.renderOrder = 20; sp.visible = false;
    return sp;
  }), []);
  const g = useRef<THREE.Group>(null);
  useLayoutEffect(() => { const grp = g.current!; sprites.forEach((s) => grp.add(s)); pool.current = sprites; return () => { sprites.forEach((s) => grp.remove(s)); }; }, [sprites]);
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    // weak point
    const w = sim.weak, wm = weak.current!;
    wm.visible = !!w;
    if (w) {
      wm.position.set(w.x + w.nx * 0.07, w.y, w.z + w.nz * 0.07);
      wm.lookAt(camera.position);
      wm.rotateZ(t * 1.6);
      const pop = Math.min(1, w.t * 7), pulse = 1 + Math.sin(t * 7) * 0.05;
      wm.scale.setScalar((0.55 + (1 - pop) * 0.4) * pulse * Math.max(0.6, pop));
    }
    // hit sparks, resource pops, crit arrows
    let n = 0;
    const use = (map: THREE.Texture, x: number, y: number, z: number, sc: number, op: number, rot = 0, attenuate = true) => {
      if (n >= FX_POOL) return;
      const sp = pool.current[n++];
      const m = sp.material as THREE.SpriteMaterial;
      if (m.map !== map) { m.map = map; m.needsUpdate = true; }
      m.opacity = op; m.rotation = rot;
      if (m.sizeAttenuation !== attenuate) { m.sizeAttenuation = attenuate; m.needsUpdate = true; }
      sp.position.set(x, y, z); sp.scale.set(sc, sc, 1); sp.visible = true;
    };
    for (const f of sim.harvestFx) {
      const life = f.poof ? 0.7 : 0.85, a = life - f.t;
      if (f.poof) { for (let k = 0; k < 6; k++) { const ang = k * 1.047 + 0.3; use(tex[f.mat], f.x + Math.cos(ang) * a * 3, f.y + a * 2 - a * a * 3, f.z + Math.sin(ang) * a * 3, 0.9, Math.max(0, 1 - a / life), ang + a * 4); } continue; }
      if (a < 0.16) use(tex.spark, f.x, f.y, f.z, (0.5 + a * 6) * (f.crit ? 1.35 : 1), 1 - a / 0.16, a * 8);
      if (f.crit && a < 0.35) use(tex.arrows, f.x, f.y, f.z, 0.06 + a * 0.06, 1 - a / 0.35, 0, false);
      const k = Math.min(1, a / 0.12), rise = a * 0.9, sz = 0.55 * (0.6 + k * 0.4) * (f.crit ? 1.2 : 1), op = a < 0.55 ? 1 : Math.max(0, 1 - (a - 0.55) / 0.3);
      use(tex[f.mat], f.x - 0.25 + a * -0.5, f.y + 0.2 + rise, f.z, sz, op, -0.15);
      if (f.crit) use(tex[f.mat], f.x + 0.3 + a * 0.4, f.y + 0.05 + rise * 0.8, f.z, sz * 0.85, op, 0.2);
    }
    for (let i = n; i < FX_POOL; i++) pool.current[i].visible = false;
    // HP bar beside the hit, constant on-screen size
    const hb = sim.hpBar, b = bar.current!;
    b.visible = !!hb;
    if (hb) {
      drawHp(hp, hb.hp, hb.max);
      b.position.set(hb.x, hb.y - 0.25, hb.z);
      (b.material as THREE.SpriteMaterial).opacity = Math.min(1, hb.t * 3);
    }
  });
  return (
    <group ref={g}>
      <mesh ref={weak} renderOrder={19}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.weak} transparent depthWrite={false} depthTest={false} toneMapped={false} />
      </mesh>
      <sprite ref={bar} renderOrder={21} scale={[0.13, 0.024, 1]} center={[1.05, 0.5]}>
        <spriteMaterial map={hp.t} transparent depthWrite={false} depthTest={false} sizeAttenuation={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

/** Orange muzzle flash at the end of whichever gun just fired (bigger for the shotgun), lighting the shooter. */
function MuzzleFlashes({ sim, refs }: { sim: Sim; refs: React.MutableRefObject<(CharRefs | null)[]> }) {
  const tex = useMemo(fxTextures, []);
  const pool = useMemo(() => Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.visible = false; s.renderOrder = 15; return s; }), [tex]);
  const g = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useLayoutEffect(() => { const grp = g.current!; pool.forEach((s) => grp.add(s)); return () => { pool.forEach((s) => grp.remove(s)); }; }, [pool]);
  useFrame(() => {
    let n = 0, lit = false;
    sim.players.forEach((p, i) => {
      if (n >= pool.length || p.fireT <= 0 || !p.alive) return;
      const r = refs.current[i], it = p.slots[p.sel - 1];
      if (!r?.gun || !r.gun.visible || !it || it.t !== "gun") return;
      if (Math.hypot(p.x - sim.cam.x, p.z - sim.cam.z) > 90) return;
      const m = MUZZLE[it.k];
      r.gun.updateWorldMatrix(true, false);
      v.set(m[0], m[1], m[2] + 0.08).applyMatrix4(r.gun.matrixWorld);
      const s = pool[n++], k = p.fireT / 0.1, big = it.k === "shotgun" ? 1.5 : it.k === "pistol" ? 1.1 : 0.8;
      s.position.copy(v); s.scale.setScalar((0.35 + (1 - k) * 0.3) * big); (s.material as THREE.SpriteMaterial).opacity = k; (s.material as THREE.SpriteMaterial).rotation = p.shotAt * 37; s.visible = true;
      if (p.isUser && light.current) { light.current.position.copy(v); light.current.intensity = 14 * k * big; lit = true; }
    });
    for (let i = n; i < pool.length; i++) pool[i].visible = false;
    if (!lit && light.current) light.current.intensity = 0;
  });
  return <group ref={g}><pointLight ref={light} color="#ffb24a" distance={7} decay={2} intensity={0} /></group>;
}

function Characters({ sim }: { sim: Sim }) {
  const refs = useRef<(CharRefs | null)[]>([]);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    sim.players.forEach((p, i) => {
      const r = refs.current[i];
      if (!r?.root) return;
      r.root.visible = p.alive && p.phase !== "bus";
      if (!r.root.visible) return;
      r.root.position.set(p.x, p.y, p.z);
      r.root.rotation.y = p.yaw;
      const sky = p.phase === "sky", glide = p.phase === "glide", ground = p.phase === "ground";
      const jump = ground && !p.gnd;
      const run = ground && p.gnd ? Math.min(1, p.moving) : 0;
      const ph = p.walkT, sn = Math.sin(ph);
      const breathe = Math.sin(t * 1.8 + i);
      r.root.rotation.x = sky ? 1.2 : 0;
      // legs
      let lL = sn * 0.75 * run, rL = -sn * 0.75 * run;
      let lK = (Math.max(0, sn) * 1.1 + 0.08) * run, rK = (Math.max(0, -sn) * 1.1 + 0.08) * run;
      if (jump) { lL = -0.55; rL = -0.1; lK = 1.05; rK = 0.45; }
      else if (sky) { lL = 0.25; rL = 0.35; lK = 0.6; rK = 0.5; }
      else if (glide) { lL = 0.15 + Math.sin(t * 2) * 0.08; rL = -0.1 - Math.sin(t * 2) * 0.08; lK = 0.35; rK = 0.25; }
      r.lLeg!.rotation.set(lL, 0, sky ? 0.25 : 0); r.rLeg!.rotation.set(rL, 0, sky ? -0.25 : 0);
      r.lKnee!.rotation.set(lK, 0, 0); r.rKnee!.rotation.set(rK, 0, 0);
      r.pelvis!.position.y = r.pelvisY + Math.abs(Math.cos(ph)) * 0.05 * run - (jump ? 0.05 : 0);
      r.spine!.rotation.set(run * 0.12 + (jump ? 0.1 : 0) + breathe * 0.008, Math.sin(ph) * 0.06 * run, 0);
      r.chest!.scale.setScalar(1 + breathe * 0.006);
      const look = p.isUser ? p.pitch : 0;
      r.head!.rotation.set(-look * 0.4, 0, 0);
      // arms + held item
      const it = p.slots[p.sel - 1];
      const hasGun = !p.building && p.sel > 0 && it?.t === "gun" && !glide && !sky;
      setGun(r, hasGun ? it.k : null, hasGun ? tintFor(RARITY_COLORS[it.r], tint) : undefined);
      r.pick!.visible = p.sel === 0 && !p.building && !glide && !sky;
      r.pick!.rotation.set(Math.PI / 2.4, 0, 0);
      if (sky) {
        r.lArm!.rotation.set(-0.3, 0, 1.25); r.rArm!.rotation.set(-0.3, 0, -1.25);
        r.lFore!.rotation.x = -0.3; r.rFore!.rotation.x = -0.3;
      } else if (glide) {
        r.lArm!.rotation.set(-2.85, 0, 0.25); r.rArm!.rotation.set(-2.85, 0, -0.25);
        r.lFore!.rotation.x = -0.2; r.rFore!.rotation.x = -0.2;
      } else if (hasGun) {
        // shouldered aim; per-gun recoil kick, and the Tactical Shotgun's pump after every shot
        const since = sim.time - p.shotAt, pistol = it.k === "pistol", sg = it.k === "shotgun";
        const kickLen = sg ? 0.16 : pistol ? 0.2 : 0.08, kickAmt = sg ? 0.42 : pistol ? 0.5 : 0.14;
        const kick = since < kickLen ? kickAmt * (1 - since / kickLen) * Math.min(1, since * 60 + 0.4) : 0;
        const pump = sg && since > 0.2 && since < 0.55 ? Math.sin(((since - 0.2) / 0.35) * Math.PI) : 0;
        r.rArm!.rotation.set(-Math.PI / 2 + 0.15 - kick - look, 0, 0);
        r.rFore!.rotation.x = pistol ? -0.05 - kick * 0.4 : -0.25;
        r.lArm!.rotation.set(-Math.PI / 2 + 0.3 - look - kick * 0.8 + pump * 0.32, pistol ? -0.75 : -0.55, 0);
        r.lFore!.rotation.x = (pistol ? -0.3 : -0.55) - pump * 0.55;
        r.spine!.rotation.y += 0.12;
        r.spine!.rotation.x -= kick * 0.25;
      } else if (p.building) {
        r.rArm!.rotation.set(-1.2, 0, 0); r.lArm!.rotation.set(-0.9, -0.3, 0);
        r.rFore!.rotation.x = -0.4; r.lFore!.rotation.x = -0.4;
      } else if (p.healT > 0) {
        r.lArm!.rotation.set(-1.3, -0.3, 0); r.rArm!.rotation.set(-1.3, 0.3, 0);
        r.lFore!.rotation.x = -0.9; r.rFore!.rotation.x = -0.9;
      } else if (p.sel === 0 && p.swingT > 0) {
        // classic harvest: pickaxe cocked high over the right shoulder, big diagonal chop across the body, recover
        const k = 1 - p.swingT / SWING;
        const ease = (x: number) => x * x * (3 - 2 * x);
        let ax: number, az: number, fore: number, twist: number, bend: number;
        if (k < 0.32) { const e = ease(k / 0.32); ax = -0.4 - e * 2.55; az = -e * 0.45; fore = -0.3 - e * 0.9; twist = -e * 0.35; bend = -e * 0.08; }
        else if (k < 0.55) { const e = ease((k - 0.32) / 0.23); ax = -2.95 + e * 2.75; az = -0.45 + e * 0.95; fore = -1.2 + e * 1.05; twist = -0.35 + e * 0.85; bend = -0.08 + e * 0.3; }
        else { const e = ease((k - 0.55) / 0.45); ax = -0.2 - e * 0.2; az = 0.5 - e * 0.5; fore = -0.15 - e * 0.2; twist = 0.5 - e * 0.5; bend = 0.22 - e * 0.22; }
        r.rArm!.rotation.set(ax, 0, az); r.rFore!.rotation.x = fore;
        r.lArm!.rotation.set(-0.9 - twist * 0.4, -0.35, 0.1); r.lFore!.rotation.x = -0.8;
        r.spine!.rotation.y += twist; r.spine!.rotation.x += bend;
      } else {
        r.rArm!.rotation.set(-sn * 0.7 * run - 0.15, 0, 0); r.lArm!.rotation.set(sn * 0.7 * run + breathe * 0.02, 0, 0);
        r.rFore!.rotation.x = -0.35 - run * 0.4; r.lFore!.rotation.x = -0.15 - run * 0.5;
      }
      r.glider!.visible = glide;
    });
  });
  return (
    <>
      {sim.players.map((p, i) => (
        <Suspense key={p.id} fallback={null}>
          <CharacterModel skin={SKINS[p.skin] ?? SKINS[0]} detail={p.isUser ? "high" : "low"} ref={(r) => { refs.current[i] = r; }} />
        </Suspense>
      ))}
      <MuzzleFlashes sim={sim} refs={refs} />
    </>
  );
}

/** Iconic blue school bus hanging under a blue hot-air balloon, with burner and rear thrusters. */
function BattleBus({ sim }: { sim: Sim }) {
  const g = useRef<THREE.Group>(null);
  const flames = useRef<THREE.Mesh[]>([]);
  const busWin = useMemo(() => canvasTex((c, s) => {
    c.fillStyle = "#2a63c9"; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { c.fillStyle = "#e9eef3"; c.fillRect(i * (s / 6) + 4, 8, s / 6 - 8, s - 16); c.fillStyle = "#9fd2f5"; c.fillRect(i * (s / 6) + 8, 12, s / 6 - 16, s - 24); c.fillStyle = "rgba(255,255,255,0.45)"; c.fillRect(i * (s / 6) + 8, 12, 6, s - 24); }
  }, 256), []);
  const stripes = useMemo(() => canvasTex((c, s) => {
    for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? "#2f7fe8" : "#5aa8ff"; c.fillRect((i * s) / 12, 0, s / 12 + 1, s); }
    c.fillStyle = "#1c4fa8"; c.fillRect(0, s * 0.82, s, s * 0.18);
    c.fillStyle = "#ffffff"; c.fillRect(0, s * 0.42, s, s * 0.05);
  }, 256), []);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.visible = sim.bus.active;
    const t = clock.elapsedTime;
    g.current.position.set(sim.bus.x, 80 + Math.sin(t) * 0.4, sim.bus.z);
    g.current.rotation.y = Math.atan2(sim.bus.dx, sim.bus.dz);
    g.current.rotation.z = Math.sin(t * 0.7) * 0.02;
    flames.current.forEach((f, i) => { if (f) { const k = 0.85 + Math.sin(t * 30 + i * 2) * 0.12 + Math.random() * 0.08; f.scale.set(k, k * (1 + Math.random() * 0.25), k); } });
  });
  const metal = <meshStandardMaterial color="#b9c2cc" metalness={0.9} roughness={0.25} />;
  const flameMat = <meshBasicMaterial color="#ffb347" transparent opacity={0.9} />;
  return (
    <group ref={g}>
      {/* body */}
      <mesh position={[0, 0, -0.4]}><boxGeometry args={[3, 2.7, 8]} /><meshStandardMaterial color="#2a63c9" roughness={0.45} metalness={0.15} /></mesh>
      {[-1, 1].map((sd) => <mesh key={sd} position={[sd * 1.52, 0.45, -0.6]} rotation-y={sd * Math.PI / 2}><planeGeometry args={[6.8, 1.0]} /><meshStandardMaterial map={busWin} side={THREE.DoubleSide} /></mesh>)}
      {[-1, 1].map((sd) => <mesh key={"s" + sd} position={[sd * 1.52, -0.45, -0.4]}><boxGeometry args={[0.04, 0.18, 8]} /><meshStandardMaterial color="#ffffff" /></mesh>)}
      <mesh position={[0, 1.42, -0.4]}><boxGeometry args={[2.8, 0.25, 7.8]} /><meshStandardMaterial color="#e8eef5" /></mesh>
      {/* hood + windshield */}
      <mesh position={[0, -0.55, 4.2]}><boxGeometry args={[2.7, 1.6, 1.6]} /><meshStandardMaterial color="#2a63c9" roughness={0.45} /></mesh>
      <mesh position={[0, 0.6, 3.56]}><boxGeometry args={[2.7, 1.0, 0.06]} /><meshStandardMaterial color="#9fd2f5" metalness={0.5} roughness={0.1} /></mesh>
      <mesh position={[0, -0.9, 5.05]}><boxGeometry args={[3.1, 0.35, 0.3]} /><meshStandardMaterial color="#222" /></mesh>
      {[-0.95, 0.95].map((x) => <mesh key={x} position={[x, -0.35, 5.01]}><circleGeometry args={[0.22, 16]} /><meshBasicMaterial color="#fff6c8" /></mesh>)}
      <mesh position={[0, -0.9, -4.45]}><boxGeometry args={[3.1, 0.35, 0.3]} /><meshStandardMaterial color="#222" /></mesh>
      {[[-1.4, 3.6], [1.4, 3.6], [-1.4, -2.8], [1.4, -2.8]].map(([x, z], i) => <mesh key={i} position={[x, -1.35, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.55, 0.55, 0.4, 16]} /><meshStandardMaterial color="#1b1b1d" /></mesh>)}
      {/* rear thrusters */}
      {[-1.1, 1.1].map((x, i) => (
        <group key={x} position={[x, 0.2, -4.6]} rotation-x={Math.PI / 2}>
          <mesh><cylinderGeometry args={[0.45, 0.6, 1.4, 16]} />{metal}</mesh>
          <mesh position={[0, 0.75, 0]}><cylinderGeometry args={[0.62, 0.62, 0.2, 16]} /><meshStandardMaterial color="#444b55" metalness={0.8} roughness={0.3} /></mesh>
          <mesh ref={(m) => { flames.current[i] = m!; }} position={[0, 1.6, 0]}><coneGeometry args={[0.42, 1.6, 12]} />{flameMat}</mesh>
        </group>
      ))}
      {/* ropes */}
      {[[-1.3, 3.3], [1.3, 3.3], [-1.3, -4.1], [1.3, -4.1]].map(([x, z], i) => {
        const top = new THREE.Vector3(x * 0.55, 6.2, z * 0.35), bot = new THREE.Vector3(x, 1.5, z);
        const mid = top.clone().add(bot).multiplyScalar(0.5), len = top.distanceTo(bot);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
        return <mesh key={i} position={mid} quaternion={q}><cylinderGeometry args={[0.045, 0.045, len, 5]} /><meshStandardMaterial color="#3a2a1a" /></mesh>;
      })}
      {/* burner */}
      <group position={[0, 6.6, -0.4]}>
        <mesh><cylinderGeometry args={[0.9, 0.7, 0.9, 16]} />{metal}</mesh>
        <mesh position={[0, 0.55, 0]}><torusGeometry args={[0.85, 0.12, 8, 20]} />{metal}</mesh>
        <mesh ref={(m) => { flames.current[2] = m!; }} position={[0, 1.4, 0]}><coneGeometry args={[0.5, 1.6, 12]} /><meshBasicMaterial color="#ffd36b" transparent opacity={0.95} /></mesh>
      </group>
      {/* balloon */}
      <group position={[0, 13.5, -0.4]}>
        <mesh scale={[1, 1.15, 1]}><sphereGeometry args={[5.4, 28, 20]} /><meshStandardMaterial map={stripes} roughness={0.6} /></mesh>
        <mesh position={[0, -5.6, 0]}><cylinderGeometry args={[2.3, 1.1, 1.8, 20, 1, true]} /><meshStandardMaterial color="#1c4fa8" side={THREE.DoubleSide} /></mesh>
      </group>
    </group>
  );
}

function Storm({ sim }: { sim: Sim }) {
  const wall = useRef<THREE.Mesh>(null);
  const next = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const s = sim.storm;
    wall.current!.position.set(s.cx, 60, s.cz);
    wall.current!.scale.set(s.r, 1, s.r);
    (wall.current!.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(clock.elapsedTime * 2) * 0.05;
    next.current!.visible = s.phase >= 0;
    next.current!.position.set(s.nx, 0.15, s.nz);
    next.current!.scale.set(s.nr || 0.01, s.nr || 0.01, 1);
  });
  return (
    <>
      <mesh ref={wall}><cylinderGeometry args={[1, 1, 120, 96, 1, true]} /><meshBasicMaterial color="#9b3bff" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <mesh ref={next} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.985, 1, 96]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.6} /></mesh>
    </>
  );
}

/** Warm sun whose shadow box follows the camera target. */
function Sun({ sim, low }: { sim: Sim; low: boolean }) {
  const L = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  useEffect(() => { const l = L.current!; scene.add(l.target); return () => { scene.remove(l.target); }; }, [scene]);
  useFrame(() => {
    const c = sim.cam, l = L.current!;
    l.position.set(c.tx + 60, c.ty + 110, c.tz + 35);
    l.target.position.set(c.tx, 0, c.tz);
  });
  const size = low ? 1024 : 2048;
  return (
    <directionalLight ref={L} intensity={2.5} color="#fff0d2" castShadow
      shadow-mapSize-width={size} shadow-mapSize-height={size} shadow-bias={-0.0004} shadow-normalBias={0.04}
      shadow-camera-left={-65} shadow-camera-right={65} shadow-camera-top={65} shadow-camera-bottom={-65} shadow-camera-near={10} shadow-camera-far={320} />
  );
}

function Stepper({ sim, input, onTick, beforeStep, paused }: { sim: Sim; input: Input; onTick: () => void; beforeStep?: (dt: number) => void; paused?: { current: boolean } }) {
  const { camera, scene } = useThree();
  const ready = useRef(false);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    beforeStep?.(dt);
    if (!paused?.current) sim.step(dt, input);
    const c = sim.cam;
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.tx, c.ty, c.tz);
    const pc = camera as THREE.PerspectiveCamera;
    pc.fov += (c.fov - pc.fov) * Math.min(1, dt * 12);
    pc.updateProjectionMatrix();
    const s = sim.storm;
    const inStorm = Math.hypot(c.x - s.cx, c.z - s.cz) > s.r;
    const fog = scene.fog as THREE.Fog;
    fog.color.set(inStorm ? "#6a2fa8" : "#cdeaff");
    fog.near = inStorm ? 10 : 120;
    fog.far = inStorm ? 70 : 620;
    if (!ready.current) { ready.current = true; document.querySelector("[data-game]")?.setAttribute("data-scene-ready", "1"); }
    onTick();
  }, -1);
  return null;
}

export function GameScene({ sim, input, onTick, beforeStep, paused, low = false }: { sim: Sim; input: Input; onTick: () => void; beforeStep?: (dt: number) => void; paused?: { current: boolean }; low?: boolean }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color("#8fd0ff");
    scene.fog = new THREE.Fog("#cdeaff", 120, 620);
  }, [scene]);
  return (
    <>
      <Stepper sim={sim} input={input} onTick={onTick} beforeStep={beforeStep} paused={paused} />
      <hemisphereLight args={["#e4f4ff", "#6f9a3c", 1.0]} />
      <ambientLight intensity={0.15} color="#fff2dc" />
      <Sun sim={sim} low={low} />
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
        <Lightformer intensity={1} color="#ffe2b8" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <Sky />
      <Clouds />
      <Ocean />
      <Island sim={sim} />
      <Trees sim={sim} />
      {!low && <GrassTufts sim={sim} />}
      <ClockTower sim={sim} />
      <Cars sim={sim} />
      <Streetlights sim={sim} />
      <Pitch sim={sim} />
      <Chests sim={sim} />
      <Suspense fallback={null}><Loot sim={sim} /></Suspense>
      <Tracers sim={sim} />
      <Builds sim={sim} />
      <Blueprint sim={sim} />
      <Characters sim={sim} />
      <HarvestFx sim={sim} />
      <BattleBus sim={sim} />
      <Storm sim={sim} />
    </>
  );
}
