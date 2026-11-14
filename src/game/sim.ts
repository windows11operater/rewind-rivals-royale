// @ts-nocheck -- strict index checks relaxed for game hot paths
// Pure game simulation: no React, no three.js.
import { makeNames, SKINS, type Rarity } from "./data";
import { sfx } from "./audio";
import { buildSeason2PoiList, isLaterSeasonLandmark } from "./season2";
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
export interface Poi { name: string; x: number; z: number; base: number; kind: "town" | "city" | "lagoon" | "depot" | "woods" | "park" | "springs" | "row" | "farm" | "lodge" }

export interface Player {
  id: number; name: string; team: number; isUser: boolean; skin: number;
  x: number; y: number; z: number; vy: number; yaw: number; pitch: number;
  hp: number; shield: number; alive: boolean;
  phase: "bus" | "sky" | "glide" | "ground";
  slots: (Item | null)[]; sel: number; cd: number; reloadT: number; healT: number; healKind: HealKind | null;
  mats: Record<Mat, number>; building: boolean; piece: PieceKind; mat: Mat; rot: number; gnd: boolean; buildCd: number; standOn: Build | null;
  kills: number; moving: number; walkT: number; swingT: number; fireT: number;
  /** sim time of the last shot (drives recoil + shotgun pump) */ shotAt: number;
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

export class Sim {
  rnd: () => number;
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
  /** true while a controller drives the user (changes prompt key labels) */
  pad = false;
  trees: Tree[] = [];
  rocks: Rock[] = [];
  /** bumps when a tree / rock / car is destroyed (render cache key) */
  propVer = 0;
  /** the harvesting weak point (blue circle) on the thing the user is hitting */
  weak: WeakPoint | null = null;
  /** consecutive weak-point hits (raises the crit chime) */
  critStreak = 0;
  /** short-lived harvest effects: resource chips + sparks at the hit point */
  harvestFx: HarvestFx[] = [];
  /** HP bar of the last thing the user hit with the pickaxe */
  hpBar: { x: number; y: number; z: number; hp: number; max: number; t: number } | null = null;
  /** tree / rock currently shaking from a hit */
  shake: { kind: "tree" | "rock"; i: number; t: number; dx: number; dz: number } | null = null;
  chests: Chest[] = [];
  loot: Loot[] = [];
  players: Player[] = [];
  tracers: Tracer[] = [];
  feed: { text: string; t: number; me: boolean }[] = [];
  terrain!: Terrain;
  /** build pieces bucketed by grid cell for collision / ray queries */
  grid = new Map<number, Build[]>();
  /** bumps whenever a piece is placed, damaged, edited or destroyed (render cache key) */
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
      // No fill: user's teammates become their own solo squads
      if (!fill && mode > 1 && i > 0 && i < mode) team = 1000 + i;
      const isUser = i === 0;
      const skin = isUser ? userSkin : Math.floor(this.rnd() * SKINS.length);
      this.players.push({
        id: i, name: isUser ? userName : names[i], team, isUser, skin,
        x: 0, y: 80, z: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, shield: 0, alive: true, phase: "bus",
        slots: [null, null, null, null, null], sel: 0, cd: 0, reloadT: 0, healT: 0, healKind: null,
        mats: { wood: 0, brick: 0, metal: 0 }, building: false, piece: "wall", mat: "wood", rot: 0, gnd: false, buildCd: 0, standOn: null,
        kills: 0, moving: 0, walkT: 0, swingT: 0, fireT: 0, shotAt: -9,
        ai: { tx: 0, tz: 0, state: "drop", think: 0, enemy: -1, jumpAt: 2 + this.rnd() * 16, stuckT: 0, lx: 0, lz: 0, detour: 0, skill: 0.4 + this.rnd() * 0.6, strafe: 1 },
      });
    }
    this.user = this.players[0];
    // Bus route
    const a = this.rnd() * Math.PI * 2;
    const off = (this.rnd() - 0.5) * 120;
    const dx = Math.cos(a), dz = Math.sin(a);
    this.bus.dx = dx; this.bus.dz = dz;
    this.bus.sx = -dx * MAP * 1.15 - dz * off;
    this.bus.sz = -dz * MAP * 1.15 + dx * off;
    this.bus.x = this.bus.sx; this.bus.z = this.bus.sz;
    this.user.yaw = Math.atan2(dx, dz);
    for (const p of this.players) if (!p.isUser) {
      const poi = this.pois[Math.floor(this.rnd() * this.pois.length)];
      p.ai.tx = poi.x + (this.rnd() - 0.5) * 30; p.ai.tz = poi.z + (this.rnd() - 0.5) * 30;
    }
    // Teammate bots drop with the user's area-ish
    this.storm.cx = this.storm.nx = 0; this.storm.cz = this.storm.nz = 0;
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
    const season2 = buildSeason2PoiList()
      .filter((poi) => !isLaterSeasonLandmark(poi.name));
    const P = (name: string, x: number, z: number, kind: Poi["kind"]): Poi => ({
      name, x: Math.round((x - 2) / CELL) * CELL + 2, z: Math.round((z - 2) / CELL) * CELL + 2, base: 0, kind,
    });
    this.pois = season2.map((poi) => P(poi.name, poi.x, poi.z, poi.kind as Poi["kind"]));
    // flatten a plateau under each named location
    const PR: Partial<Record<Poi["kind"], number>> = { city: 46, park: 44, springs: 40, row: 36, depot: 26, farm: 24, lodge: 20, town: 24, woods: 8 };
    for (const poi of this.pois) {
      const rr = PR[poi.kind] ?? 10;
      poi.base = Math.max(SEA + 1.2, T.avg(poi.x, poi.z, rr));
      if (poi.kind !== "lagoon") T.flattenDisc(poi.x, poi.z, rr, poi.base, 24);
    }
    // town streets (the island art already has the country roads)
    const road = (poi: Poi, pts: [number, number][], w = 6, walk = true) => {
      for (let i = 0; i < pts.length - 1; i++) this.roads.push({ x1: poi.x + pts[i][0], z1: poi.z + pts[i][1], x2: poi.x + pts[i + 1][0], z2: poi.z + pts[i + 1][1], w, walk });
    };
    const HOUSE = ["#f2efe6", "#a9cde0", "#f3d9a4", "#c8e0b0", "#e8c9b8", "#d9dee6", "#f6e7c8"];
    const ROOF = ["#a8402e", "#4a5d74", "#6b4a36", "#3f6b45", "#8c2f2f", "#5a5f66"];
    const BRICK = ["#b5633f", "#9c5a3c", "#c7a27c", "#a9b3bd", "#c9b79a", "#8e9aa8"];
    const SHOP = ["#d94a3a", "#3a7fd9", "#f2c94c", "#e8e2d4", "#5fae57", "#c76bd1"];
    const METAL = ["#aeb8c2", "#8f9aa6", "#b8a98e"];
    const house = (x: number, z: number, nx: number, nz: number, st: number, face: [number, number] | undefined, base?: number) =>
      this.addBuilding(x, z, nx, nz, st, { mat: "wood", color: pick(HOUSE), roof: pick(ROOF), kind: "house", face, base });
    const SIZES: [number, number][] = [[2, 2], [2, 3], [3, 2], [3, 3]];
    const ring = (poi: Poi, n: number, r0: number, r1: number, sizes: [number, number][], stMax: number) => {
      let placed = 0;
      for (let i = 0; i < n * 4 && placed < n; i++) {
        const a = (placed / n) * Math.PI * 2 + r() * 0.9 + i * 0.41, rad = r0 + r() * (r1 - r0);
        const [nx, nz] = pick(sizes);
        if (house(poi.x + Math.cos(a) * rad, poi.z + Math.sin(a) * rad, nx, nz, 1 + Math.floor(r() * stMax), [poi.x, poi.z], poi.base)) placed++;
      }
    };
    const CAR_COLORS = ["#d23b2f", "#2f6fd6", "#f2f2f2", "#2e9e5a", "#f0c23a", "#3a3d44"];
    const addCar = (x: number, z: number, alongZ: boolean) => {
      const hw = alongZ ? 1.05 : 2.2, hd = alongZ ? 2.2 : 1.05, y = T.ground(x, z);
      const box: Box = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y0: y, h: y + 1.5, color: "#888", kind: "car", hp: 800 };
      this.boxes.push(box);
      this.cars.push({ x, z, alongZ, color: pick(CAR_COLORS), box });
    };
    for (const poi of this.pois) {
      const B = poi.base;
      if (poi.kind === "park") {
        this.pitch = { x: poi.x, z: poi.z, w: 16, d: 26 };
        road(poi, [[-14, -19], [14, -19], [14, 19], [-14, 19], [-14, -19]]);
        ring(poi, 8, 29, 38, [[2, 3], [3, 2], [3, 3]], 2);
        this.addChest(poi.x + 11, poi.z, B); this.addChest(poi.x - 11, poi.z + 6, B);
        this.addLoot(poi.x, poi.z, this.randGun(1), B);
      } else if (poi.kind === "springs") {
        road(poi, [[-42, 0], [42, 0]]); road(poi, [[0, -42], [0, 42]]);
        for (const [ox, oz] of [[16, 16], [-16, 16], [16, -16], [-16, -16], [34, 16], [-34, 16], [34, -16], [-34, -16]] as const) {
          const [nx, nz] = pick([[2, 3], [3, 2], [3, 3]] as [number, number][]);
          house(poi.x + ox, poi.z + oz, nx, nz, 1 + Math.floor(r() * 2), [poi.x, poi.z], B);
        }
        addCar(poi.x + 1.7, poi.z - 22, true); addCar(poi.x - 22, poi.z - 1.7, false); addCar(poi.x + 26, poi.z + 1.7, false);
        this.addChest(poi.x + 5.5, poi.z + 5.5, B);
      } else if (poi.kind === "row") {
        road(poi, [[-44, 0], [44, 0]], 7);
        for (const ox of [-30, -14, 2, 18, 34]) for (const sd of [-1, 1])
          this.addBuilding(poi.x + ox, poi.z + sd * 12, 3, 2, 1 + Math.floor(r() * 2), { mat: "brick", color: pick(SHOP), roof: null, kind: "tower", face: [poi.x + ox, poi.z], base: B, win: 0.6 });
        addCar(poi.x - 6, poi.z + 2, false); addCar(poi.x + 24, poi.z - 2, false);
      } else if (poi.kind === "depot") {
        for (const sd of [-1, 1]) this.addBuilding(poi.x + sd * 9, poi.z, 3, 4, 2, { mat: "metal", color: pick(METAL), roof: null, kind: "depot", face: [poi.x + sd * 9, poi.z + 20], base: B, win: 0.3 });
        this.addChest(poi.x, poi.z + 10, B);
      } else if (poi.kind === "farm") {
        this.addBuilding(poi.x - 9, poi.z, 3, 4, 2, { mat: "wood", color: "#b8332b", roof: "#e9e4d8", kind: "house", face: [poi.x, poi.z], base: B, win: 0.2 });
        house(poi.x + 10, poi.z + 2, 2, 3, 2, [poi.x, poi.z], B);
      } else if (poi.kind === "lodge") {
        this.addBuilding(poi.x, poi.z, 2, 2, 4, { mat: "wood", color: "#8a5a36", roof: "#4b3324", kind: "house", face: [poi.x, poi.z + 10], base: B, win: 0.5 });
        house(poi.x - 13, poi.z + 4, 2, 2, 1, [poi.x, poi.z], B); house(poi.x + 13, poi.z - 4, 2, 2, 1, [poi.x, poi.z], B);
      } else if (poi.kind === "woods") {
        house(poi.x, poi.z, 2, 2, 1, [poi.x, poi.z + 10], B);
      } else {
        ring(poi, 3 + Math.floor(r() * 2), 12, 22, SIZES, 2);
        this.addChest(poi.x + (r() - 0.5) * 6, poi.z + (r() - 0.5) * 6, B);
      }
    }
    // a few lone houses in the countryside
    for (let i = 0, n = 0; i < 60 && n < 9; i++) {
      const x = (r() - 0.5) * MAP * 1.6, z = (r() - 0.5) * MAP * 1.6;
      if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < 55)) continue;
      if (house(x, z, 2, pick([2, 3]), 1 + Math.floor(r() * 2), [0, 0])) n++;
    }
    // trees, rocks
    const nearHouse = (x: number, z: number, m: number) => this.houses.some((h) => Math.abs(h.x - x) < h.w / 2 + m && Math.abs(h.z - z) < h.d / 2 + m) || this.boxes.some((b) => x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m);
    const inPitch = (x: number, z: number, m: number) => !!this.pitch && Math.abs(x - this.pitch.x) < 17 + m && Math.abs(z - this.pitch.z) < 22 + m;
    const inPlaza = (x: number, z: number) => this.plazas.some((p) => Math.abs(p.x - x) < p.w / 2 + 3 && Math.abs(p.z - z) < p.d / 2 + 3);
    const blocked = (x: number, z: number, m: number) => T.raw(x, z) < SEA + 0.6 || nearHouse(x, z, m) || this.nearRoad(x, z, m) || inPitch(x, z, m) || inPlaza(x, z);
    const woods = this.pois.find((p) => p.kind === "woods")!;
    let tries = 0;
    while (this.trees.length < 340 && tries++ < 8000) {
      const inWoods = this.trees.length < 90;
      const x = inWoods ? woods.x + (r() - 0.5) * 80 : (r() - 0.5) * MAP * 2;
      const z = inWoods ? woods.z + (r() - 0.5) * 80 : (r() - 0.5) * MAP * 2;
      if (Math.abs(x) > MAP - 5 || Math.abs(z) > MAP - 5) continue;
      if (blocked(x, z, 3)) continue;
      { const ts = 0.8 + r() * 0.7, hp = propHp(ts); this.trees.push({ x, z, s: ts, k: inWoods ? (r() < 0.6 ? 1 : 0) : r() < 0.25 ? 1 : 0, hp, max: hp }); }
    }
    for (let i = 0; i < 120 && this.rocks.length < 90; i++) {
      const x = (r() - 0.5) * MAP * 2, z = (r() - 0.5) * MAP * 2;
      if (blocked(x, z, 2)) continue;
      { const rs = 0.6 + r() * 1.4, hp = propHp(rs, true); this.rocks.push({ x, z, s: rs, hp, max: hp }); }
    }
    // streetlights along town streets
    for (const s of this.roads) {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, len = Math.hypot(dx, dz);
      const nx = -dz / len, nz = dx / len;
      let side = 1;
      for (let d = 6; d < len - 3; d += 20) {
        side = -side;
        const off = s.w / 2 + (s.walk ? 1.4 : 1.1);
        const x = s.x1 + (dx * d) / len + nx * off * side, z = s.z1 + (dz * d) / len + nz * off * side;
        if (nearHouse(x, z, 1) || this.lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 9)) continue;
        this.lamps.push({ x, z, rot: Math.atan2(-nx * side, -nz * side) });
      }
    }
    // field chests & loot
    for (let i = 0, n = 0; i < 80 && n < 18; i++) {
      const x = (r() - 0.5) * MAP * 1.8, z = (r() - 0.5) * MAP * 1.8;
      if (!nearHouse(x, z, 2) && T.raw(x, z) > SEA + 0.6) { this.addChest(x, z); n++; }
    }
    for (let i = 0, n = 0; i < 160 && n < 50; i++) {
      const x = (r() - 0.5) * MAP * 1.8, z = (r() - 0.5) * MAP * 1.8;
      if (!nearHouse(x, z, 1) && T.raw(x, z) > SEA + 0.6) { this.addLoot(x, z, this.randItem()); n++; }
    }
  }
