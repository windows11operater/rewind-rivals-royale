// @ts-nocheck -- strict index checks relaxed for game hot paths
// Pure game simulation: no React, no three.js.
import { makeNames, RARITY_NAMES, SKINS, type Rarity } from "./data";
import { sfx } from "./audio";
import { Terrain, SEA } from "./terrain";
export { SEA };

export const MAP = 240;
/** Only the four guns that have the user's 3D models. */
export type GunKind = "ar" | "shotgun" | "smg" | "pistol";
export const GUN_KINDS: GunKind[] = ["ar", "shotgun", "smg", "pistol"];
export type HealKind = "bandage" | "medkit" | "mini" | "big";
export type Item = { t: "gun"; k: GunKind; r: Rarity; mag: number } | { t: "heal"; k: HealKind; n: number };

export const GUNS: Record<GunKind, { name: string; dmg: number[]; rate: number; mag: number; reload: number; spread: number; pellets: number; range: number }> = {
  ar: { name: "M4 Assault Rifle", dmg: [30, 31, 33, 35, 36], rate: 5.5, mag: 30, reload: 2.3, spread: 0.03, pellets: 1, range: 160 },
  shotgun: { name: "Tactical Shotgun", dmg: [7, 7.5, 8, 8.5, 9], rate: 1.5, mag: 8, reload: 5.7, spread: 0.1, pellets: 10, range: 30 },
  smg: { name: "Tactical SMG", dmg: [17, 18, 19, 20, 21], rate: 10, mag: 25, reload: 2.2, spread: 0.05, pellets: 1, range: 70 },
  pistol: { name: "Revolver", dmg: [54, 57, 60, 63, 66], rate: 1.2, mag: 6, reload: 2.2, spread: 0.02, pellets: 1, range: 110 },
};
export const HEALS: Record<HealKind, { name: string; hp: number; sh: number; cap: number; time: number; max: number }> = {
  bandage: { name: "Bandages", hp: 15, sh: 0, cap: 75, time: 3.5, max: 15 },
  medkit: { name: "Med Kit", hp: 100, sh: 0, cap: 100, time: 10, max: 3 },
  mini: { name: "Small Shield", hp: 0, sh: 25, cap: 50, time: 2, max: 6 },
  big: { name: "Shield Potion", hp: 0, sh: 50, cap: 100, time: 5, max: 3 },
};

export function itemName(it: Item) {
  return it.t === "gun" ? GUNS[it.k].name : HEALS[it.k].name;
}

export type Mat = "wood" | "brick" | "metal";
export type PieceKind = "wall" | "floor" | "ramp" | "cone";
export const MATS: Mat[] = ["wood", "brick", "metal"];
export const PIECES: PieceKind[] = ["wall", "floor", "ramp", "cone"];
export const MAT_HP: Record<Mat, number> = { wood: 150, brick: 220, metal: 300 };
export const BUILD_COST = 10;
export const MAX_MATS = 999;
/** Grid cell size and storey height for building pieces. */
export const CELL = 4;
/** dir -> unit step on the grid: 0 = +z, 1 = +x, 2 = -z, 3 = -x */
export const STEP: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
export interface Build {
  id: number; kind: PieceKind; cx: number; cz: number; y0: number; dir: number; mat: Mat; hp: number; max: number; door: boolean; boxes: Box[];
  /** part of a map building (not player-built) */ world?: boolean; color?: string; win?: boolean; house?: number; stamp?: number;
  /** edited-out tiles: walls 3x3 (bit = row*3+col, row 0 at the bottom), floors 2x2 (bit = row*2+col) */ cut?: number;
}
export interface Road { x1: number; z1: number; x2: number; z2: number; w: number; walk: boolean }
export interface Car { x: number; z: number; alongZ: boolean; color: string; box?: Box; dead?: boolean }

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; h: number; color: string; kind: "wall" | "tower" | "build" | "car" | "clock"; hp?: number; id?: number; y0?: number; build?: Build }
/** Enterable map building made of world Build pieces. h = roof top (absolute), base = ground floor height. */
export interface House { id: number; x: number; z: number; w: number; d: number; base: number; h: number; storeys: number; color: string; roof: string | null; kind: "house" | "tower" | "clock" | "depot"; door: { x: number; z: number; nx: number; nz: number } }
export interface Chest { id: number; x: number; y: number; z: number; opened: boolean; rot: number }
export interface Loot { id: number; x: number; y: number; z: number; item: Item }
export interface Tree { x: number; z: number; s: number; k: number; hp: number; max: number; dead?: boolean }
export interface Rock { x: number; z: number; s: number; hp: number; max: number; dead?: boolean }
export interface WeakPoint { key: string; x: number; y: number; z: number; nx: number; nz: number; t: number }
export interface HarvestFx { x: number; y: number; z: number; mat: Mat; n: number; crit: boolean; t: number; poof?: boolean }
/** Pickaxe: damage per hit, double on the weak point. Swing length in seconds. */
export const PICK_DMG = 50, PICK_CRIT = 100, SWING = 0.5, PICK_CD = 0.55;
export function propHp(s: number, rock = false) { return Math.round(((rock ? 380 : 400) * s) / 50) * 50; }
export interface EditState { id: number; sel: number; hover: number; paint: number; wasBuilding: boolean }
export interface Poi { name: string; x: number; z: number; base: number; kind: "city" | "row" | "depot" }

