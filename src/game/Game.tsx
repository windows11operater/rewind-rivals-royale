// @ts-nocheck -- strict index checks relaxed for game hot paths
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameScene } from "./Scene";
import { BUILD_COST, GUNS, HEALS, MAP, MAT_HP, Sim, itemName, type Input, type Mat, type PieceKind } from "./sim";
import { RARITY_COLORS, SKINS } from "./data";
import { useMeta, type MatchResult } from "./store";
import { ART, paintMap } from "./mapArt";
import { PadReader } from "./gamepad";
import { GamepadIcon, Scaled, useUiScale } from "./ui";
import { loadIsland, type IslandData } from "./island";

const KEYMAP: Record<string, string> = {
  Space: "jump", KeyE: "interact", KeyR: "reload", KeyQ: "build", KeyG: "drop", KeyF: "slot0",
  Digit1: "slot1", Digit2: "slot2", Digit3: "slot3", Digit4: "slot4", Digit5: "slot5",
  KeyZ: "piece:wall", KeyX: "piece:floor", KeyC: "piece:ramp", KeyV: "piece:cone",
  F1: "piece:wall", F2: "piece:floor", F3: "piece:ramp", F4: "piece:cone",
};
const PIECE_KEYS: [PieceKind, string, string][] = [["wall", "Z", "LB"], ["floor", "X", "RB"], ["ramp", "C", "LB"], ["cone", "V", "RB"]];
const MATE_DOT = ["bg-hud", "bg-fn-yellow", "bg-shield", "bg-destructive"];

/** Loads the island (walkable heights + map picture) before the match starts. */
export function Game({ onExit }: { onExit: (r: MatchResult | null) => void }) {
  const [isl, setIsl] = useState<IslandData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    loadIsland().then((d) => { if (on) setIsl(d); }).catch(() => { if (on) setErr(true); });
    return () => { on = false; };
  }, []);
  if (!isl) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background font-display text-4xl tracking-wide text-hud">
        {err ? "COULDN'T LOAD THE ISLAND" : "LOADING THE ISLAND..."}
        {err && <button onClick={() => onExit(null)} className="bg-fn-yellow px-6 py-2 text-2xl text-fn-navy">BACK TO LOBBY</button>}
      </div>
    );
  }
  return <Match onExit={onExit} heights={isl.heights} />;
}

