import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CHALLENGES, DEFAULT_SKIN, PASS_TIERS, SKINS, XP_PER_TIER, LEVEL_XP, tierReward } from "./data";

export type Mode = 1 | 2 | 4;
export type Device = "pc" | "mobile";
export interface MatchResult { place: number; win: boolean; kills: number; xp: number; tiersGained: number; rbucksGained: number; total: number }
export interface Daily { date: string; top10: number; chests: number; elims: number; done: string[] }

interface Meta {
  username: string;
  rbucks: number;
  xp: number;
  owned: string[];
  equipped: string;
  mode: Mode;
  fill: boolean;
  wins: number;
  matches: number;
  kills: number;
  lastDaily: string;
  daily: Daily;
  musicVol: number;
  musicMuted: boolean;
  device: Device | null;
  setDevice: (d: Device | null) => void;
  setUsername: (n: string) => void;
  setMode: (m: Mode) => void;
  setFill: (f: boolean) => void;
  equip: (id: string) => void;
  buy: (id: string, price: number) => boolean;
  claimDaily: () => boolean;
  setMusicVol: (v: number) => void;
  setMusicMuted: (m: boolean) => void;
  addMatch: (r: { place: number; win: boolean; kills: number; chests: number; seconds: number; total: number }) => MatchResult;
}

const today = () => new Date().toISOString().slice(0, 10);
const freshDaily = (): Daily => ({ date: today(), top10: 0, chests: 0, elims: 0, done: [] });
export function currentDaily(d: Daily | undefined): Daily {
  return d && d.date === today() ? d : freshDaily();
}

export const useMeta = create<Meta>()(
  persist(
    (set, get) => ({
      username: "Rewinder" + Math.floor(Math.random() * 9000 + 1000),
      rbucks: 950,
      xp: 0,
      owned: SKINS.map((s) => s.id),
      equipped: DEFAULT_SKIN,
      mode: 1,
      fill: true,
      wins: 0,
      matches: 0,
      kills: 0,
      lastDaily: "",
      daily: freshDaily(),
      musicVol: 0.55,
      musicMuted: false,
      device: null,
      setDevice: (device) => set({ device }),
      setUsername: (n) => set({ username: n.slice(0, 16) || "Rewinder" }),
      setMode: (mode) => set({ mode }),
      setFill: (fill) => set({ fill }),
      equip: (id) => set({ equipped: id }),
      buy: (id, price) => {
        const s = get();
        if (s.rbucks < price || s.owned.includes(id)) return false;
        set({ rbucks: s.rbucks - price, owned: [...s.owned, id] });
        return true;
      },
      claimDaily: () => {
        if (get().lastDaily === today()) return false;
        set({ lastDaily: today(), rbucks: get().rbucks + 100 });
        return true;
      },
      setMusicVol: (musicVol) => set({ musicVol: Math.max(0, Math.min(1, musicVol)) }),
      setMusicMuted: (musicMuted) => set({ musicMuted }),
      addMatch: ({ place, win, kills, chests, seconds, total }) => {
        const s = get();
        // daily challenge progress + one-time bonus XP
        const d = { ...currentDaily(s.daily) };
        d.chests += chests; d.elims += kills; if (place <= 10) d.top10 += 1;
        let bonus = 0;
        const done = [...d.done];
        for (const c of CHALLENGES) if (!done.includes(c.id) && d[c.key] >= c.target) { done.push(c.id); bonus += c.xp; }
        d.done = done;
        const xp = Math.round(kills * 150 + chests * 40 + seconds * 3 + Math.max(0, total - place) * 25 + (win ? 1000 : 0)) + bonus;
        const before = Math.min(PASS_TIERS, Math.floor(s.xp / XP_PER_TIER));
        const nxp = s.xp + xp;
        const after = Math.min(PASS_TIERS, Math.floor(nxp / XP_PER_TIER));
        let rb = 0;
        const owned = [...s.owned];
        for (let t = before + 1; t <= after; t++) {
          const r = tierReward(t);
          if (r?.type === "rbucks") rb += r.amount;
          if (r?.type === "skin" && !owned.includes(r.id)) owned.push(r.id);
        }
        set({ xp: nxp, rbucks: s.rbucks + rb, owned, wins: s.wins + (win ? 1 : 0), matches: (s.matches ?? 0) + 1, kills: (s.kills ?? 0) + kills, daily: d });
        return { place, win, kills, xp, tiersGained: after - before, rbucksGained: rb, total };
      },
    }),
    {
      name: "project-rewind-meta",
      version: 2,
      // v2: the user's 8 model outfits replace the old shape outfits; all are owned, unknown equips fall back to Jonesy
      migrate: (old) => {
        const s = (old ?? {}) as Partial<Meta>;
        return { ...s, owned: SKINS.map((k) => k.id), equipped: SKINS.some((k) => k.id === s.equipped) ? s.equipped : DEFAULT_SKIN } as Meta;
      },
    },
  ),
);

export function tierOf(xp: number) {
  return Math.min(PASS_TIERS, Math.floor(xp / XP_PER_TIER));
}
export function levelOf(xp: number) {
  return { level: 1 + Math.floor(xp / LEVEL_XP), into: xp % LEVEL_XP, need: LEVEL_XP };
}
