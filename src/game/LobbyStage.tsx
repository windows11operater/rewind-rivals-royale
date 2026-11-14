// @ts-nocheck -- strict index checks relaxed for render hot paths
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CharacterModel, RigWarmer, setGun, type CharRefs } from "./CharacterModel";
import { SKINS, type Skin } from "./data";

type V3 = [number, number, number];
/** every outfit's detailed model, then the light in-match ones, warmed in the background */
const WARM_URLS = [...SKINS.map((s) => s.model), ...SKINS.map((s) => s.lo)];
/** Pedestal slots: you in the middle, then right, left, far right (classic lobby order). */
export const SLOTS: V3[] = [[0, 0, 0], [1.8, 0, -0.35], [-1.4, 0, -0.9], [3.15, 0, -1.35]];
const PED_H = 0.2;

export interface StageMember { name: string; skin: Skin; ready: boolean; leader?: boolean; you?: boolean; talking?: boolean }

export function IdleFigure({ skin, phase = 0 }: { skin: Skin; phase?: number }) {
  const r = useRef<CharRefs>(null);
  useFrame(({ clock }) => {
    const c = r.current;
    if (!c?.root || !c.chest) return;
    const t = clock.elapsedTime + phase;
    const b = Math.sin(t * 1.7);
    setGun(c, null);
    c.pick.visible = false;
    c.chest.scale.set(1 + b * 0.01, 1 + b * 0.012, 1 + b * 0.02);
    c.spine.rotation.set(b * 0.01, Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.5) * 0.015);
    c.head.rotation.set(Math.sin(t * 0.8) * 0.02, Math.sin(t * 0.33) * 0.2, Math.sin(t * 0.5) * 0.02);
    c.lArm.rotation.set(b * 0.02, 0, b * 0.012);
    c.lFore.rotation.x = -0.05 + b * 0.02;
    c.rArm.rotation.set(b * 0.02, 0, -b * 0.012);
    c.rFore.rotation.x = -0.05 + b * 0.02;
    c.root.position.set(Math.sin(t * 0.45) * 0.02, 0, 0);
    c.root.rotation.y = Math.sin(t * 0.3) * 0.05;
  });
  return (
    <Suspense fallback={<LoadingHolo />}>
      <CharacterModel ref={r} skin={skin} detail="high" armed={false} />
    </Suspense>
  );
}

/** Pulsing hologram silhouette shown on a pedestal while an outfit streams in. */
function LoadingHolo() {
  const m = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (m.current) m.current.opacity = 0.18 + Math.sin(t * 4) * 0.08;
    if (ring.current) { ring.current.position.y = 0.1 + ((t * 0.9) % 1) * 1.8; ring.current.scale.setScalar(1 - ((t * 0.9) % 1) * 0.3); }
  });
  return (
    <group>
      <mesh position={[0, 0.98, 0]}><capsuleGeometry args={[0.26, 1.2, 6, 16]} /><meshBasicMaterial ref={m} color="#bfe3ff" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh position={[0, 1.78, 0]}><sphereGeometry args={[0.16, 16, 12]} /><meshBasicMaterial color="#bfe3ff" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
      <mesh ref={ring} rotation-x={Math.PI / 2}><torusGeometry args={[0.42, 0.012, 6, 48]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
    </group>
  );
}

function gradientTex() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#000"); gr.addColorStop(0.55, "#333"); gr.addColorStop(1, "#fff");
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

function Pedestal({ pos, active, you }: { pos: V3; active: boolean; you?: boolean }) {
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const beamTex = useMemo(gradientTex, []);
  const N = 36;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * 0.82, 0.13, Math.sin(a) * 0.82);
      bulbs.current!.setMatrixAt(i, m);
    }
    bulbs.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group position={pos}>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[0.8, 0.88, PED_H, 56]} />
        <meshStandardMaterial color="#cfd8e4" metalness={0.92} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.95, 0.98, 0.06, 56]} />
        <meshStandardMaterial color="#7c8698" metalness={0.85} roughness={0.35} />
      </mesh>
      <mesh position={[0, PED_H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.68, 56]} />
        <meshStandardMaterial color="#eaf5ff" emissive="#bfe3ff" emissiveIntensity={active ? 0.9 : 0.25} metalness={0.3} roughness={0.35} />
      </mesh>
      <mesh position={[0, PED_H + 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.022, 8, 72]} />
        <meshBasicMaterial color={active ? "#ffffff" : "#a9c9ea"} toneMapped={false} />
      </mesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.022, 6, 4]} />
        <meshBasicMaterial color={active ? "#ffe8a8" : "#c9b98a"} toneMapped={false} />
      </instancedMesh>
      {active && (
        <mesh position={[0, PED_H + 1.6, 0]}>
          <cylinderGeometry args={[0.5, 0.7, 3.2, 40, 1, true]} />
          <meshBasicMaterial color="#d9ecff" alphaMap={beamTex} transparent opacity={you ? 0.32 : 0.22} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
      {active && <Sparkles count={you ? 60 : 36} scale={[1.9, 0.5, 1.9]} position={[0, 0.32, 0]} size={2.6} speed={0.35} color="#ffe6a6" />}
    </group>
  );
}