function Match({ onExit, heights }: { onExit: (r: MatchResult | null) => void; heights: Float32Array }) {
  const meta = useMeta();
  const mobile = meta.device === "mobile";
  const sim = useMemo(() => new Sim(meta.mode, meta.fill, Math.max(0, SKINS.findIndex((s) => s.id === meta.equipped)), meta.username, undefined, heights), []); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo<Input>(() => ({ keys: new Set(), dx: 0, dy: 0, fire: false, aim: false, events: [], mx: 0, my: 0 }), []);
  const pad = useMemo(() => new PadReader(), []);
  const paused = useRef(false);
  const padRef = useRef(false);
  const [padOn, setPadOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  const [, setTick] = useState(0);
  const last = useRef(0);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const scale = useUiScale();

  const onTick = useCallback(() => {
    const now = performance.now();
    if (now - last.current > 90) { last.current = now; setTick((t) => t + 1); drawMinimap(sim, mini.current ?? null); if (big.current) drawMinimap(sim, big.current); }
  }, [sim]);

  const beforeStep = useCallback((dt: number) => {
    const r = pad.poll(input, dt, sim.user.building);
    sim.pad = r.connected;
    if (r.ui.includes("map")) setBigMap((v) => !v);
    if (r.ui.includes("pause")) setMenuOpen((v) => !v);
    if (r.connected !== padRef.current) { padRef.current = r.connected; setPadOn(r.connected); }
    paused.current = mobile && !r.connected && !sim.over;
  }, [pad, input, sim, mobile]);

  const tryLock = useCallback(() => {
    if (mobile || document.pointerLockElement || !wrap.current) return;
    try { const p = wrap.current.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* needs a user gesture */ }
  }, [mobile]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== "Escape") tryLock();
      input.keys.add(e.code);
      if (e.code === "Space" || e.code === "Tab" || e.code.startsWith("F")) e.preventDefault();
      if (e.repeat) return;
      if (e.code === "KeyM") { setBigMap((v) => !v); return; }
      if (KEYMAP[e.code]) input.events.push(KEYMAP[e.code]);
    };
    const ku = (e: KeyboardEvent) => input.keys.delete(e.code);
    const mm = (e: MouseEvent) => { if (document.pointerLockElement) { input.dx += e.movementX; input.dy += e.movementY; } };
    const md = (e: MouseEvent) => {
      if (!document.pointerLockElement) { if ((e.target as HTMLElement)?.closest?.("button")) return; tryLock(); return; }
      if (e.button === 0) input.fire = true;
      if (e.button === 2) { if (sim.user.building) input.events.push("mat"); else input.aim = true; }
    };
    const mu = (e: MouseEvent) => { if (e.button === 0) input.fire = false; if (e.button === 2) input.aim = false; };
    const wh = (e: WheelEvent) => { if (document.pointerLockElement) input.events.push(e.deltaY > 0 ? "next" : "prev"); };
    const pl = () => setLocked(!!document.pointerLockElement);
    const cm = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm); window.addEventListener("mousedown", md); window.addEventListener("mouseup", mu);
    window.addEventListener("wheel", wh); window.addEventListener("contextmenu", cm);
    document.addEventListener("pointerlockchange", pl);
    tryLock();
    if (import.meta.env.DEV) (window as unknown as { __game: Sim }).__game = sim;
    return () => {
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      window.removeEventListener("mousemove", mm); window.removeEventListener("mousedown", md); window.removeEventListener("mouseup", mu);
      window.removeEventListener("wheel", wh); window.removeEventListener("contextmenu", cm);
      document.removeEventListener("pointerlockchange", pl);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [input, sim, tryLock]);

  useEffect(() => {
    if (sim.over && !result) {
      const t = setTimeout(() => {
        const r = useMeta.getState().addMatch({ place: sim.over!.place, win: sim.over!.win, kills: sim.user.kills, chests: sim.chestsOpened, seconds: sim.time, total: new Set(sim.players.map((p) => p.team)).size });
        setResult(r);
        if (document.pointerLockElement) document.exitPointerLock();
      }, 1800);
      return () => clearTimeout(t);
    }
    return undefined;
  });

  const u = sim.user;
  const viewP = (u.alive ? u : sim.players[sim.spectate]) ?? u;
  const s = sim.storm;
  const stormT = s.phase < 0 ? Math.max(0, 22 - sim.bus.t) + s.timer : s.timer;
  const stormLabel = s.phase < 0 ? (sim.bus.t < 22 ? "Battle Bus" : "Storm forming") : s.shrinking ? "Storm shrinking" : "Storm eye shrinks";
  const team = sim.players.filter((p) => p.team === u.team);
  const heal = viewP.healT > 0 && viewP.healKind ? 1 - viewP.healT / HEALS[viewP.healKind].time : 0;
  const reload = viewP.reloadT > 0 ? (() => { const it = viewP.slots[viewP.sel - 1]; return it && it.t === "gun" ? 1 - viewP.reloadT / GUNS[it.k].reload : 0; })() : 0;
  const heading = ((Math.atan2(Math.sin(viewP.yaw), -Math.cos(viewP.yaw)) * 180) / Math.PI + 360) % 360;
  const building = u.alive && u.building && u.phase === "ground";
  const usePad = padOn;
  const showPauseBar = !result && ((!mobile && !locked) || menuOpen);

  return (
    <div ref={wrap} data-game className="fixed inset-0 select-none overflow-hidden bg-background font-body">
      <Canvas shadows camera={{ fov: 70, near: 0.1, far: 3000 }} dpr={mobile ? [1, 1.25] : [1, 1.5]} gl={{ antialias: true }}>
        <GameScene sim={sim} input={input} onTick={onTick} beforeStep={beforeStep} paused={paused} low={mobile} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 transition-opacity" style={{ opacity: sim.dmgFlash * 2, boxShadow: "inset 0 0 160px 40px var(--destructive)" }} />

      <Scaled scale={scale} className="pointer-events-none">
        {/* crosshair */}
        {viewP.phase === "ground" && u.alive && (building
          ? <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hud" />
          : (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative h-8 w-8">
                <div className="absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 bg-hud shadow" />
                <div className="absolute bottom-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 bg-hud shadow" />
                <div className="absolute left-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-hud shadow" />
                <div className="absolute right-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-hud shadow" />
                {sim.hitMarker > 0 && <div className="absolute inset-0 rotate-45 scale-125"><div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-hud" /><div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-hud" /></div>}
              </div>
            </div>
          ))}

        {building && sim.preview && (
          <div className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-[150%] font-ui text-sm font-bold uppercase text-hud drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            <div className="mb-1 text-center text-base">HP <span className="text-blueprint">{MAT_HP[u.mat]}</span>{!sim.previewOk && u.mats[u.mat] < BUILD_COST && <span className="ml-2 text-destructive">Not enough {u.mat}</span>}</div>
            <div className="grid grid-cols-2 gap-x-10 gap-y-1">
              <Prompt k={usePad ? "▼" : "G"}>Edit</Prompt><Prompt k={usePad ? "RT" : "M1"}>Build</Prompt>
              <Prompt k={usePad ? "LT" : "R-Click"}>Material</Prompt><Prompt k={usePad ? "▲" : "R"}>Rotate</Prompt>
            </div>
          </div>
        )}

        <Compass heading={heading} />

        {/* squad */}
        <div className="absolute left-5 top-4 flex flex-col gap-2">
          {team.map((p, i) => (
            <div key={p.id} className={`flex items-start gap-2 ${p.alive ? "" : "opacity-50"}`}>
              <span className={`mt-1 h-3 w-3 rounded-full border border-overlay ${MATE_DOT[i % 4]}`} />
              <div>
                <div className="font-ui text-sm font-semibold leading-none text-hud drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{p.name}{!p.alive && " ✖"}</div>
                <div className="mt-1 h-2 w-44 bg-overlay/60"><div className="h-full bg-health" style={{ width: `${p.hp}%` }} /></div>
                <div className="mt-0.5 h-1 w-44 bg-overlay/60"><div className="h-full bg-shield" style={{ width: `${p.shield}%` }} /></div>
              </div>
            </div>
          ))}
        </div>

        {/* minimap + counters */}
        <div className="absolute right-5 top-4 flex w-[212px] flex-col items-stretch gap-1">
          <canvas ref={mini} width={212} height={212} className="border-2 border-hud/80 shadow-lg" />
          <div className="flex items-center justify-between bg-overlay/45 px-2 py-0.5 font-display text-xl text-hud">
            <span className="flex items-center gap-1"><StormIcon />{fmt(stormT)}</span>
            <span className="flex items-center gap-1"><PersonIcon />{sim.aliveCount()}</span>
            <span className="flex items-center gap-1"><SkullIcon />{u.kills}</span>
          </div>
          <div className="text-right font-ui text-xs uppercase tracking-wide text-hud drop-shadow">{stormLabel}</div>
        </div>

        {/* killfeed */}
        <div className="absolute left-5 top-1/3 flex flex-col gap-1">
          {sim.feed.map((f, i) => <div key={i} className={`px-2 py-0.5 font-ui text-sm font-semibold ${f.me ? "bg-gold/80 text-overlay" : "bg-overlay/50 text-hud"}`}>{f.text}</div>)}
        </div>

        {sim.prompt && <div className="absolute left-1/2 top-[64%] -translate-x-1/2 bg-overlay/60 px-4 py-2 font-display text-xl text-hud">{sim.prompt}</div>}
        {(heal > 0 || reload > 0) && (
          <div className="absolute left-1/2 top-[56%] w-40 -translate-x-1/2 text-center font-ui text-xs font-bold uppercase text-hud">
            {heal > 0 ? "Using " + HEALS[viewP.healKind!].name : "Reloading"}
            <div className="mt-1 h-1.5 bg-overlay/60"><div className="h-full bg-hud" style={{ width: `${(heal || reload) * 100}%` }} /></div>
          </div>
        )}
        {!u.alive && !sim.over && <div className="absolute left-1/2 top-24 -translate-x-1/2 bg-overlay/60 px-4 py-2 font-display text-2xl text-hud">Spectating {viewP.name}</div>}

        {/* vitals bottom-centre */}
        <div className="absolute bottom-6 left-1/2 w-[400px] -translate-x-1/2">
          <div className="mb-1 flex items-center justify-end gap-1.5 pr-6 font-display text-2xl text-hud drop-shadow"><MatIcon m={viewP.mat} size={26} />{viewP.mats[viewP.mat]}</div>
          <Vital icon={<ShieldIcon />} value={viewP.shield} cls="bg-shield" />
          <div className="h-1" />
          <Vital icon={<PlusIcon />} value={viewP.hp} cls="bg-health" />
        </div>

        {/* bottom-right: mats + quickbar */}
        <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
          <div className="flex gap-2 font-ui text-xs font-bold text-hud">
            <KeyHint k={usePad ? "View" : "M"} label="Map" /><KeyHint k={usePad ? "Start" : "Esc"} label="Menu" />
          </div>
          <div className="flex gap-1.5">
            {(["wood", "brick", "metal"] as Mat[]).map((m) => (
              <div key={m} className={`flex w-14 flex-col items-center border-2 bg-overlay/50 py-1 ${building && u.mat === m ? "border-blueprint" : "border-transparent"}`}>
                <MatIcon m={m} size={26} /><span className="font-display text-base leading-none text-hud">{viewP.mats[m]}</span>
              </div>
            ))}
          </div>
          {building ? (
            <div className="flex gap-1.5">
              {PIECE_KEYS.map(([k, key], i) => (
                <div key={k} className="flex flex-col items-center gap-0.5">
                  <span className="bg-hud px-1.5 font-ui text-[11px] font-bold leading-4 text-overlay">{usePad ? (i < 2 ? "◀" : "▶") : key}</span>
                  <div className={`flex h-16 w-16 items-center justify-center border-2 ${u.piece === k ? "-translate-y-1 border-hud bg-blueprint/70" : "border-blueprint/50 bg-blueprint/25"}`}
                    style={u.piece === k ? { boxShadow: "0 0 18px 2px var(--blueprint)" } : undefined}>
                    <PieceIcon k={k} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Slot active={viewP.sel === 0} keyLabel={usePad ? "Y" : "F"}><PickaxeIcon /></Slot>
              {viewP.slots.map((it, i) => (
                <Slot key={i} active={viewP.sel === i + 1} keyLabel={String(i + 1)}
                  color={it ? (it.t === "gun" ? RARITY_COLORS[it.r] : it.k === "mini" || it.k === "big" ? "#3a8ad8" : "#c84a4a") : undefined}
                  count={it ? (it.t === "gun" ? `${it.mag}/${GUNS[it.k].mag}` : `x${it.n}`) : ""}>
                  {it && <span className="font-display text-lg leading-none">{shortName(it)}</span>}
                </Slot>
              ))}
            </div>
          )}
          <div className="font-ui text-xs font-bold uppercase text-hud drop-shadow">
            {building ? <>Combat <span className="bg-hud px-1 text-overlay">{usePad ? "B" : "Q"}</span></> : <>Build <span className="bg-hud px-1 text-overlay">{usePad ? "B" : "Q"}</span></>}
          </div>
          {!building && viewP.sel > 0 && viewP.slots[viewP.sel - 1] && (
            <div className="font-display text-2xl uppercase drop-shadow" style={{ color: (() => { const it = viewP.slots[viewP.sel - 1]!; return it.t === "gun" ? RARITY_COLORS[it.r] : "var(--hud)"; })() }}>
              {itemName(viewP.slots[viewP.sel - 1]!)}
            </div>
          )}
        </div>

        {showPauseBar && (
          <div className="pointer-events-auto absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-4 bg-overlay/75 px-4 py-2 text-hud">
            <span className="font-ui text-sm uppercase">{mobile ? "Menu — press Start to close" : "Click or press any key to take control"}</span>
            <span className="hidden font-ui text-xs text-fn-text-dim xl:inline">WASD move · Space jump · E use · F pickaxe · 1–5 items · Q build · Z X C V pieces · R rotate · G edit · M map</span>
            <button className="bg-destructive px-3 py-1 font-display text-lg" onClick={() => onExit(null)}>LEAVE MATCH</button>
          </div>
        )}

        {bigMap && (
          <div className="absolute inset-0 flex items-center justify-center bg-overlay/50">
            <canvas ref={big} width={640} height={640} className="border-4 border-hud/80 shadow-2xl" />
          </div>
        )}
      </Scaled>

      {mobile && !padOn && !result && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-fn-navy/90 text-center text-hud">
          <GamepadIcon size={130} className="animate-pulse text-fn-text-dim" />
          <div className="font-display text-5xl tracking-wide">CONTROLLER REQUIRED</div>
          <div className="max-w-md font-ui text-lg text-fn-text-dim">The match is paused. Connect your controller and press any button to keep playing.</div>
          <button className="bg-destructive px-5 py-2 font-display text-xl" onClick={() => onExit(null)}>LEAVE MATCH</button>
        </div>
      )}

      {result && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-overlay/70 text-hud">
          <div className={`font-display text-8xl drop-shadow-lg ${result.win ? "text-gold" : "text-hud"}`}>#{result.place}</div>
          <div className="font-display text-5xl tracking-wide">{result.win ? "REWIND ROYALE!" : "ELIMINATED"}</div>
          <div className="mt-6 grid grid-cols-3 gap-6 text-center">
            <Stat k="Eliminations" v={result.kills} /><Stat k="XP Earned" v={result.xp} /><Stat k="Tiers" v={`+${result.tiersGained}`} />
          </div>
          {result.rbucksGained > 0 && <div className="mt-4 font-display text-2xl text-gold">+{result.rbucksGained} R Bucks</div>}
          <button className="mt-8 rounded-md bg-gold px-10 py-3 font-display text-3xl text-overlay shadow-lg hover:brightness-110" onClick={() => onExit(result)}>CONTINUE {padOn && "(A)"}</button>
        </div>
      )}
    </div>
  );
}

