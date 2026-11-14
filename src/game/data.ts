// @ts-nocheck -- strict index checks relaxed
export type Rarity = 0 | 1 | 2 | 3 | 4;
export const RARITY_NAMES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
export const RARITY_COLORS = ["#9aa3ad", "#5ccf3a", "#3aa0f0", "#b14ff0", "#f0a43a"];

import frostHi from "@/assets/models/skins/frost.glb.asset.json";
import frostLo from "@/assets/models/skins/frost_lo.glb.asset.json";
import ghoulHi from "@/assets/models/skins/ghoul.glb.asset.json";
import ghoulLo from "@/assets/models/skins/ghoul_lo.glb.asset.json";
import jonesyHi from "@/assets/models/skins/jonesy.glb.asset.json";
import jonesyLo from "@/assets/models/skins/jonesy_lo.glb.asset.json";
import knightHi from "@/assets/models/skins/knight.glb.asset.json";
import knightLo from "@/assets/models/skins/knight_lo.glb.asset.json";
import merryHi from "@/assets/models/skins/merry.glb.asset.json";
import merryLo from "@/assets/models/skins/merry_lo.glb.asset.json";
import renegadeHi from "@/assets/models/skins/renegade.glb.asset.json";
import renegadeLo from "@/assets/models/skins/renegade_lo.glb.asset.json";
import sentinelHi from "@/assets/models/skins/sentinel.glb.asset.json";
import sentinelLo from "@/assets/models/skins/sentinel_lo.glb.asset.json";
import skullHi from "@/assets/models/skins/skull.glb.asset.json";
import skullLo from "@/assets/models/skins/skull_lo.glb.asset.json";

export interface Skin {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  source: "default" | "shop" | "pass";
  /** glider canopy colour */
  accent: string;
  /** detailed model (lobby, locker, shop, your own character) */
  model: string;
  /** light model (other players in matches) */
  lo: string;
}

/** The user's 8 outfits. Every one is owned from the start (see store.ts). */
export const SKINS: Skin[] = [
  { id: "jonesy", name: "Jonesy", rarity: 1, price: 0, source: "default", accent: "#e8a23a", model: jonesyHi.url, lo: jonesyLo.url },
  { id: "skull", name: "Skull Trooper", rarity: 3, price: 1500, source: "shop", accent: "#8a6cff", model: skullHi.url, lo: skullLo.url },
  { id: "ghoul", name: "Ghoul Trooper", rarity: 3, price: 1500, source: "shop", accent: "#d94a8c", model: ghoulHi.url, lo: ghoulLo.url },
  { id: "merry", name: "Merry Marauder", rarity: 2, price: 1200, source: "shop", accent: "#2fa84a", model: merryHi.url, lo: merryLo.url },
  { id: "frost", name: "Festive Frostfighter", rarity: 2, price: 1200, source: "shop", accent: "#3aa0f0", model: frostHi.url, lo: frostLo.url },
  { id: "sentinel", name: "Battlefront Sentinel", rarity: 3, price: 1500, source: "shop", accent: "#c0262c", model: sentinelHi.url, lo: sentinelLo.url },
  { id: "renegade", name: "Renegade Raider", rarity: 2, price: 1200, source: "shop", accent: "#f2d24a", model: renegadeHi.url, lo: renegadeLo.url },
  { id: "knight", name: "Red-Top Knight", rarity: 4, price: 2000, source: "shop", accent: "#e84a3a", model: knightHi.url, lo: knightLo.url },
];
export const DEFAULT_SKIN = "jonesy";

export const PASS_TIERS = 50;
export const XP_PER_TIER = 1000;
export const LEVEL_XP = 500;
export function tierReward(tier: number): { type: "rbucks"; amount: number } | { type: "skin"; id: string } | null {
  if (tier % 10 === 0) return { type: "rbucks", amount: 300 };
  if (tier % 4 === 0) return { type: "rbucks", amount: 100 };
  return null;
}

/** Daily challenges: progress resets each day; finishing one awards bonus XP once. */
export const CHALLENGES = [
  { id: "top10", label: "Place Top 10 in any mode", key: "top10", target: 3, xp: 500, stars: 5, featured: true },
  { id: "chests", label: "Search Chests", key: "chests", target: 7, xp: 500, stars: 5 },
  { id: "elims", label: "Eliminate Opponents", key: "elims", target: 3, xp: 500, stars: 5 },
] as const;

const P1 = ["xX", "", "", "", "TTV_", "", "itz", "", "Its", "", "YT_", "", "", "lil", "the", "Mr", ""];
const W = ["Sweaty", "Kronic", "Shadow", "Jake", "Tyler", "Blaze", "Frosty", "Nova", "Viper", "Goose", "Snipez", "Tilted", "Pumpkin", "Llama", "Noodle", "Ghost", "Zay", "Kade", "Ryzen", "Wolfie", "Toxic", "Chunky", "Saucy", "Brxdy", "Mxson", "Ethxn", "Cxsper", "Destiny", "Lunar", "Hxpe", "Bushcamper", "Cranky", "Duck", "Panda", "Rexy", "Spooky", "Default", "Turtle", "Clutch", "Ace", "Mango", "Kobe", "Echo", "Yeti", "Smurf", "Skeet", "Juice", "Rusty", "Bandit", "Reaper"];
const W2 = ["", "", "", "plays", "playz", "gaming", "YT", "TV", "_FN", "ttv", "", "Builds", "Boi", "x", "", "Clips", "God"];
const SUF = ["", "", "09", "123", "2k", "_", "xX", "777", "69", "14", "007", "1", "99", "420", "x", "_2011", "04", "11"];
export function makeNames(n: number, rnd: () => number): string[] {
  const out = new Set<string>();
  while (out.size < n) {
    const p = P1[Math.floor(rnd() * P1.length)];
    const w = W[Math.floor(rnd() * W.length)];
    const w2 = W2[Math.floor(rnd() * W2.length)];
    const s = SUF[Math.floor(rnd() * SUF.length)];
    let name = p + w + w2 + s;
    if (rnd() < 0.3) name = name.toLowerCase();
    if (p === "xX" && rnd() < 0.7) name += "Xx";
    out.add(name.slice(0, 16));
  }
  return [...out];
}