export interface Player {
  id: number; name: string; team: number; isUser: boolean; skin: number;
  x: number; y: number; z: number; vy: number; yaw: number; pitch: number;
  hp: number; shield: number; alive: boolean;
  phase: "bus" | "sky" | "glide" | "ground";
  slots: (Item | null)[]; sel: number; cd: number; reloadT: number; healT: number; healKind: HealKind | null;
  mats: Record<Mat, number>; building: boolean; piece: PieceKind; mat: Mat; rot: number; gnd: boolean; buildCd: number; standOn: Build | null;
  kills: number; moving: number; walkT: number; swingT: number; fireT: number;
  /** sim time of the last shot (drives recoil + shotgun pump) */ shotAt: number;
  /** open edit grid on one of your pieces */ edit: EditState | null;
  firePrev: boolean; stepT: number; airT: number; lastHit: number;
  ai: { tx: number; tz: number; state: string; think: number; enemy: number; jumpAt: number; stuckT: number; lx: number; lz: number; detour: number; skill: number; strafe: number };
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Input { keys: Set<string>; dx: number; dy: number; fire: boolean; aim: boolean; events: string[]; mx: number; my: number }
export interface Tracer { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; t: number }

const STORM = [
  { wait: 50, shrink: 35, r: 150, dmg: 1 },
  { wait: 40, shrink: 30, r: 90, dmg: 2 },
  { wait: 30, shrink: 25, r: 50, dmg: 5 },
  { wait: 25, shrink: 22, r: 24, dmg: 8 },
  { wait: 20, shrink: 20, r: 8, dmg: 10 },
  { wait: 15, shrink: 20, r: 0, dmg: 10 },
];

/** The only three named locations on the island (spread apart, open grass between them). */
export const POIS: { name: string; x: number; z: number; kind: Poi["kind"] }[] = [
  { name: "Tilted Towers", x: -150, z: -40, kind: "city" },
  { name: "Retail Row", x: 125, z: -135, kind: "row" },
  { name: "Dusty Depot", x: 70, z: 115, kind: "depot" },
];
/** Wall tiles that make a door (bottom-middle + centre). */
export const DOOR_CUT = (1 << 1) | (1 << 4);
export const WALL_TILES = 9, FLOOR_TILES = 4;
const G = 26, JUMP_V = 8.6, RUN = 6.6, AIM_RUN = 4.2, STEP_UP = 0.7, PR = 0.42, PH = 1.9;
const EYE = 1.6;

export interface SimOpts {
  /** look speed (radians per input pixel) */ look: number; ads: number; buildMult: number; editMult: number;
  invertY: boolean; turbo: boolean; resetPiece: boolean; confirmOnRelease: boolean; editHold: boolean;
}
export const DEFAULT_OPTS: SimOpts = { look: 0.0024, ads: 0.65, buildMult: 1, editMult: 1, invertY: false, turbo: true, resetPiece: false, confirmOnRelease: false, editHold: false };

const gkey = (ix: number, iz: number) => (ix + 512) * 1024 + (iz + 512);
const cellOf = (v: number) => Math.floor(v / CELL) * CELL + CELL / 2;
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: { minX: number; maxX: number; minZ: number; maxZ: number; y0?: number; h: number }) {
  let t0 = 0, t1 = 1e9;
  const ax = [[ox, dx, b.minX, b.maxX], [oy, dy, b.y0 ?? -50, b.h], [oz, dz, b.minZ, b.maxZ]];
  for (const [o, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) { const t = a; a = c; c = t; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  return t0;
}
export interface Hit { t: number; kind: "none" | "ground" | "build" | "player" | "tree" | "rock" | "car"; ref: any; head?: boolean }

export class Sim {
  rnd: () => number;
  opts: SimOpts = { ...DEFAULT_OPTS };
  pois: Poi[] = [];
  houses: House[] = [];
  boxes: Box[] = [];
  builds: Build[] = [];
  bbCache: Box[] | null = null;
  roads: Road[] = [];
  lamps: { x: number; z: number; rot: number }[] = [];
  cars: Car[] = [];
  plazas: { x: number; z: number; w: number; d: number }[] = [];
  pitch: { x: number; z: number; w: number; d: number } | null = null;
  clock: { x: number; z: number; s: number; h: number } | null = null;
  preview: Build | null = null;
  previewOk = true;
  pad = false;
  trees: Tree[] = [];
  rocks: Rock[] = [];
  propVer = 0;
  weak: WeakPoint | null = null;
  critStreak = 0;
  harvestFx: HarvestFx[] = [];
  hpBar: { x: number; y: number; z: number; hp: number; max: number; t: number } | null = null;
  shake: { kind: "tree" | "rock"; i: number; t: number; dx: number; dz: number } | null = null;
  chests: Chest[] = [];
  loot: Loot[] = [];
  players: Player[] = [];
  tracers: Tracer[] = [];
  feed: { text: string; t: number; me: boolean }[] = [];
  terrain!: Terrain;
  grid = new Map<number, Build[]>();
  buildVer = 0;
  rayStamp = 0;
  nb1: Build[] = [];
  nb2: Build[] = [];
  time = 0;
  bus = { x: 0, z: 0, dx: 1, dz: 0, t: 0, active: true, sx: 0, sz: 0 };
  storm = { phase: -1, timer: 20, shrinking: false, cx: 0, cz: 0, r: 400, fx: 0, fz: 0, fr: 400, nx: 0, nz: 0, nr: 400, dmg: 1, tick: 0 };
  user!: Player;
  spectate = 0;
  cam = { x: 0, y: 50, z: 0, tx: 0, ty: 0, tz: 1, fov: 70 };
  over: null | { place: number; win: boolean } = null;
  hitMarker = 0;
  dmgFlash = 0;
  nextId = 1;
  chestsOpened = 0;
  mode: number;
  stepT = 0;
  humT = 0;
  stormSoundT = 0;
  prompt = "";

  constructor(mode: 1 | 2 | 4, fill: boolean, userSkin: number, userName: string, seed = Math.floor(Math.random() * 1e9), heights: Float32Array | null = null) {
    this.rnd = mulberry(seed);
    this.mode = mode;
    this.terrain = new Terrain(MAP, heights);
    this.genWorld();
    const total = mode === 4 ? 32 : 30;
    const names = makeNames(total, this.rnd);
    for (let i = 0; i < total; i++) {
      let team = Math.floor(i / mode);
      if (!fill && mode > 1 && i > 0 && i < mode) team = 1000 + i;
      const isUser = i === 0;
      const skin = isUser ? userSkin : Math.floor(this.rnd() * SKINS.length);
      this.players.push({
        id: i, name: isUser ? userName : names[i], team, isUser, skin,
        x: 0, y: 80, z: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, shield: 0, alive: true, phase: "bus",
        slots: [null, null, null, null, null], sel: 0, cd: 0, reloadT: 0, healT: 0, healKind: null,
        mats: { wood: 0, brick: 0, metal: 0 }, building: false, piece: "wall", mat: "wood", rot: 0, gnd: false, buildCd: 0, standOn: null,
        kills: 0, moving: 0, walkT: 0, swingT: 0, fireT: 0, shotAt: -9, edit: null, firePrev: false, stepT: 0, airT: 0, lastHit: -1,
        ai: { tx: 0, tz: 0, state: "drop", think: 0, enemy: -1, jumpAt: 2 + this.rnd() * 16, stuckT: 0, lx: 0, lz: 0, detour: 0, skill: 0.4 + this.rnd() * 0.6, strafe: 1 },
      });
    }
    this.user = this.players[0];
    const a = this.rnd() * Math.PI * 2;
    const off = (this.rnd() - 0.5) * 120;
    const dx = Math.cos(a), dz = Math.sin(a);
    this.bus.dx = dx; this.bus.dz = dz;
    this.bus.sx = -dx * MAP * 1.15 - dz * off;
    this.bus.sz = -dz * MAP * 1.15 + dx * off;
    this.bus.x = this.bus.sx; this.bus.z = this.bus.sz;
    this.user.yaw = Math.atan2(dx, dz);
    for (const p of this.players) if (!p.isUser) this.newTarget(p, true);
    sfx.horn();
  }

  // ---------- World ----------
  nearRoad(x: number, z: number, m: number) {
    for (const s of this.roads) {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2));
      const half = s.w / 2 + (s.walk ? 1.8 : 0);
      if (Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t)) < half + m) return true;
    }
    return false;
  }
  genWorld() {
    const r = this.rnd, T = this.terrain;
    const pick = <V>(a: V[]): V => a[Math.floor(r() * a.length)];
    this.pois = POIS.map((p) => ({ name: p.name, x: Math.round((p.x - 2) / CELL) * CELL + 2, z: Math.round((p.z - 2) / CELL) * CELL + 2, base: 0, kind: p.kind }));
    const PR_: Partial<Record<Poi["kind"], number>> = { city: 50, row: 42, depot: 34 };
    for (const poi of this.pois) {
      const rr = PR_[poi.kind] ?? 20;
      poi.base = Math.max(SEA + 1.2, T.avg(poi.x, poi.z, rr));
      T.flattenDisc(poi.x, poi.z, rr, poi.base, 26);
    }
    const road = (poi: Poi, pts: [number, number][], w = 6, walk = true) => {
      for (let i = 0; i < pts.length - 1; i++) this.roads.push({ x1: poi.x + pts[i][0], z1: poi.z + pts[i][1], x2: poi.x + pts[i + 1][0], z2: poi.z + pts[i + 1][1], w, walk });
    };
    const HOUSE = ["#f2efe6", "#a9cde0", "#f3d9a4", "#c8e0b0", "#e8c9b8", "#d9dee6"];
    const ROOF = ["#a8402e", "#4a5d74", "#6b4a36", "#3f6b45", "#8c2f2f"];
    const BRICK = ["#b5633f", "#9c5a3c", "#c7a27c", "#a9b3bd", "#c9b79a", "#8e9aa8", "#7d6a5a"];
    const SHOP = ["#d94a3a", "#3a7fd9", "#f2c94c", "#e8e2d4", "#5fae57", "#c76bd1"];
    const METAL = ["#aeb8c2", "#8f9aa6", "#b8a98e"];
    const CAR_COLORS = ["#d23b2f", "#2f6fd6", "#f2f2f2", "#2e9e5a", "#f0c23a", "#3a3d44"];
    const addCar = (x: number, z: number, alongZ: boolean) => {
      const hw = alongZ ? 1.05 : 2.2, hd = alongZ ? 2.2 : 1.05, y = T.ground(x, z);
      const box: Box = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y0: y, h: y + 1.5, color: "#888", kind: "car", hp: 800 };
      this.boxes.push(box);
      this.cars.push({ x, z, alongZ, color: pick(CAR_COLORS), box });
    };
    for (const poi of this.pois) {
      const B = poi.base, X = poi.x, Z = poi.z;
      if (poi.kind === "city") {
        // Tilted Towers: a 3x3 grid of blocks around a concrete plaza with the clock tower
        road(poi, [[-44, -14], [44, -14]], 7); road(poi, [[-44, 14], [44, 14]], 7);
        road(poi, [[-14, -44], [-14, 44]], 7); road(poi, [[14, -44], [14, 44]], 7);
        this.plazas.push({ x: X, z: Z, w: 20, d: 20 });
        this.addBuilding(X, Z, 2, 2, 4, { mat: "brick", color: "#c9b79a", roof: null, kind: "clock", face: [X, Z + 10], base: B, win: 0.3 });
        const ch = this.houses[this.houses.length - 1];
        if (ch) this.clock = { x: ch.x, z: ch.z, s: ch.w, h: ch.h };
        for (const [bx, bz] of [[-28, -28], [0, -28], [28, -28], [-28, 0], [28, 0], [-28, 28], [0, 28], [28, 28]] as const) {
          const big = r() < 0.5;
          if (big) this.addBuilding(X + bx, Z + bz, 3, 3, 3 + Math.floor(r() * 3), { mat: "brick", color: pick(BRICK), roof: null, kind: "tower", face: [X, Z], base: B, win: 0.65 });
          else for (const o of [-5, 5]) this.addBuilding(X + bx + o, Z + bz, 2, 2, 2 + Math.floor(r() * 3), { mat: "brick", color: pick(BRICK), roof: null, kind: "tower", face: [X, Z], base: B, win: 0.6 });
        }
        addCar(X - 30, Z - 12.3, false); addCar(X + 12.3, Z + 30, true); addCar(X + 2, Z + 15.7, false);
        this.addChest(X + 6, Z - 6, B);
      } else if (poi.kind === "row") {
        // Retail Row: a high street of shops facing each other, houses behind
        road(poi, [[-46, 0], [46, 0]], 7);
        for (const ox of [-30, -14, 2, 18, 34]) for (const sd of [-1, 1])
          this.addBuilding(X + ox, Z + sd * 12, 3, 2, 1 + Math.floor(r() * 2), { mat: "brick", color: pick(SHOP), roof: null, kind: "tower", face: [X + ox, Z], base: B, win: 0.6 });
        for (const ox of [-22, 22]) this.addBuilding(X + ox, Z + 30, 2, 2, 2, { mat: "wood", color: pick(HOUSE), roof: pick(ROOF), kind: "house", face: [X + ox, Z], base: B, win: 0.4 });
        addCar(X - 6, Z + 2, false); addCar(X + 24, Z - 2, false); addCar(X - 34, Z + 2, false);
      } else {
        // Dusty Depot: three metal warehouses on a yard
        road(poi, [[0, -40], [0, 40]], 6, false);
        for (const ox of [-16, 16]) this.addBuilding(X + ox, Z - 4, 3, 4, 2, { mat: "metal", color: pick(METAL), roof: null, kind: "depot", face: [X, Z - 4], base: B, win: 0.3 });
        this.addBuilding(X - 16, Z + 22, 3, 3, 2, { mat: "metal", color: pick(METAL), roof: null, kind: "depot", face: [X, Z + 22], base: B, win: 0.3 });
        this.addChest(X + 6, Z + 20, B); this.addChest(X - 5, Z - 26, B);
        addCar(X + 3.2, Z + 8, true);
      }
    }
    const nearHouse = (x: number, z: number, m: number) => this.houses.some((h) => Math.abs(h.x - x) < h.w / 2 + m && Math.abs(h.z - z) < h.d / 2 + m) || this.boxes.some((b) => x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m);
    const inPlaza = (x: number, z: number) => this.plazas.some((p) => Math.abs(p.x - x) < p.w / 2 + 3 && Math.abs(p.z - z) < p.d / 2 + 3);
    const inTown = (x: number, z: number, m: number) => this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < (PR_[p.kind] ?? 20) - 6 + m);
    const blocked = (x: number, z: number, m: number) => T.raw(x, z) < SEA + 0.6 || nearHouse(x, z, m) || this.nearRoad(x, z, m) || inPlaza(x, z) || inTown(x, z, m);
    // classic island grassland: scattered trees + rocks between the towns
    let tries = 0;
    while (this.trees.length < 230 && tries++ < 6000) {
      const x = (r() - 0.5) * MAP * 2, z = (r() - 0.5) * MAP * 2;
      if (Math.abs(x) > MAP - 5 || Math.abs(z) > MAP - 5 || blocked(x, z, 3)) continue;
      const ts = 0.8 + r() * 0.7, hp = propHp(ts);
      this.trees.push({ x, z, s: ts, k: r() < 0.35 ? 1 : 0, hp, max: hp });
    }
    for (let i = 0; i < 160 && this.rocks.length < 70; i++) {
      const x = (r() - 0.5) * MAP * 2, z = (r() - 0.5) * MAP * 2;
      if (blocked(x, z, 2)) continue;
      const rs = 0.6 + r() * 1.4, hp = propHp(rs, true);
      this.rocks.push({ x, z, s: rs, hp, max: hp });
    }
    for (const s of this.roads) {
      if (!s.walk) continue;
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, len = Math.hypot(dx, dz);
      const nx = -dz / len, nz = dx / len;
      let side = 1;
      for (let d = 6; d < len - 3; d += 20) {
        side = -side;
        const off = s.w / 2 + 1.4;
        const x = s.x1 + (dx * d) / len + nx * off * side, z = s.z1 + (dz * d) / len + nz * off * side;
        if (nearHouse(x, z, 1) || this.lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 9)) continue;
        this.lamps.push({ x, z, rot: Math.atan2(-nx * side, -nz * side) });
      }
    }
  }

  /** Enterable building of world pieces: walls, door, windows, floors, stairs, flat roof. */
  addBuilding(x: number, z: number, nx: number, nz: number, storeys: number, o: { mat: Mat; color: string; roof: string | null; kind: House["kind"]; face?: [number, number]; base?: number; win?: number }) {
    const cx0 = Math.round((x - (nx - 1) * 2 - 2) / CELL) * CELL + 2, cz0 = Math.round((z - (nz - 1) * 2 - 2) / CELL) * CELL + 2;
    const w = nx * CELL, d = nz * CELL, hx = cx0 - 2 + w / 2, hz = cz0 - 2 + d / 2;
    if (this.houses.some((h) => Math.abs(h.x - hx) < (h.w + w) / 2 + 2 && Math.abs(h.z - hz) < (h.d + d) / 2 + 2)) return false;
    for (let px = -w / 2; px <= w / 2; px += 2) for (let pz = -d / 2; pz <= d / 2; pz += 2) if (this.nearRoad(hx + px, hz + pz, 0.3)) return false;
    const base = o.base ?? Math.max(SEA + 1.2, this.terrain.avg(hx, hz, Math.max(w, d) / 2));
    this.terrain.flattenRect(hx, hz, w / 2 + 1, d / 2 + 1, base, 4);
    const id = this.houses.length, r = this.rnd;
    const [fx, fz] = o.face ?? [hx, hz + 10];
    const ddx = fx - hx, ddz = fz - hz;
    const side = Math.abs(ddx) > Math.abs(ddz) ? (ddx > 0 ? 1 : 3) : (ddz > 0 ? 0 : 2);
    const mk = (kind: PieceKind, cx: number, cz: number, y0: number, dir: number, color: string, cut = 0) => {
      const hp = MAT_HP[o.mat] * 2;
      const b: Build = { id: this.nextId++, kind, cx, cz, y0, dir, mat: o.mat, hp, max: hp, door: (cut & DOOR_CUT) === DOOR_CUT, boxes: [], world: true, color, house: id, cut };
      this.makeBoxes(b); this.builds.push(b); this.gridAdd(b);
      return b;
    };
    const stairI = side === 3 ? nx - 1 : 0, stairJ = side === 2 ? nz - 1 : 0;
    const doorI = Math.floor(nx / 2), doorJ = Math.floor(nz / 2);
    let doorPos = { x: hx, z: hz, nx: 0, nz: 1 };
    for (let s = 0; s < storeys; s++) {
      const y0 = base + s * CELL;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const cx = cx0 + i * CELL, cz = cz0 + j * CELL;
        if (!(s > 0 && i === stairI && j === stairJ)) mk("floor", cx, cz, y0, 0, "#c9b48a");
      }
      const win = () => (r() < (o.win ?? 0.4) ? 1 << 4 : 0);
      for (let i = 0; i < nx; i++) {
        const cx = cx0 + i * CELL;
        const dS = s === 0 && side === 2 && i === doorI, dN = s === 0 && side === 0 && i === doorI;
        mk("wall", cx, cz0 - CELL, y0, 0, o.color, dS ? DOOR_CUT : win());
        mk("wall", cx, cz0 + (nz - 1) * CELL, y0, 0, o.color, dN ? DOOR_CUT : win());
        if (dS) doorPos = { x: cx, z: cz0 - 2, nx: 0, nz: -1 };
        if (dN) doorPos = { x: cx, z: cz0 + (nz - 1) * CELL + 2, nx: 0, nz: 1 };
      }
      for (let j = 0; j < nz; j++) {
        const cz = cz0 + j * CELL;
        const dW = s === 0 && side === 3 && j === doorJ, dE = s === 0 && side === 1 && j === doorJ;
        mk("wall", cx0 - CELL, cz, y0, 1, o.color, dW ? DOOR_CUT : win());
        mk("wall", cx0 + (nx - 1) * CELL, cz, y0, 1, o.color, dE ? DOOR_CUT : win());
        if (dW) doorPos = { x: cx0 - 2, z: cz, nx: -1, nz: 0 };
        if (dE) doorPos = { x: cx0 + (nx - 1) * CELL + 2, z: cz, nx: 1, nz: 0 };
      }
      if (s < storeys - 1) {
        // stairs to the next storey, zig-zagging in one corner cell
        const along = nz >= 2 ? (s % 2 === 0 ? (stairJ === 0 ? 0 : 2) : (stairJ === 0 ? 2 : 0)) : (s % 2 === 0 ? 1 : 3);
        mk("ramp", cx0 + stairI * CELL, cz0 + stairJ * CELL, y0, along, "#b89a6a");
      }
    }
    const top = base + storeys * CELL;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) mk("floor", cx0 + i * CELL, cz0 + j * CELL, top, 0, o.roof ?? "#6d6f73");
    this.houses.push({ id, x: hx, z: hz, w, d, base, h: top + 0.2, storeys, color: o.color, roof: o.roof, kind: o.kind, door: doorPos });
    // loot inside
    const spot = () => {
      for (let k = 0; k < 6; k++) {
        const i = Math.floor(r() * nx), j = Math.floor(r() * nz);
        if (i === stairI && j === stairJ) continue;
        return [cx0 + i * CELL + (r() - 0.5) * 1.5, cz0 + j * CELL + (r() - 0.5) * 1.5, base + Math.floor(r() * storeys) * CELL + 0.2] as const;
      }
      return [hx + 1, hz + 1, base + 0.2] as const;
    };
    if (r() < 0.6) { const [a, b, y] = spot(); this.addChest(a, b, y); }
    const nl = 1 + Math.floor(r() * 2);
    for (let k = 0; k < nl; k++) { const [a, b, y] = spot(); this.addLoot(a, b, this.randItem(), y); }
    return true;
  }
  addChest(x: number, z: number, y?: number) {
    this.chests.push({ id: this.nextId++, x, y: y ?? this.terrain.ground(x, z), z, opened: false, rot: Math.floor(this.rnd() * 4) * (Math.PI / 2) });
  }
  addLoot(x: number, z: number, item: Item, y?: number) {
    this.loot.push({ id: this.nextId++, x, y: y ?? this.terrain.ground(x, z), z, item });
  }
  randRarity(min = 0): Rarity {
    const v = this.rnd();
    const r = v < 0.38 ? 0 : v < 0.68 ? 1 : v < 0.88 ? 2 : v < 0.97 ? 3 : 4;
    return Math.max(min, r) as Rarity;
  }
  randGun(min = 0): Item {
    const k = GUN_KINDS[Math.floor(this.rnd() * GUN_KINDS.length)];
    return { t: "gun", k, r: this.randRarity(min), mag: GUNS[k].mag };
  }
  randItem(): Item {
    if (this.rnd() < 0.62) return this.randGun();
    const ks: HealKind[] = ["bandage", "bandage", "medkit", "mini", "mini", "big"];
    const k = ks[Math.floor(this.rnd() * ks.length)];
    return { t: "heal", k, n: k === "bandage" ? 5 : k === "mini" ? 3 : 1 };
  }

  // ---------- Build grid ----------
  gridAdd(b: Build) {
    const k = gkey(Math.floor(b.cx / CELL), Math.floor(b.cz / CELL));
    let a = this.grid.get(k);
    if (!a) { a = []; this.grid.set(k, a); }
    a.push(b);
  }
  gridRemove(b: Build) {
    const a = this.grid.get(gkey(Math.floor(b.cx / CELL), Math.floor(b.cz / CELL)));
    if (a) { const i = a.indexOf(b); if (i >= 0) a.splice(i, 1); }
  }
  /** builds in the 3x3 cells around (x, z) */
  near(x: number, z: number, out: Build[]) {
    out.length = 0;
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.grid.get(gkey(ix + i, iz + j)); if (a) for (const b of a) out.push(b); }
    return out;
  }
  /** collision boxes for a piece, leaving gaps for edited-out tiles */
  makeBoxes(b: Build) {
    b.boxes = [];
    const cut = b.cut ?? 0, T = CELL / 3;
    if (b.kind === "wall") {
      const span = (u0: number, u1: number, y0: number, y1: number) => {
        const box: Box = b.dir === 0
          ? { minX: b.cx - 2 + u0, maxX: b.cx - 2 + u1, minZ: b.cz + 2 - 0.12, maxZ: b.cz + 2 + 0.12, y0, h: y1, color: "", kind: "build", build: b }
          : { minX: b.cx + 2 - 0.12, maxX: b.cx + 2 + 0.12, minZ: b.cz - 2 + u0, maxZ: b.cz - 2 + u1, y0, h: y1, color: "", kind: "build", build: b };
        b.boxes.push(box);
      };
      if (!cut) { span(0, CELL, b.y0, b.y0 + CELL); return; }
      for (let c = 0; c < 3; c++) {
        let start = -1;
        for (let row = 0; row <= 3; row++) {
          const solid = row < 3 && !(cut & (1 << (row * 3 + c)));
          if (solid && start < 0) start = row;
          if (!solid && start >= 0) { span(c * T, (c + 1) * T, b.y0 + start * T, b.y0 + row * T); start = -1; }
        }
      }
    } else if (b.kind === "floor") {
      if (!cut) { b.boxes.push({ minX: b.cx - 2, maxX: b.cx + 2, minZ: b.cz - 2, maxZ: b.cz + 2, y0: b.y0 - 0.1, h: b.y0 + 0.2, color: "", kind: "build", build: b }); return; }
      for (let row = 0; row < 2; row++) for (let c = 0; c < 2; c++) if (!(cut & (1 << (row * 2 + c))))
        b.boxes.push({ minX: b.cx - 2 + c * 2, maxX: b.cx + c * 2, minZ: b.cz - 2 + row * 2, maxZ: b.cz + row * 2, y0: b.y0 - 0.1, h: b.y0 + 0.2, color: "", kind: "build", build: b });
    }
  }
  /** walkable height of a piece at (x, z), or -Infinity */
  supportY(b: Build, x: number, z: number) {
    const lx = x - b.cx, lz = z - b.cz;
    if (b.kind === "wall") return -Infinity;
    if (Math.abs(lx) > 2.05 || Math.abs(lz) > 2.05) return -Infinity;
    if (b.kind === "floor") {
      const cut = b.cut ?? 0;
      if (cut && cut & (1 << ((lz < 0 ? 0 : 1) * 2 + (lx < 0 ? 0 : 1)))) return -Infinity;
      return b.y0 + 0.2;
    }
    if (b.kind === "ramp") {
      const t = b.dir === 0 ? (lz + 2) / 4 : b.dir === 1 ? (lx + 2) / 4 : b.dir === 2 ? (2 - lz) / 4 : (2 - lx) / 4;
      return b.y0 + Math.max(0, Math.min(1, t)) * CELL + 0.1;
    }
    return b.y0 + 2 * (1 - Math.max(Math.abs(lx), Math.abs(lz)) / 2);
  }
  removeBuild(b: Build) {
    const i = this.builds.indexOf(b);
    if (i >= 0) this.builds.splice(i, 1);
    this.gridRemove(b);
    for (const p of this.players) { if (p.standOn === b) p.standOn = null; if (p.edit?.id === b.id) p.edit = null; }
    this.buildVer++;
  }
  damageBuild(b: Build, dmg: number) {
    b.hp -= dmg; this.buildVer++;
    if (b.hp <= 0) { this.removeBuild(b); return true; }
    return false;
  }

  // ---------- Physics ----------
  physics(p: Player, dt: number) {
    const prevY = p.y;
    p.vy -= G * dt;
    if (p.phase === "glide") p.vy = Math.max(p.vy, -6);
    if (p.phase === "sky") p.vy = Math.max(p.vy, -36);
    p.y += p.vy * dt;
    const nb = this.near(p.x, p.z, this.nb1);
    // walls / cars push the player out sideways
    const pushBox = (q: Box) => {
      const y0 = q.y0 ?? -50;
      if (!(p.y + PH > y0 && p.y + 0.45 < q.h)) return;
      const nx = Math.max(q.minX, Math.min(p.x, q.maxX)), nz = Math.max(q.minZ, Math.min(p.z, q.maxZ));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= PR * PR) return;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (PR - d) / d; p.x += dx * k; p.z += dz * k; }
      else {
        const l = p.x - q.minX + PR, rr = q.maxX - p.x + PR, f = p.z - q.minZ + PR, bk = q.maxZ - p.z + PR, m = Math.min(l, rr, f, bk);
        if (m === l) p.x = q.minX - PR; else if (m === rr) p.x = q.maxX + PR; else if (m === f) p.z = q.minZ - PR; else p.z = q.maxZ + PR;
      }
    };
    for (const b of nb) for (const q of b.boxes) if (b.kind === "wall") pushBox(q);
    for (const q of this.boxes) if (Math.abs(q.minX - p.x) < 8 && Math.abs(q.minZ - p.z) < 8) pushBox(q);
    // ceiling
    if (p.vy > 0) for (const b of nb) if (b.kind === "floor" && b.y0 > prevY + 1.2 && b.y0 - 0.1 < p.y + PH && this.supportY(b, p.x, p.z) > -Infinity) { p.y = b.y0 - 0.1 - PH; p.vy = 0; }
    // ground: terrain, pieces, car roofs
    let best = this.terrain.ground(p.x, p.z), on: Build | null = null;
    for (const b of nb) {
      const s = this.supportY(b, p.x, p.z);
      if (s > best && s <= prevY + STEP_UP) { best = s; on = b; }
    }
    for (const q of this.boxes) if (p.x > q.minX && p.x < q.maxX && p.z > q.minZ && p.z < q.maxZ && q.h > best && q.h <= prevY + STEP_UP) { best = q.h; on = null; }
    if (p.vy <= 0 && (p.y <= best || (p.gnd && p.y - best < 0.4))) {
      p.y = best; p.vy = 0; p.gnd = true; p.standOn = on;
    } else { p.gnd = false; p.standOn = null; }
  }

  // ---------- Rays ----------
  /** First thing a ray hits: map/player pieces, players, trees, rocks, cars, ground. */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, self: Player | null, what = { players: true, props: true, ground: true }): Hit {
    let best: Hit = { t: maxT, kind: "none", ref: null };
    const stamp = ++this.rayStamp;
    for (let s = 0; s <= maxT + CELL; s += CELL) {
      const sx = ox + dx * Math.min(s, maxT), sz = oz + dz * Math.min(s, maxT);
      if (s > best.t + CELL * 2) break;
      for (const b of this.near(sx, sz, this.nb2)) {
        if (b.stamp === stamp) continue;
        b.stamp = stamp;
        if (b.kind === "ramp" || b.kind === "cone") {
          // sloped pieces: march along the box and test against the surface
          const t0 = rayBox(ox, oy, oz, dx, dy, dz, { minX: b.cx - 2, maxX: b.cx + 2, minZ: b.cz - 2, maxZ: b.cz + 2, y0: b.y0, h: b.y0 + (b.kind === "ramp" ? 4 : 2) });
          if (t0 < 0 || t0 >= best.t) continue;
          for (let t = t0; t < t0 + 6 && t < best.t; t += 0.15) {
            const y = oy + dy * t, sY = this.supportY(b, ox + dx * t, oz + dz * t);
            if (sY > -Infinity && y <= sY + 0.1 && y >= sY - 0.4) { best = { t, kind: "build", ref: b }; break; }
          }
          continue;
        }
        for (const q of b.boxes) { const t = rayBox(ox, oy, oz, dx, dy, dz, q); if (t >= 0 && t < best.t) best = { t, kind: "build", ref: b }; }
      }
    }
    if (what.players) for (const p of this.players) {
      if (p === self || !p.alive || p.phase === "bus") continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, { minX: p.x - 0.45, maxX: p.x + 0.45, minZ: p.z - 0.45, maxZ: p.z + 0.45, y0: p.y, h: p.y + PH });
      if (t >= 0 && t < best.t) best = { t, kind: "player", ref: p, head: oy + dy * t > p.y + 1.5 };
    }
    if (what.props) {
      this.trees.forEach((tr, i) => {
        if (tr.dead || Math.abs(tr.x - ox) > maxT + 4 || Math.abs(tr.z - oz) > maxT + 4) return;
        const gy = this.terrain.ground(tr.x, tr.z), rr = 0.55 * tr.s;
        const t = rayBox(ox, oy, oz, dx, dy, dz, { minX: tr.x - rr, maxX: tr.x + rr, minZ: tr.z - rr, maxZ: tr.z + rr, y0: gy, h: gy + 5.5 * tr.s });
        if (t >= 0 && t < best.t) best = { t, kind: "tree", ref: i };
      });
      this.rocks.forEach((rk, i) => {
        if (rk.dead || Math.abs(rk.x - ox) > maxT + 4 || Math.abs(rk.z - oz) > maxT + 4) return;
        const gy = this.terrain.ground(rk.x, rk.z), rr = 1.1 * rk.s;
        const t = rayBox(ox, oy, oz, dx, dy, dz, { minX: rk.x - rr, maxX: rk.x + rr, minZ: rk.z - rr, maxZ: rk.z + rr, y0: gy - 0.5, h: gy + 1.3 * rk.s });
        if (t >= 0 && t < best.t) best = { t, kind: "rock", ref: i };
      });
      this.cars.forEach((c, i) => {
        if (c.dead || !c.box) return;
        const t = rayBox(ox, oy, oz, dx, dy, dz, c.box);
        if (t >= 0 && t < best.t) best = { t, kind: "car", ref: i };
      });
    }
    if (what.ground) { const t = this.terrain.ray(ox, oy, oz, dx, dy, dz, best.t); if (t >= 0 && t < best.t) best = { t, kind: "ground", ref: null }; }
    return best;
  }
  /** camera ray through the crosshair */
  camRay() {
    const c = this.cam;
    let dx = c.tx - c.x, dy = c.ty - c.y, dz = c.tz - c.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    return { ox: c.x, oy: c.y, oz: c.z, dx: dx / l, dy: dy / l, dz: dz / l };
  }

  // ---------- Building ----------
  facing(p: Player) { return ((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4; }
  levelOf(p: Player) {
    const s = p.standOn;
    if (s) return s.y0 + Math.floor((p.y - s.y0 + 0.6) / CELL) * CELL;
    return p.y;
  }
  planPiece(p: Player, kind: PieceKind): Build | null {
    if (p.phase !== "ground") return null;
    const d = this.facing(p), [sx, sz] = STEP[d];
    const cx = cellOf(p.x), cz = cellOf(p.z);
    let y0 = this.levelOf(p);
    const up = p.pitch > 0.55, down = p.pitch < -0.75;
    let b: Build;
    const base = (k: PieceKind, x: number, z: number, y: number, dir: number): Build => ({ id: 0, kind: k, cx: x, cz: z, y0: y, dir, mat: p.mat, hp: MAT_HP[p.mat], max: MAT_HP[p.mat], door: false, boxes: [], cut: 0 });
    if (kind === "wall") {
      if (up) y0 += CELL;
      if (d === 0) b = base("wall", cx, cz, y0, 0);
      else if (d === 1) b = base("wall", cx, cz, y0, 1);
      else if (d === 2) b = base("wall", cx, cz - CELL, y0, 0);
      else b = base("wall", cx - CELL, cz, y0, 1);
    } else if (kind === "floor") {
      b = down ? base("floor", cx, cz, y0, 0) : base("floor", cx + sx * CELL, cz + sz * CELL, y0 + (up ? CELL : 0), 0);
    } else if (kind === "ramp") {
      b = base("ramp", cx + sx * CELL, cz + sz * CELL, y0 + (up ? CELL : 0), (d + p.rot) % 4);
    } else {
      b = base("cone", cx + sx * CELL, cz + sz * CELL, y0 + CELL, 0);
    }
    return b;
  }
  occupied(b: Build) {
    for (const o of this.near(b.cx, b.cz, this.nb2)) if (o.kind === b.kind && o.cx === b.cx && o.cz === b.cz && Math.abs(o.y0 - b.y0) < 1 && (b.kind !== "wall" || o.dir === b.dir)) return true;
    return false;
  }
  place(p: Player, b: Build | null) {
    if (!b || p.mats[b.mat] < BUILD_COST || this.occupied(b)) return false;
    p.mats[b.mat] -= BUILD_COST;
    const nb: Build = { ...b, id: this.nextId++, boxes: [], cut: 0 };
    this.makeBoxes(nb);
    this.builds.push(nb); this.gridAdd(nb); this.buildVer++;
    if (p.isUser) sfx.build();
    return true;
  }
  /** Quick toggle: open / close a door in your wall ahead. */
  editAhead(p: Player) {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const h = this.ray(p.x, p.y + 1.2, p.z, fx, 0, fz, 5, p, { players: false, props: false, ground: false });
    const b = h.kind === "build" ? (h.ref as Build) : null;
    if (!b || b.kind !== "wall") return false;
    b.cut = b.door ? 0 : DOOR_CUT; b.door = !b.door;
    this.makeBoxes(b); this.buildVer++;
    return true;
  }
  /** piece under the crosshair that you can edit (your own walls + floors) */
  editTarget(p: Player): Build | null {
    const r = this.camRay();
    const h = this.ray(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 14, p, { players: false, props: false, ground: false });
    if (h.kind !== "build") return null;
    const b = h.ref as Build;
    if (b.world || (b.kind !== "wall" && b.kind !== "floor")) return null;
    if (Math.hypot(b.cx - p.x, b.cz - p.z) > 9) return null;
    return b;
  }
  /** tile index under the crosshair on a piece being edited, or -1 */
  hoverTile(b: Build) {
    const r = this.camRay();
    let t: number;
    if (b.kind === "wall") {
      const plane = b.dir === 0 ? b.cz + 2 : b.cx + 2, o = b.dir === 0 ? r.oz : r.ox, d = b.dir === 0 ? r.dz : r.dx;
      if (Math.abs(d) < 1e-6) return -1;
      t = (plane - o) / d;
      if (t < 0) return -1;
      const u = (b.dir === 0 ? r.ox + r.dx * t - b.cx : r.oz + r.dz * t - b.cz) + 2, v = r.oy + r.dy * t - b.y0;
      if (u < -0.6 || u > 4.6 || v < -0.6 || v > 4.6) return -1;
      const c = Math.max(0, Math.min(2, Math.floor(u / (CELL / 3)))), row = Math.max(0, Math.min(2, Math.floor(v / (CELL / 3))));
      return row * 3 + c;
    }
    if (Math.abs(r.dy) < 1e-6) return -1;
    t = (b.y0 + 0.2 - r.oy) / r.dy;
    if (t < 0) return -1;
    const lx = r.ox + r.dx * t - b.cx, lz = r.oz + r.dz * t - b.cz;
    if (Math.abs(lx) > 2.6 || Math.abs(lz) > 2.6) return -1;
    return (lz < 0 ? 0 : 1) * 2 + (lx < 0 ? 0 : 1);
  }
  startEdit(p: Player) {
    const b = this.editTarget(p);
    if (!b) return false;
    p.edit = { id: b.id, sel: b.cut ?? 0, hover: -1, paint: -1, wasBuilding: p.building };
    p.building = false;
    sfx.click();
    return true;
  }
  confirmEdit(p: Player) {
    const e = p.edit;
    if (!e) return;
    p.edit = null; p.building = e.wasBuilding;
    const b = this.builds.find((x) => x.id === e.id);
    if (!b) return;
    const all = b.kind === "wall" ? (1 << WALL_TILES) - 1 : (1 << FLOOR_TILES) - 1;
    if (e.sel === all) return; // can't edit away a whole piece
    if ((b.cut ?? 0) === e.sel) return;
    b.cut = e.sel; b.door = b.kind === "wall" && (e.sel & DOOR_CUT) === DOOR_CUT;
    this.makeBoxes(b); this.buildVer++;
    sfx.build();
  }
  editBuild(p: Player) { return p.edit ? this.builds.find((x) => x.id === p.edit!.id) ?? null : null; }

  // ---------- Items ----------
  gun(p: Player) { const it = p.slots[p.sel - 1]; return it && it.t === "gun" ? it : null; }
  give(p: Player, item: Item): boolean {
    if (item.t === "heal") {
      const same = p.slots.find((s) => s && s.t === "heal" && s.k === item.k) as any;
      if (same) { if (same.n >= HEALS[item.k].max) return false; same.n = Math.min(HEALS[item.k].max, same.n + item.n); return true; }
    }
    const free = p.slots.findIndex((s) => !s);
    if (free >= 0) { p.slots[free] = { ...item }; if (p.isUser && p.sel === 0 && item.t === "gun") p.sel = free + 1; return true; }
    if (p.sel > 0) {
      const old = p.slots[p.sel - 1]!;
      this.addLoot(p.x + Math.sin(p.yaw) * 0.8, p.z + Math.cos(p.yaw) * 0.8, old, p.y);
      p.slots[p.sel - 1] = { ...item };
      return true;
    }
    return false;
  }
  openChest(p: Player, c: Chest) {
    c.opened = true;
    this.addLoot(c.x + 0.8, c.z, this.randGun(1), c.y);
    this.addLoot(c.x - 0.8, c.z, this.randItem(), c.y);
    const m = MATS[Math.floor(this.rnd() * 3)];
    p.mats[m] = Math.min(MAX_MATS, p.mats[m] + 30);
    if (p.isUser) { this.chestsOpened++; sfx.chestOpen(); }
  }
  interact(p: Player) {
    let bl: Loot | null = null, bd = 2.3;
    for (const l of this.loot) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd && Math.abs(l.y - p.y) < 2) { bd = d; bl = l; } }
    let bc: Chest | null = null, cd = 2.6;
    for (const c of this.chests) { if (c.opened) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < cd && Math.abs(c.y - p.y) < 2) { cd = d; bc = c; } }
    if (bc && (!bl || cd < bd)) { this.openChest(p, bc); return; }
    if (bl && this.give(p, bl.item)) { this.loot.splice(this.loot.indexOf(bl), 1); if (p.isUser) sfx.pickup(); }
  }
  updatePrompt() {
    const p = this.user;
    this.prompt = "";
    if (!p.alive || p.phase !== "ground" || p.edit) return;
    const k = this.pad ? "X" : "E";
    let bl: Loot | null = null, bd = 2.3;
    for (const l of this.loot) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd && Math.abs(l.y - p.y) < 2) { bd = d; bl = l; } }
    for (const c of this.chests) if (!c.opened && Math.hypot(c.x - p.x, c.z - p.z) < Math.min(2.6, bd) && Math.abs(c.y - p.y) < 2) { this.prompt = `${k}  Search Chest`; return; }
    if (bl) this.prompt = `${k}  Pick up ${itemName(bl.item)}${bl.item.t === "gun" ? ` (${RARITY_NAMES[bl.item.r]})` : ""}`;
  }

  // ---------- Combat ----------
  damage(t: Player, amount: number, from: Player | null, head = false, storm = false) {
    if (!t.alive) return;
    let left = amount;
    if (!storm && t.shield > 0) { const s = Math.min(t.shield, left); t.shield -= s; left -= s; if (t.shield <= 0 && t.isUser) sfx.shieldBreak(); }
    t.hp -= left;
    if (from) t.lastHit = from.id;
    if (t.isUser) { this.dmgFlash = 0.45; sfx.hurt(); }
    if (from?.isUser && !storm) { this.hitMarker = 0.15; if (head) sfx.headshot(); else sfx.hit(); }
    if (t.hp <= 0) this.eliminate(t, from);
  }
  eliminate(t: Player, from: Player | null) {
    t.alive = false; t.hp = 0; t.edit = null; t.building = false;
    for (const it of t.slots) if (it) this.addLoot(t.x + (this.rnd() - 0.5) * 2, t.z + (this.rnd() - 0.5) * 2, it, t.y);
    t.slots = [null, null, null, null, null];
    const killer = from ?? (t.lastHit >= 0 ? this.players[t.lastHit] : null);
    if (killer && killer !== t) killer.kills++;
    const text = killer && killer !== t ? `${killer.name} eliminated ${t.name}` : `${t.name} was lost in the storm`;
    this.feed.push({ text, t: 0, me: t.isUser || !!killer?.isUser });
    if (this.feed.length > 5) this.feed.shift();
    if (killer?.isUser) sfx.elim();
    if (t.isUser) {
      const mate = this.players.find((p) => p.alive && p.team === t.team);
      this.spectate = mate ? mate.id : killer && killer.alive ? killer.id : 0;
    }
    this.checkOver();
  }
  aliveCount() { return this.players.filter((p) => p.alive).length; }
  checkOver() {
    if (this.over) return;
    const teams = new Set(this.players.filter((p) => p.alive).map((p) => p.team));
    const mine = teams.has(this.user.team);
    if (!mine) { this.over = { place: teams.size + 1, win: false }; sfx.defeat(); }
    else if (teams.size === 1) { this.over = { place: 1, win: true }; sfx.victory(); }
  }
  volAt(x: number, z: number, range = 120) {
    const v = this.user.alive ? this.user : this.players[this.spectate] ?? this.user;
    return Math.max(0, 1 - Math.hypot(x - v.x, z - v.z) / range);
  }
  /** fire the held gun along (dx,dy,dz) from the camera/eye ray origin */
  shoot(p: Player, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, extraSpread = 0) {
    const it = this.gun(p)!, G_ = GUNS[it.k];
    it.mag--; p.cd = 1 / G_.rate; p.shotAt = this.time; p.fireT = 0.1;
    const moving = p.moving > 0.2 ? 1.4 : 1, air = p.gnd ? 1 : 1.6;
    const spread = G_.spread * (p.isUser && this.aimHeld ? 0.45 : 1) * moving * air + extraSpread;
    const mx = p.x + Math.sin(p.yaw) * 0.6, my = p.y + 1.4, mz = p.z + Math.cos(p.yaw) * 0.6;
    for (let k = 0; k < G_.pellets; k++) {
      let ex = dx + (this.rnd() - 0.5) * spread * 2, ey = dy + (this.rnd() - 0.5) * spread * 2, ez = dz + (this.rnd() - 0.5) * spread * 2;
      const l = Math.hypot(ex, ey, ez); ex /= l; ey /= l; ez /= l;
      const h = this.ray(ox, oy, oz, ex, ey, ez, G_.range, p);
      const hx = ox + ex * h.t, hy = oy + ey * h.t, hz = oz + ez * h.t;
      if (k < 4) { this.tracers.push({ x1: mx, y1: my, z1: mz, x2: hx, y2: hy, z2: hz, t: 0 }); }
      let dmg = G_.dmg[it.r];
      if (it.k === "shotgun" && h.t > 12) dmg *= Math.max(0.3, 1 - (h.t - 12) / 20);
      if (h.kind === "player") { const t = h.ref as Player; if (t.team !== p.team) this.damage(t, dmg * (h.head ? 2 : 1), p, h.head); }
      else if (h.kind === "build") this.damageBuild(h.ref as Build, dmg);
    }
    sfx.shot(it.k, p.isUser ? 1 : this.volAt(p.x, p.z) * 0.8);
    if (it.mag <= 0) p.reloadT = G_.reload;
  }
  aimHeld = false;
  /** pickaxe hit (player swing); returns true if something was hit */
  swing(p: Player, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    p.swingT = SWING; p.cd = PICK_CD;
    sfx.pickaxe();
    const h = this.ray(ox, oy, oz, dx, dy, dz, p.isUser ? 3.2 + Math.hypot(this.cam.x - p.x, this.cam.z - p.z) : 2.6, p, { players: true, props: true, ground: false });
    if (h.kind === "none") return false;
    const hx = ox + dx * h.t, hy = oy + dy * h.t, hz = oz + dz * h.t;
    if (p.isUser && Math.hypot(hx - p.x, hz - p.z) > 3.4) return false;
    if (h.kind === "player") { const t = h.ref as Player; if (t.team !== p.team) this.damage(t, 20, p); return true; }
    let key = "", mat: Mat = "wood", hp = 0, max = 1;
    let apply: (d: number) => boolean = () => false;
    if (h.kind === "tree") { const tr = this.trees[h.ref]; key = "t" + h.ref; mat = "wood"; apply = (d) => { tr.hp -= d; hp = tr.hp; max = tr.max; if (tr.hp <= 0) { tr.dead = true; this.propVer++; return true; } return false; }; if (p.isUser) this.shake = { kind: "tree", i: h.ref, t: 0.35, dx: -dx, dz: -dz }; }
    else if (h.kind === "rock") { const rk = this.rocks[h.ref]; key = "r" + h.ref; mat = "brick"; apply = (d) => { rk.hp -= d; hp = rk.hp; max = rk.max; if (rk.hp <= 0) { rk.dead = true; this.propVer++; return true; } return false; }; if (p.isUser) this.shake = { kind: "rock", i: h.ref, t: 0.25, dx: -dx, dz: -dz }; }
    else if (h.kind === "car") { const c = this.cars[h.ref]; key = "c" + h.ref; mat = "metal"; apply = (d) => { c.box!.hp! -= d; hp = c.box!.hp!; max = 800; if (hp <= 0) { c.dead = true; this.boxes.splice(this.boxes.indexOf(c.box!), 1); this.propVer++; return true; } return false; }; }
    else if (h.kind === "build") { const b = h.ref as Build; key = "b" + b.id; mat = b.mat; apply = (d) => { const dead = this.damageBuild(b, d); hp = Math.max(0, b.hp); max = b.max; return dead; }; }
    if (!p.isUser) { apply(PICK_DMG); p.mats[mat] = Math.min(MAX_MATS, p.mats[mat] + 6); return true; }
    const w = this.weak;
    const crit = !!w && w.key === key && Math.hypot(w.x - hx, w.y - hy, w.z - hz) < 0.9;
    const dead = apply(crit ? PICK_CRIT : PICK_DMG);
    const gain = (crit ? 2 : 1) * (mat === "wood" ? 7 : mat === "brick" ? 6 : 5);
    p.mats[mat] = Math.min(MAX_MATS, p.mats[mat] + gain);
    this.harvestFx.push({ x: hx - dx * 0.2, y: hy, z: hz - dz * 0.2, mat, n: gain, crit, t: 0 });
    if (crit) { this.critStreak++; sfx.crit(this.critStreak); } else { this.critStreak = 0; sfx.harvest(); }
    if (dead) {
      this.weak = null; this.hpBar = null; this.critStreak = 0;
      this.harvestFx.push({ x: hx, y: hy, z: hz, mat, n: 0, crit: false, t: 0, poof: true });
      sfx.propBreak();
    } else {
      // new weak point somewhere else on the face toward the player
      const nx = -dx, nz = -dz, l = Math.hypot(nx, nz) || 1, tx = -nz / l, tz = nx / l, off = (this.rnd() - 0.5) * 1.6;
      this.weak = { key, x: hx + tx * off + (nx / l) * 0.05, y: Math.max(p.y + 0.5, hy + (this.rnd() - 0.5) * 1.0), z: hz + tz * off + (nz / l) * 0.05, nx: nx / l, nz: nz / l, t: 0 };
      this.hpBar = { x: hx, y: hy + 1.1, z: hz, hp, max, t: 0 };
    }
    return true;
  }

  // ---------- Step ----------
  step(dt: number, input: Input) {
    this.time += dt;
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt);
    this.updateBus(dt);
    this.updateStorm(dt);
    this.controlUser(dt, input);
    for (const p of this.players) if (!p.isUser && p.alive) this.think(p, dt);
    for (const p of this.players) if (p.alive) this.tickPlayer(p, dt);
    this.updateFx(dt);
    this.updateCam();
    this.updatePrompt();
    input.events.length = 0; input.dx = 0; input.dy = 0;
  }
  updateBus(dt: number) {
    const b = this.bus;
    if (!b.active) return;
    b.t += dt;
    b.x = b.sx + b.dx * b.t * 22; b.z = b.sz + b.dz * b.t * 22;
    const end = b.t * 22 > MAP * 2.3;
    for (const p of this.players) if (p.phase === "bus") {
      p.x = b.x; p.z = b.z; p.y = 78;
      if (end || (!p.isUser && b.t > p.ai.jumpAt)) this.jumpOut(p);
    }
    if (end) b.active = false;
  }
  jumpOut(p: Player) {
    p.phase = "sky"; p.vy = -4; p.y = 76; p.x = this.bus.x; p.z = this.bus.z;
    if (p.isUser) sfx.jump();
  }
  updateStorm(dt: number) {
    const s = this.storm;
    if (s.phase < 0) {
      if (this.bus.t < 22 && this.bus.active) return;
      s.timer -= dt;
      if (s.timer <= 0) { s.phase = 0; this.nextCircle(); s.timer = STORM[0].wait; }
    } else if (s.phase < STORM.length) {
      s.timer -= dt;
      if (s.shrinking) {
        const st = STORM[s.phase], k = 1 - Math.max(0, s.timer) / st.shrink;
        s.cx = s.fx + (s.nx - s.fx) * k; s.cz = s.fz + (s.nz - s.fz) * k; s.r = s.fr + (s.nr - s.fr) * k;
        if (s.timer <= 0) {
          s.phase++; s.shrinking = false;
          if (s.phase < STORM.length) { this.nextCircle(); s.timer = STORM[s.phase].wait; }
        }
      } else if (s.timer <= 0) {
        s.shrinking = true; s.fx = s.cx; s.fz = s.cz; s.fr = s.r; s.timer = STORM[s.phase].shrink; sfx.stormWarn();
      }
      s.dmg = STORM[Math.min(s.phase, STORM.length - 1)].dmg;
    }
    s.tick -= dt;
    if (s.tick <= 0) {
      s.tick = 1;
      for (const p of this.players) if (p.alive && p.phase === "ground" && Math.hypot(p.x - s.cx, p.z - s.cz) > s.r) this.damage(p, s.dmg, null, false, true);
    }
    const u = this.user;
    if (u.alive && Math.hypot(u.x - s.cx, u.z - s.cz) > s.r) { this.stormSoundT -= dt; if (this.stormSoundT <= 0) { this.stormSoundT = 1.2; sfx.storm(); } }
  }
  nextCircle() {
    const s = this.storm, st = STORM[s.phase];
    if (s.phase === 0) {
      // first circle: centred near one of the three towns
      const poi = this.pois[Math.floor(this.rnd() * this.pois.length)];
      s.cx = s.fx = 0; s.cz = s.fz = 0; s.r = s.fr = 400;
      const k = 0.35 + this.rnd() * 0.3;
      s.nx = poi.x * k; s.nz = poi.z * k; s.nr = st.r;
      return;
    }
    const a = this.rnd() * Math.PI * 2, d = this.rnd() * Math.max(0, s.r - st.r);
    s.nx = s.cx + Math.cos(a) * d; s.nz = s.cz + Math.sin(a) * d; s.nr = st.r;
  }

  controlUser(dt: number, input: Input) {
    const p = this.user, o = this.opts;
    this.aimHeld = input.aim && !p.building && !p.edit;
    if (!p.alive) { this.preview = null; return; }
    const mult = p.edit ? o.editMult : p.building ? o.buildMult : this.aimHeld ? o.ads : 1;
    p.yaw -= input.dx * o.look * mult;
    p.pitch = Math.max(-1.35, Math.min(1.3, p.pitch - input.dy * o.look * mult * (o.invertY ? -1 : 1)));
    const k = input.keys;
    const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) + input.my;
    const s = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + input.mx;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.move(p, mx, mz, dt);
    for (const e of input.events) this.userEvent(p, e);
    // edit grid painting
    if (p.edit) {
      const b = this.editBuild(p);
      if (!b || Math.hypot(b.cx - p.x, b.cz - p.z) > 10 || p.phase !== "ground") { p.edit = null; }
      else {
        const e = p.edit;
        e.hover = this.hoverTile(b);
        if (input.fire && e.hover >= 0) {
          if (e.paint < 0) e.paint = (e.sel >> e.hover) & 1 ? 0 : 1;
          const before = e.sel;
          e.sel = e.paint ? e.sel | (1 << e.hover) : e.sel & ~(1 << e.hover);
          if (before !== e.sel) sfx.click();
        } else if (!input.fire) e.paint = -1;
      }
      this.preview = null;
      p.firePrev = input.fire;
      return;
    }
    // building
    if (p.building && p.phase === "ground") {
      this.preview = this.planPiece(p, p.piece);
      this.previewOk = !!this.preview && p.mats[p.mat] >= BUILD_COST && !this.occupied(this.preview);
      if (input.fire && p.buildCd <= 0 && (o.turbo || !p.firePrev)) {
        if (this.place(p, this.preview)) { p.buildCd = 0.09; if (o.resetPiece) {} }
      }
    } else this.preview = null;
    // weapons
    if (!p.building && input.fire && p.phase === "ground") this.useItem(p, !p.firePrev);
    p.firePrev = input.fire;
  }
  userEvent(p: Player, e: string) {
    if (p.phase === "bus") { if (e === "jump") this.jumpOut(p); return; }
    if ((p.phase === "sky") && e === "jump") { this.deploy(p); return; }
    if (p.edit) {
      if (e === "edit" || e === "build") this.confirmEdit(p);
      else if (e === "editup") { if (this.opts.confirmOnRelease || this.opts.editHold) this.confirmEdit(p); }
      else if (e === "reset") { p.edit.sel = 0; this.confirmEdit(p); }
      else if (e === "jump" && p.gnd) { p.vy = JUMP_V; p.gnd = false; }
      return;
    }
    if (e === "jump") { if (p.gnd && p.phase === "ground") { p.vy = JUMP_V; p.gnd = false; } return; }
    if (p.phase !== "ground") return;
    if (e === "edit") { this.startEdit(p); return; }
    if (e === "build") { p.building = !p.building; p.healT = 0; sfx.weaponSwitch(); return; }
    if (e.startsWith("piece:")) { const k = e.slice(6) as PieceKind; if (p.building && p.piece === k) { p.mat = MATS[(MATS.indexOf(p.mat) + 1) % 3]; } p.building = true; p.piece = k; p.healT = 0; return; }
    if (e === "nextpiece" || e === "prevpiece") { const i = PIECES.indexOf(p.piece); p.piece = PIECES[(i + (e === "nextpiece" ? 1 : 3)) % 4]; return; }
    if (e === "mat") { p.mat = MATS[(MATS.indexOf(p.mat) + 1) % 3]; return; }
    if (e === "reload") { if (p.building) { p.rot = (p.rot + 1) % 4; return; } const g = this.gun(p); if (g && g.mag < GUNS[g.k].mag && p.reloadT <= 0) { p.reloadT = GUNS[g.k].reload; sfx.reload(g.k); } return; }
    if (e === "interact" || e === "use") { this.interact(p); return; }
    if (e === "drop") { if (p.sel > 0 && p.slots[p.sel - 1]) { this.addLoot(p.x + Math.sin(p.yaw), p.z + Math.cos(p.yaw), p.slots[p.sel - 1]!, p.y); p.slots[p.sel - 1] = null; } return; }
    const sel = (n: number) => { if (p.sel !== n) { p.sel = n; p.reloadT = 0; p.healT = 0; sfx.weaponSwitch(); } p.building = false; };
    if (e.startsWith("slot")) { sel(Number(e.slice(4))); return; }
    if (e === "next") { sel((p.sel + 1) % 6); return; }
    if (e === "prev") { sel((p.sel + 5) % 6); return; }
  }
  deploy(p: Player) { if (p.phase === "sky") { p.phase = "glide"; if (p.isUser) sfx.glider(); } }
  useItem(p: Player, pressed: boolean) {
    if (p.cd > 0 || p.healT > 0) return;
    const it = p.slots[p.sel - 1];
    if (p.sel === 0 || !it) {
      if (p.isUser) { const r = this.camRay(); this.swing(p, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz); }
      return;
    }
    if (it.t === "heal") {
      if (!pressed) return;
      const H = HEALS[it.k];
      if ((H.hp > 0 && p.hp >= H.cap) || (H.sh > 0 && p.shield >= H.cap)) return;
      p.healT = H.time; p.healKind = it.k;
      return;
    }
    if (p.reloadT > 0) return;
    if (it.mag <= 0) { p.reloadT = GUNS[it.k].reload; sfx.reload(it.k); return; }
    if ((it.k === "shotgun" || it.k === "pistol") && !pressed) return;
    if (p.isUser) {
      const r = this.camRay();
      // start the shot a little in front of the camera so it can't hit the shooter
      const skip = Math.hypot(r.ox - p.x, r.oz - p.z) + 0.3;
      this.shoot(p, r.ox + r.dx * skip, r.oy + r.dy * skip, r.oz + r.dz * skip, r.dx, r.dy, r.dz);
    }
  }
  move(p: Player, mx: number, mz: number, dt: number) {
    if (p.phase === "bus") return;
    if (p.phase === "sky" || p.phase === "glide") {
      const sp = p.phase === "sky" ? 16 : 12;
      p.x += mx * sp * dt; p.z += mz * sp * dt;
      p.x = Math.max(-MAP, Math.min(MAP, p.x)); p.z = Math.max(-MAP, Math.min(MAP, p.z));
      p.moving = Math.hypot(mx, mz);
      return;
    }
    const sp = (this.aimHeld && p.isUser ? AIM_RUN : RUN) * (p.healT > 0 ? 0.55 : 1) * (this.terrain.water(p.x, p.z) ? 0.6 : 1);
    const ctl = p.gnd ? 1 : 0.8;
    p.x += mx * sp * ctl * dt; p.z += mz * sp * ctl * dt;
    p.x = Math.max(-MAP + 1, Math.min(MAP - 1, p.x)); p.z = Math.max(-MAP + 1, Math.min(MAP - 1, p.z));
    p.moving = Math.min(1, Math.hypot(mx, mz));
  }
  tickPlayer(p: Player, dt: number) {
    p.cd = Math.max(0, p.cd - dt); p.buildCd = Math.max(0, p.buildCd - dt);
    p.swingT = Math.max(0, p.swingT - dt); p.fireT = Math.max(0, p.fireT - dt);
    if (p.phase === "bus") return;
    const wasAir = !p.gnd;
    this.physics(p, dt);
    if (p.phase === "sky") {
      const gy = this.terrain.ground(p.x, p.z);
      if (p.y - gy < 42) this.deploy(p);
    }
    if ((p.phase === "sky" || p.phase === "glide") && p.gnd) { p.phase = "ground"; if (p.isUser) sfx.land(); }
    if (p.phase === "ground") {
      if (p.gnd && wasAir && p.airT > 0.5 && p.isUser) sfx.land();
      p.airT = p.gnd ? 0 : p.airT + dt;
      if (p.gnd && p.moving > 0.1) {
        p.walkT += dt * 9.5 * p.moving;
        p.stepT -= dt * p.moving;
        if (p.stepT <= 0) {
          p.stepT = 0.27;
          const v = p.isUser ? 0.85 : this.volAt(p.x, p.z, 26) * 0.6;
          if (v > 0.03) {
            const b = p.standOn;
            sfx.step(b ? (b.mat === "wood" ? "wood" : b.mat === "metal" ? "metal" : "stone") : this.terrain.water(p.x, p.z) ? "water" : "grass", v);
          }
        }
      } else p.stepT = Math.min(p.stepT, 0.05);
    }
    // reload + heal timers
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { const g = this.gun(p); if (g) g.mag = GUNS[g.k].mag; } }
    if (p.healT > 0) {
      p.healT -= dt;
      const it = p.slots[p.sel - 1];
      if (!it || it.t !== "heal" || it.k !== p.healKind) { p.healT = 0; }
      else if (p.healT <= 0) {
        const H = HEALS[it.k];
        if (H.hp) p.hp = Math.min(Math.max(p.hp, H.cap), p.hp + H.hp, 100);
        if (H.sh) p.shield = Math.min(Math.max(p.shield, H.cap), p.shield + H.sh, 100);
        it.n--; if (it.n <= 0) p.slots[p.sel - 1] = null;
        if (p.isUser) sfx.heal();
      }
    }
    if (p.y < SEA - 30) this.damage(p, 999, null, false, true);
  }

  // ---------- Bots ----------
  newTarget(p: Player, drop = false) {
    const r = this.rnd;
    if (drop || r() < 0.7) {
      const poi = this.pois[Math.floor(r() * this.pois.length)];
      p.ai.tx = poi.x + (r() - 0.5) * 60; p.ai.tz = poi.z + (r() - 0.5) * 60;
    } else { p.ai.tx = (r() - 0.5) * MAP * 1.6; p.ai.tz = (r() - 0.5) * MAP * 1.6; }
    const s = this.storm;
    if (s.phase >= 0) {
      const R = Math.max(4, s.nr * 0.8), d = Math.hypot(p.ai.tx - s.nx, p.ai.tz - s.nz);
      if (d > R) { const a = Math.atan2(p.ai.tz - s.nz, p.ai.tx - s.nx), rr = r() * R; p.ai.tx = s.nx + Math.cos(a) * rr; p.ai.tz = s.nz + Math.sin(a) * rr; }
    }
  }
  think(p: Player, dt: number) {
    const ai = p.ai;
    if (p.phase === "bus") return;
    if (p.phase !== "ground") {
      const dx = ai.tx - p.x, dz = ai.tz - p.z, l = Math.hypot(dx, dz);
      if (l > 2) { p.yaw = Math.atan2(dx, dz); this.move(p, dx / l, dz / l, dt); }
      return;
    }
    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = 0.35 + this.rnd() * 0.3;
      let best = -1, bd = 48 + ai.skill * 20;
      for (const o of this.players) {
        if (!o.alive || o.team === p.team || o.phase !== "ground") continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < bd) { bd = d; best = o.id; }
      }
      ai.enemy = best;
      if (this.rnd() < 0.15) ai.strafe = -ai.strafe;
      // stuck?
      if (Math.hypot(p.x - ai.lx, p.z - ai.lz) < 0.4 && p.moving > 0) { ai.stuckT += 0.5; if (p.gnd) p.vy = JUMP_V; if (ai.stuckT > 2) { this.newTarget(p); ai.stuckT = 0; } } else ai.stuckT = 0;
      ai.lx = p.x; ai.lz = p.z;
      // best gun in hand
      let gi = -1, gs = -1;
      p.slots.forEach((it, i) => { if (it && it.t === "gun") { const sc = it.r + (it.k === "ar" ? 1.5 : it.k === "shotgun" ? 1.2 : 1); if (sc > gs) { gs = sc; gi = i; } } });
      if (ai.enemy < 0 && p.hp < 70) { const hi = p.slots.findIndex((it) => it && it.t === "heal" && HEALS[it.k].hp > 0); if (hi >= 0 && p.healT <= 0) { p.sel = hi + 1; const it = p.slots[hi]!; p.healT = HEALS[it.k].time; p.healKind = it.k; } }
      else if (p.healT <= 0) p.sel = gi >= 0 ? gi + 1 : 0;
    }
    const s = this.storm;
    if (ai.enemy >= 0) {
      const e = this.players[ai.enemy];
      if (!e || !e.alive) { ai.enemy = -1; return; }
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.yaw = Math.atan2(dx, dz);
      const g = this.gun(p);
      const want = g ? (g.k === "shotgun" ? 6 : g.k === "smg" ? 14 : 24) : 1.6;
      const fwd = d > want + 3 ? 1 : d < want - 3 ? -0.6 : 0;
      const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
      this.move(p, (dx / d) * fwd + rx * ai.strafe * 0.7, (dz / d) * fwd + rz * ai.strafe * 0.7, dt);
      if (p.cd <= 0 && p.healT <= 0) {
        if (g && p.reloadT <= 0) {
          if (g.mag <= 0) p.reloadT = GUNS[g.k].reload;
          else if (d < GUNS[g.k].range && this.rnd() < 0.5 + ai.skill * 0.4) {
            const ox = p.x, oy = p.y + EYE, oz = p.z, ty = e.y + 1.2;
            let vx = e.x - ox, vy = ty - oy, vz = e.z - oz; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
            this.shoot(p, ox + vx * 0.6, oy + vy * 0.6, oz + vz * 0.6, vx, vy, vz, (1.15 - ai.skill) * 0.07 + d * 0.0006);
          } else p.cd = 0.25;
        } else if (!g && d < 2.4) {
          this.swing(p, p.x, p.y + 1.2, p.z, dx / d, 0, dz / d);
        }
      }
      return;
    }
    // roam / loot / stay in the storm
    if (s.phase >= 0 && Math.hypot(p.x - s.cx, p.z - s.cz) > s.r * 0.92 && Math.hypot(ai.tx - s.nx, ai.tz - s.nz) > s.nr) this.newTarget(p);
    let tx = ai.tx, tz = ai.tz;
    let nl: Loot | null = null, nd = 14;
    for (const l of this.loot) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < nd && Math.abs(l.y - p.y) < 3) { nd = d; nl = l; } }
    let nc: Chest | null = null;
    for (const c of this.chests) { if (c.opened) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < nd && Math.abs(c.y - p.y) < 3) { nd = d; nc = c; nl = null; } }
    const wantLoot = nl && (nl.item.t === "gun" ? p.slots.filter((x) => x && x.t === "gun").length < 3 : p.slots.some((x) => !x));
    if (nc) { tx = nc.x; tz = nc.z; if (nd < 2) this.openChest(p, nc); }
    else if (nl && wantLoot) { tx = nl.x; tz = nl.z; if (nd < 1.6) { if (this.give(p, nl.item)) this.loot.splice(this.loot.indexOf(nl), 1); } }
    const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz);
    if (l < 2.5 && !nc && !nl) { this.newTarget(p); return; }
    p.yaw = Math.atan2(dx, dz);
    this.move(p, dx / (l || 1), dz / (l || 1), dt);
  }

  // ---------- FX + camera ----------
  updateFx(dt: number) {
    for (const t of this.tracers) t.t += dt;
    this.tracers = this.tracers.filter((t) => t.t < 0.08);
    for (const f of this.feed) f.t += dt;
    this.feed = this.feed.filter((f) => f.t < 7);
    for (const f of this.harvestFx) f.t += dt;
    this.harvestFx = this.harvestFx.filter((f) => f.t < 0.9);
    if (this.weak) { this.weak.t += dt; if (this.weak.t > 6) this.weak = null; }
    if (this.hpBar) { this.hpBar.t += dt; if (this.hpBar.t > 2.5) this.hpBar = null; }
    if (this.shake) { this.shake.t -= dt; if (this.shake.t <= 0) this.shake = null; }
    const u = this.user;
    this.humT -= dt;
    if (this.humT <= 0 && u.alive) {
      this.humT = 1.3;
      let best = 99;
      for (const c of this.chests) if (!c.opened) best = Math.min(best, Math.hypot(c.x - u.x, c.z - u.z) + Math.abs(c.y - u.y));
      if (best < 16) sfx.chestHum(1 - best / 16);
    }
  }
  updateCam() {
    const p = this.user.alive ? this.user : this.players[this.spectate] ?? this.user, c = this.cam;
    if (!this.user.alive && this.players[this.spectate] && !this.players[this.spectate].alive) {
      const n = this.players.find((q) => q.alive); if (n) this.spectate = n.id;
    }
    if (p.phase === "bus") {
      const yaw = p.isUser ? p.yaw : Math.atan2(this.bus.dx, this.bus.dz);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      c.x = this.bus.x - fx * 26; c.z = this.bus.z - fz * 26; c.y = 92 - p.pitch * 10;
      c.tx = this.bus.x; c.ty = 78; c.tz = this.bus.z; c.fov = 70;
      return;
    }
    const pitch = p.isUser ? p.pitch : 0;
    const cp = Math.cos(pitch), fx = Math.sin(p.yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(p.yaw) * cp;
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    const air = p.phase === "sky" || p.phase === "glide";
    const aim = this.aimHeld && p.isUser;
    const dist = air ? 7 : aim ? 1.9 : p.building || p.edit ? 3.6 : 3.1, side = air ? 0 : aim ? 0.55 : 0.75;
    const hx = p.x, hy = p.y + (air ? 1.4 : 1.75), hz = p.z;
    let cx = hx - fx * dist + rx * side, cy = hy - fy * dist + 0.25, cz = hz - fz * dist + rz * side;
    // keep the camera out of walls
    const vx = cx - hx, vy = cy - hy, vz = cz - hz, vl = Math.hypot(vx, vy, vz) || 1;
    const h = this.ray(hx, hy, hz, vx / vl, vy / vl, vz / vl, vl, p, { players: false, props: false, ground: true });
    if (h.kind !== "none") { const t = Math.max(0.3, h.t - 0.25); cx = hx + (vx / vl) * t; cy = hy + (vy / vl) * t; cz = hz + (vz / vl) * t; }
    c.x = cx; c.y = cy; c.z = cz;
    c.tx = cx + fx * 40; c.ty = cy + fy * 40; c.tz = cz + fz * 40;
    c.fov = aim ? 52 : air ? 78 : 72;
  }
}