function Snow({ count = 700 }) {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { a[i * 3] = (Math.random() - 0.5) * 14; a[i * 3 + 1] = Math.random() * 6; a[i * 3 + 2] = -5 + Math.random() * 9; }
    return a;
  }, [count]);
  useFrame(({ clock }, dt) => {
    const p = ref.current?.geometry.attributes.position;
    if (!p) return;
    const d = Math.min(dt, 0.05);
    const arr = p.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= d * (0.35 + (i % 7) * 0.05);
      arr[i * 3] += Math.sin(t * 0.7 + i) * d * 0.12;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 6;
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.045} transparent opacity={0.85} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function LookAt({ target }: { target: V3 }) {
  const { camera } = useThree();
  useLayoutEffect(() => { camera.lookAt(...target); }, [camera, target]);
  return null;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#eef3ff", "#8f84b8", 1.0]} />
      <directionalLight position={[3, 5, 5]} intensity={2.1} color="#fff1e2" />
      <directionalLight position={[-3, 4, -4]} intensity={1.8} color="#b9d4ff" />
      <directionalLight position={[-4, 2, 3]} intensity={0.6} color="#d8c8ff" />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1.2} color="#c9b8ff" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={1.2} color="#ffe2c4" position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
    </>
  );
}

function Projector({ points, els }: { points: V3[]; els: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    points.forEach((p, i) => {
      const el = els.current[i];
      if (!el) return;
      v.set(p[0], p[1], p[2]).project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`;
    });
  });
  return null;
}

export function Stage({ members, onInvite, canInvite }: { members: (StageMember | null)[]; onInvite: () => void; canInvite: boolean }) {
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const points: V3[] = SLOTS.map((s, i) => (members[i] ? [s[0], 2.72, s[2]] : [s[0], 1.2, s[2]]));
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0.2, 1.6, 10], fov: 30 }}
        onCreated={({ gl }) => gl.domElement.parentElement?.setAttribute("data-scene-ready", "1")}
      >
        <LookAt target={[0.2, 1.25, 0]} />
        <Lights />
        <pointLight position={[0, 3.2, 1.4]} intensity={6} distance={6} color="#dcecff" />
        {SLOTS.map((s, i) => {
          const mem = members[i];
          return (
            <group key={i}>
              <Pedestal pos={s} active={!!mem} you={i === 0} />
              {mem && (
                <group position={[s[0], s[1] + PED_H, s[2]]} rotation={[0, -s[0] * 0.07, 0]}>
                  <IdleFigure skin={mem.skin} phase={i * 1.9} />
                </group>
              )}
            </group>
          );
        })}
        <Snow />
        <Projector points={points} els={els} />
        <RigWarmer urls={WARM_URLS} />
      </Canvas>
      {SLOTS.map((_, i) => {
        const mem = members[i];
        return (
          <div key={i} ref={(el) => { els.current[i] = el; }} className={`absolute left-0 top-0 z-[5] ${mem ? "pointer-events-none" : ""}`} style={{ transform: "translate(-9999px, 0)" }}>
            {mem ? <NameTag m={mem} /> : (
              <button
                onClick={onInvite}
                disabled={!canInvite}
                aria-label="Add a teammate"
                className="flex h-14 w-14 items-center justify-center border-2 border-dashed border-hud/80 bg-hud/10 text-4xl font-light text-hud transition hover:scale-110 hover:bg-hud/25 disabled:opacity-40"
              >+</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NameTag({ m }: { m: StageMember }) {
  return (
    <div className="flex flex-col items-center whitespace-nowrap font-ui text-fn-shadow">
      <div className="flex items-center gap-1.5 border-b-2 border-dotted border-hud/60 pb-0.5 text-xl text-hud">
        {m.leader ? <Crown /> : <SpeakerIcon on={!!m.talking} />}
        {m.name}
      </div>
      <div className={`mt-0.5 text-lg font-semibold ${m.ready ? "text-fn-party" : "text-fn-text-dim"}`}>{m.ready ? "Ready" : "Not Ready"}</div>
    </div>
  );
}

export function Crown() {
  return <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden><path d="M1 12 L2 3 L6 7 L9 1 L12 7 L16 3 L17 12 Z" style={{ fill: "var(--fn-yellow)" }} /></svg>;
}
export function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden>
      <path d="M1 5 H5 L10 1 V15 L5 11 H1 Z" style={{ fill: "var(--hud)" }} />
      {on && <path d="M12.5 4.5 Q15 8 12.5 11.5 M14.5 2.5 Q18.5 8 14.5 13.5" style={{ stroke: "var(--fn-party)", fill: "none", strokeWidth: 1.6 }} />}
    </svg>
  );
}

/** Small spinning-free preview used by the locker and item shop. */
export function Preview({ skin, height = "100%", pedestal = false }: { skin: Skin; height?: string; pedestal?: boolean }) {
  return (
    <div style={{ height }} className="relative w-full">
      <Canvas dpr={[1, 2]} gl={{ alpha: true }} camera={{ position: [0, 1.35, pedestal ? 5.4 : 4.4], fov: 34 }}>
        <LookAt target={[0, pedestal ? 1.15 : 1.05, 0]} />
        <Lights />
        {pedestal && <Pedestal pos={[0, 0, 0]} active you />}
        <group position={[0, pedestal ? PED_H : 0, 0]}><IdleFigure skin={skin} /></group>
      </Canvas>
    </div>
  );
}