const CARD: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
function Compass({ heading }: { heading: number }) {
  const W = 440, SPAN = 140;
  const marks = [];
  for (let d = Math.floor((heading - SPAN / 2) / 5) * 5; d <= heading + SPAN / 2; d += 5) {
    const n = ((d % 360) + 360) % 360, x = ((d - heading) / SPAN + 0.5) * W;
    const card = CARD[n];
    marks.push(
      <div key={d} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: x }}>
        <div className={`w-px bg-hud ${card ? "h-3" : n % 15 === 0 ? "h-2.5" : "h-1.5 opacity-70"}`} />
        {card ? <span className={`font-display leading-none ${card.length === 1 ? "text-xl" : "text-base"} ${card === "N" ? "text-fn-yellow" : "text-hud"}`}>{card}</span>
          : n % 15 === 0 ? <span className="font-ui text-[10px] leading-none text-hud/80">{n}</span> : null}
      </div>,
    );
  }
  return (
    <div className="absolute left-1/2 top-2 -translate-x-1/2" style={{ width: W }}>
      <div className="relative h-9 overflow-hidden drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" style={{ maskImage: "linear-gradient(90deg, transparent, black 18%, black 82%, transparent)" }}>{marks}</div>
      <div className="mx-auto -mt-1 w-fit bg-overlay/50 px-1.5 font-ui text-xs font-bold text-hud">{Math.round(heading) % 360}°</div>
    </div>
  );
}
function Prompt({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 even:justify-start odd:justify-end">{children}<span className="min-w-6 bg-hud px-1 text-center text-[11px] leading-5 text-overlay">{k}</span></div>;
}
function KeyHint({ k, label }: { k: string; label: string }) {
  return <span className="flex items-center gap-1 bg-overlay/45 px-1.5 py-0.5 uppercase"><span className="bg-hud px-1 text-overlay">{k}</span>{label}</span>;
}
function Vital({ icon, value, cls }: { icon: React.ReactNode; value: number; cls: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-hud">{icon}</span>
      <div className="relative h-4 flex-1 bg-overlay/55">
        <div className={`h-full ${cls}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        <div className="absolute inset-0 flex items-center justify-between px-1.5 font-display text-sm leading-none text-hud drop-shadow"><span>{Math.ceil(value)}</span><span className="opacity-80">100</span></div>
      </div>
    </div>
  );
}
function Slot({ active, keyLabel, color, count, children }: { active: boolean; keyLabel: string; color?: string; count?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="bg-hud px-1.5 font-ui text-[11px] font-bold leading-4 text-overlay">{keyLabel}</span>
      <div className={`relative flex h-16 w-16 flex-col items-center justify-center border-2 text-hud ${active ? "-translate-y-1 border-hud" : "border-hud/25"}`}
        style={{ background: color ? `linear-gradient(160deg, ${color}, color-mix(in oklab, ${color} 40%, black))` : "color-mix(in oklab, black 45%, transparent)" }}>
        {children}
        {count && <span className="absolute bottom-0.5 font-ui text-[11px] font-bold">{count}</span>}
      </div>
    </div>
  );
}
function shortName(it: NonNullable<Sim["players"][0]["slots"][0]>) {
  if (it.t === "heal") return { bandage: "🩹", medkit: "💼", mini: "🧪", big: "🫙" }[it.k];
  return { ar: "M4", shotgun: "TAC", smg: "SMG", pistol: "REV" }[it.k];
}
function fmt(t: number) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; }
function Stat({ k, v }: { k: string; v: string | number }) { return <div><div className="font-display text-4xl">{v}</div><div className="text-sm uppercase opacity-80">{k}</div></div>; }

/* icons */
const ShieldIcon = () => <svg width="18" height="20" viewBox="0 0 18 20"><path d="M9 1l7 3v5c0 5-3 8.5-7 10C5 17.5 2 14 2 9V4z" fill="var(--shield)" stroke="var(--hud)" strokeWidth="1.5" /></svg>;
const PlusIcon = () => <svg width="18" height="18" viewBox="0 0 18 18"><path d="M6 1h6v5h5v6h-5v5H6v-5H1V6h5z" fill="var(--health)" stroke="var(--hud)" strokeWidth="1.5" /></svg>;
const StormIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="9" r="7" /><path d="M9 4v5l3 2" /></svg>;
const PersonIcon = () => <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor"><circle cx="8" cy="5" r="4" /><path d="M0 18c0-5 3.5-7 8-7s8 2 8 7z" /></svg>;
const SkullIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M9 1C4.6 1 2 4 2 7.5c0 2.2 1 3.7 2.5 4.5V15h9v-3c1.5-.8 2.5-2.3 2.5-4.5C16 4 13.4 1 9 1z" /><circle cx="6.2" cy="8" r="1.8" fill="var(--overlay)" /><circle cx="11.8" cy="8" r="1.8" fill="var(--overlay)" /><path d="M7 15v2M9 15v2M11 15v2" stroke="var(--overlay)" /></svg>;
const PickaxeIcon = () => <svg width="40" height="40" viewBox="0 0 40 40"><path d="M6 12C14 3 28 3 35 9c-8-2-15 0-21 6z" fill="var(--fn-steel)" stroke="var(--hud)" strokeWidth="1.5" /><path d="M19 13l3 3-15 18-3-3z" fill="var(--mat-wood)" stroke="var(--hud)" strokeWidth="1.2" /></svg>;
function MatIcon({ m, size = 22 }: { m: Mat; size?: number }) {
  if (m === "wood") return <svg width={size} height={size} viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="5" fill="var(--mat-wood)" stroke="var(--hud)" strokeWidth="1.2" /><circle cx="18" cy="12" r="3" fill="none" stroke="var(--hud)" strokeWidth="1" /></svg>;
  if (m === "brick") return <svg width={size} height={size} viewBox="0 0 24 24"><g fill="var(--mat-brick)" stroke="var(--hud)" strokeWidth="1"><rect x="2" y="4" width="9" height="5" /><rect x="12" y="4" width="10" height="5" /><rect x="2" y="10" width="13" height="5" /><rect x="16" y="10" width="6" height="5" /><rect x="2" y="16" width="9" height="5" /><rect x="12" y="16" width="10" height="5" /></g></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M3 6l9-3 9 3v12l-9 3-9-3z" fill="var(--mat-metal)" stroke="var(--hud)" strokeWidth="1.2" /><circle cx="7" cy="8" r="1" fill="var(--overlay)" /><circle cx="17" cy="8" r="1" fill="var(--overlay)" /><circle cx="7" cy="16" r="1" fill="var(--overlay)" /><circle cx="17" cy="16" r="1" fill="var(--overlay)" /></svg>;
}
function PieceIcon({ k }: { k: PieceKind }) {
  const p = { fill: "color-mix(in oklab, var(--blueprint) 55%, white)", stroke: "var(--hud)", strokeWidth: 2 };
  if (k === "wall") return <svg width="40" height="40" viewBox="0 0 40 40"><rect x="8" y="6" width="24" height="28" {...p} /></svg>;
  if (k === "floor") return <svg width="40" height="40" viewBox="0 0 40 40"><path d="M4 26l12-10h20l-12 10z" {...p} /></svg>;
  if (k === "ramp") return <svg width="40" height="40" viewBox="0 0 40 40"><path d="M4 32h30V8z" {...p} /></svg>;
  return <svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 6l16 24H4z" {...p} /></svg>;
}

function drawMinimap(sim: Sim, c: HTMLCanvasElement | null) {
  if (!c) return;
  const g = c.getContext("2d")!;
  const S = c.width, k = S / ART;
  g.imageSmoothingEnabled = true;
  const tx = (x: number) => (x + ART / 2) * k;
  g.drawImage(paintMap(sim), 0, 0, S, S);
  g.fillStyle = "#c9b28a"; for (const b of sim.boxes) g.fillRect(tx(b.minX), tx(b.minZ), Math.max(1, (b.maxX - b.minX) * k), Math.max(1, (b.maxZ - b.minZ) * k));
  g.font = `bold ${S > 300 ? 13 : 8}px sans-serif`; g.textAlign = "center"; g.lineWidth = 2.5; g.strokeStyle = "rgba(0,0,0,0.7)"; g.fillStyle = "#fff";
  for (const p of sim.pois) { g.strokeText(p.name.toUpperCase(), tx(p.x), tx(p.z) - 10); g.fillText(p.name.toUpperCase(), tx(p.x), tx(p.z) - 10); }
  const s = sim.storm;
  g.save(); g.fillStyle = "rgba(120,40,200,0.45)"; g.beginPath(); g.rect(0, 0, S, S); g.arc(tx(s.cx), tx(s.cz), Math.max(0, s.r) * k, 0, 7, true); g.fill(); g.restore();
  if (s.phase >= 0) { g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.arc(tx(s.nx), tx(s.nz), s.nr * k, 0, 7); g.stroke(); }
  if (sim.bus.active) {
    g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(tx(sim.bus.sx), tx(sim.bus.sz)); g.lineTo(tx(sim.bus.sx + sim.bus.dx * MAP * 2.3), tx(sim.bus.sz + sim.bus.dz * MAP * 2.3)); g.stroke(); g.setLineDash([]);
    g.save(); g.translate(tx(sim.bus.x), tx(sim.bus.z)); g.rotate(Math.atan2(sim.bus.dz, sim.bus.dx));
    g.fillStyle = "#2a63c9"; g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.fillRect(-7, -4, 14, 8); g.strokeRect(-7, -4, 14, 8);
    g.fillStyle = "#5aa8ff"; g.beginPath(); g.arc(0, -9, 5, 0, 7); g.fill(); g.stroke(); g.restore();
  }
  for (const p of sim.players) if (p.alive && p.team === sim.user.team && !p.isUser) { g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(tx(p.x), tx(p.z), 3, 0, 7); g.fill(); }
  const u = sim.user.alive ? sim.user : sim.players[sim.spectate];
  g.save(); g.translate(tx(u.x), tx(u.z)); g.rotate(-u.yaw + Math.PI);
  g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
}
