// @ts-nocheck -- test fixtures index arrays directly
import { describe, expect, it } from "vitest";
import { BUILD_COST, GUNS, MAT_HP, PICK_CRIT, PICK_DMG, Sim } from "./sim";


const fresh = (mode: 1 | 2 | 4 = 1) => new Sim(mode, true, 0, "Tester", 1234);
/** a match with the map buildings and trees cleared, for testing player building */
const empty = () => { const sim = fresh(); sim.builds = []; sim.grid.clear(); sim.trees = []; return sim; };
function onGround(sim: Sim, x = 0, z = 120) {
  const p = sim.user;
  p.phase = "ground"; p.x = x; p.z = z; p.y = 0; p.gnd = true; p.yaw = 0; p.pitch = 0;
  return p;
}

describe("match setup", () => {
  it("solos and duos have 30 players, squads 32", () => {
    expect(fresh(1).players.length).toBe(30);
    expect(fresh(2).players.length).toBe(30);
    expect(fresh(4).players.length).toBe(32);
  });
  it("only Tilted Towers, Retail Row and Dusty Depot are on the map", () => {
    const names = fresh().pois.map((p) => p.name).sort();
    expect(names).toEqual(["Dusty Depot", "Retail Row", "Tilted Towers"]);
  });
  it("the three towns are far apart with open ground between them", () => {
    const ps = fresh().pois;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      expect(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z)).toBeGreaterThan(150);
  });
});

describe("building", () => {
  const fresh = empty;
  it("each piece costs 10 of the selected material", () => {
    const sim = fresh();
    const p = onGround(sim);
    p.mats = { wood: 30, brick: 0, metal: 0 }; p.mat = "wood";
    expect(BUILD_COST).toBe(10);
    expect(sim.place(p, sim.planPiece(p, "wall"))).toBe(true);
    expect(p.mats.wood).toBe(20);
  });
  it("cannot build without enough material", () => {
    const sim = fresh();
    const p = onGround(sim);
    p.mats = { wood: 9, brick: 0, metal: 0 }; p.mat = "wood";
    expect(sim.place(p, sim.planPiece(p, "floor"))).toBe(false);
    expect(sim.builds.length).toBe(0);
  });
  it("wood, brick and metal pieces have 150 / 220 / 300 health", () => {
    expect(MAT_HP).toEqual({ wood: 150, brick: 220, metal: 300 });
  });
  it("walking onto a ramp lifts the player up it", () => {
    const sim = fresh();
    const p = onGround(sim, 2, 122);
    p.mats.wood = 50; p.mat = "wood";
    sim.place(p, sim.planPiece(p, "ramp")); // cell ahead (+z), rising toward +z
    const r = sim.builds[0];
    p.x = r.cx; p.z = r.cz - 2.5;
    for (let i = 0; i < 35; i++) { p.z += 0.1; sim.physics(p, 1 / 60); } // walk to three quarters of the way up
    expect(p.y).toBeGreaterThan(2.5);
    expect(p.standOn).toBe(r);
  });
  it("edit toggles a door in the wall ahead", () => {
    const sim = fresh();
    const p = onGround(sim);
    p.mats.wood = 20;
    sim.place(p, sim.planPiece(p, "wall"));
    expect(sim.builds[0].boxes.length).toBe(1);
    expect(sim.editAhead(p)).toBe(true);
    expect(sim.builds[0].door).toBe(true);
    expect(sim.builds[0].boxes.length).toBe(3);
  });
});

describe("map buildings", () => {
  it("every building has a ground-floor door, a floor and a roof", () => {
    const sim = fresh();
    expect(sim.houses.length).toBeGreaterThan(20);
    for (const h of sim.houses) {
      const mine = sim.builds.filter((b) => b.house === h.id);
      expect(mine.some((b) => b.kind === "wall" && b.door && b.y0 === h.base)).toBe(true);
      expect(mine.some((b) => b.kind === "floor" && b.y0 === h.base)).toBe(true);
      expect(mine.some((b) => b.kind === "floor" && b.y0 === h.base + h.storeys * 4)).toBe(true);
    }
  });
  it("buildings with more than one storey have stairs", () => {
    const sim = fresh();
    for (const h of sim.houses.filter((x) => x.storeys > 1))
      expect(sim.builds.filter((b) => b.house === h.id && b.kind === "ramp").length).toBe(h.storeys - 1);
  });
  it("standing on terrain follows its height", () => {
    const heights = new Float32Array(256 * 256).fill(5);
    const sim = new Sim(1, true, 0, "Tester", 1234, heights);
    const p = sim.user;
    p.phase = "ground"; p.x = 230; p.z = -230; p.y = 9; p.vy = 0;
    for (let i = 0; i < 60; i++) sim.physics(p, 1 / 60);
    expect(p.y).toBeCloseTo(5, 1);
  });
});

describe("weapons + harvesting", () => {
  it("only the four modeled guns exist", () => {
    expect(Object.keys(GUNS).sort()).toEqual(["ar", "pistol", "shotgun", "smg"]);
  });
  it("pickaxe does 50 normally and 100 on the weak point", () => {
    expect(PICK_DMG).toBe(50);
    expect(PICK_CRIT).toBe(100);
  });
});
