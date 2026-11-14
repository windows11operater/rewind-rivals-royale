// @ts-nocheck -- canvas painting hot path
// Town streets (asphalt, painted lines, sidewalks), plazas, the soccer pitch and dirt under houses are
// painted once into a transparent overlay canvas. The 3D island mesh blends it on top of its own texture
// (world-projected, see Scene.tsx), and the minimap draws it over the island's top-down picture.
import { MAP, type Sim } from "./sim";
import { islandTop } from "./island";

/** World size covered by the painted ground, in metres (centred on 0,0). */
export const ART = 560;
const PX = 2048;
const cache = new WeakMap<Sim, HTMLCanvasElement>();
const overlayCache = new WeakMap<Sim, HTMLCanvasElement>();

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Minimap picture: the island's top-down view (or a painted fallback) with the town overlay. */
export function paintMap(sim: Sim): HTMLCanvasElement {
  const hit = cache.get(sim);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  const k = 1024 / ART;
  g.fillStyle = "#3d9be0"; g.fillRect(0, 0, 1024, 1024);
  if (islandTop) g.drawImage(islandTop, (ART / 2 - MAP) * k, (ART / 2 - MAP) * k, MAP * 2 * k, MAP * 2 * k);
  else paintFallback(g, 1024);
  g.drawImage(paintOverlay(sim), 0, 0, 1024, 1024);
  cache.set(sim, c);
  return c;
}

function paintFallback(g: CanvasRenderingContext2D, PX: number) {
  const k = PX / ART;
  const T = (v: number) => (v + ART / 2) * k;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // ocean + shallows + beach
  g.fillStyle = "#3d9be0"; g.fillRect(0, 0, PX, PX);
  g.fillStyle = "#63c4ea"; rrect(g, T(-262), T(-262), 524 * k, 524 * k, 70 * k); g.fill();
  g.fillStyle = "#ecdba2"; rrect(g, T(-MAP - 13), T(-MAP - 13), (MAP + 13) * 2 * k, (MAP + 13) * 2 * k, 46 * k); g.fill();
  // grass
  g.fillStyle = "#5cbf3d"; rrect(g, T(-MAP - 3), T(-MAP - 3), (MAP + 3) * 2 * k, (MAP + 3) * 2 * k, 34 * k); g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 160; i++) {
    const x = rnd() * PX, y = rnd() * PX, r = (20 + rnd() * 60) * k;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() < 0.5 ? "120,214,80" : "62,150,44";
    gr.addColorStop(0, `rgba(${col},0.35)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const shades = ["#67cb47", "#52b236", "#72d452", "#4ea733", "#61c142"];
  for (let i = 0; i < 70000; i++) { g.fillStyle = shades[i % 5]; const s = 1 + rnd() * 3; g.fillRect(rnd() * PX, rnd() * PX, s, s * (0.6 + rnd())); }
  g.restore();
}

/** Transparent overlay with only the town features, covering ART metres centred on 0,0. */
export function paintOverlay(sim: Sim): HTMLCanvasElement {
  const hit = overlayCache.get(sim);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = PX;
  const g = c.getContext("2d")!;
  const k = PX / ART;
  const T = (v: number) => (v + ART / 2) * k;

  // Tilted plazas (concrete)
  for (const p of sim.plazas) {
    g.fillStyle = "#b9bab6"; g.fillRect(T(p.x - p.w / 2), T(p.z - p.d / 2), p.w * k, p.d * k);
    g.strokeStyle = "#a4a5a1"; g.lineWidth = 1;
    for (let v = -p.w / 2; v <= p.w / 2; v += 2) { g.beginPath(); g.moveTo(T(p.x + v), T(p.z - p.d / 2)); g.lineTo(T(p.x + v), T(p.z + p.d / 2)); g.stroke(); }
  }

  // roads: sidewalks first, then asphalt, then paint
  g.lineJoin = "round"; g.lineCap = "round";
  const stroke = (s: (typeof sim.roads)[0], w: number, color: string, dash: number[] = []) => {
    g.strokeStyle = color; g.lineWidth = w * k; g.setLineDash(dash.map((d) => d * k));
    g.beginPath(); g.moveTo(T(s.x1), T(s.z1)); g.lineTo(T(s.x2), T(s.z2)); g.stroke();
  };
  for (const s of sim.roads) if (s.walk) stroke(s, s.w + 3.8, "#8f918d");
  for (const s of sim.roads) if (s.walk) stroke(s, s.w + 3.4, "#cfcdc4");
  for (const s of sim.roads) stroke(s, s.w + 0.5, "#3c3f44");
  for (const s of sim.roads) stroke(s, s.w, "#4b4f55");
  g.lineCap = "butt";
  for (const s of sim.roads) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, o = s.w / 2 - 0.45;
    for (const sd of [-1, 1]) { g.strokeStyle = "#e9e9e2"; g.lineWidth = 0.22 * k; g.setLineDash([]); g.beginPath(); g.moveTo(T(s.x1 + nx * o * sd), T(s.z1 + nz * o * sd)); g.lineTo(T(s.x2 + nx * o * sd), T(s.z2 + nz * o * sd)); g.stroke(); }
    stroke(s, 0.3, s.walk ? "#f4f4ee" : "#f2cc3c", [3, 3]);
  }
  g.setLineDash([]);

  // Pleasant Park pitch
  const P = sim.pitch;
  if (P) {
    const x0 = T(P.x - P.w / 2), z0 = T(P.z - P.d / 2), W = P.w * k, D = P.d * k;
    g.fillStyle = "#48b03a"; g.fillRect(x0 - 2 * k, z0 - 2 * k, W + 4 * k, D + 4 * k);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#4fb93f" : "#5ccb4a"; g.fillRect(x0, z0 + (D / 8) * i, W, D / 8 + 1); }
    g.strokeStyle = "#ffffff"; g.lineWidth = 0.35 * k;
    g.strokeRect(x0, z0, W, D);
    g.beginPath(); g.moveTo(x0, z0 + D / 2); g.lineTo(x0 + W, z0 + D / 2); g.stroke();
    g.beginPath(); g.arc(x0 + W / 2, z0 + D / 2, 3 * k, 0, 7); g.stroke();
    g.strokeRect(x0 + W * 0.25, z0, W * 0.5, 4 * k); g.strokeRect(x0 + W * 0.25, z0 + D - 4 * k, W * 0.5, 4 * k);
  }
  // dirt under towns' houses
  for (const h of sim.houses) { g.fillStyle = "rgba(120,96,60,0.55)"; g.fillRect(T(h.x - h.w / 2 - 1), T(h.z - h.d / 2 - 1), (h.w + 2) * k, (h.d + 2) * k); }
  overlayCache.set(sim, c);
  return c;
}
