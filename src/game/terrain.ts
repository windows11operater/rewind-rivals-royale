// @ts-nocheck -- typed-array index checks relaxed for hot paths
// Pure heightfield for the island (no React, no three.js). Heights are metres, sampled on an
// n x n grid of nodes spanning [-half, half] on x and z (row 0 = north = -z).
export const SEA = -3;
/** Lowest a player can stand: wading depth in the sea, lake and river. */
export const WADE = SEA - 1.1;

export class Terrain {
  n: number;
  half: number;
  h: Float32Array;
  constructor(half: number, heights?: Float32Array | null, n = 256) {
    this.half = half;
    this.n = heights ? Math.round(Math.sqrt(heights.length)) : n;
    this.h = heights ? new Float32Array(heights) : new Float32Array(this.n * this.n);
    this.h0 = new Float32Array(this.h);
  }
  /** heights as loaded, before town plateaus were flattened (the render mesh is shifted by h - h0) */
  h0: Float32Array;
  private lerp(a: Float32Array, x: number, z: number) {
    const n = this.n;
    let [fx, fz] = this.idx(x, z);
    fx = Math.max(0, Math.min(n - 1.001, fx)); fz = Math.max(0, Math.min(n - 1.001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    return (a[iz * n + ix] * (1 - tx) + a[iz * n + ix + 1] * tx) * (1 - tz) + (a[(iz + 1) * n + ix] * (1 - tx) + a[(iz + 1) * n + ix + 1] * tx) * tz;
  }
  /** How far flattening moved the ground at (x, z). */
  delta(x: number, z: number) { return this.lerp(this.h, x, z) - this.lerp(this.h0, x, z); }
  get flat() { return !this.h.some((v) => v !== 0); }
  private idx(x: number, z: number) {
    const k = (this.n - 1) / (this.half * 2);
    return [(x + this.half) * k, (z + this.half) * k] as const;
  }
  /** Raw terrain height (may be below the sea). */
  raw(x: number, z: number) {
    const n = this.n;
    let [fx, fz] = this.idx(x, z);
    fx = Math.max(0, Math.min(n - 1.001, fx)); fz = Math.max(0, Math.min(n - 1.001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a = this.h[iz * n + ix], b = this.h[iz * n + ix + 1], c = this.h[(iz + 1) * n + ix], d = this.h[(iz + 1) * n + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  /** Walkable ground height: terrain, but never deeper than wading depth. */
  ground(x: number, z: number) { return Math.max(WADE, this.raw(x, z)); }
  water(x: number, z: number) { return this.raw(x, z) < SEA - 0.25; }
  /** Average land height in a disc (sea counts as just above the waterline). */
  avg(x: number, z: number, r: number) {
    let s = 0, c = 0;
    for (let a = 0; a < 8; a++) for (let d = 0; d <= r; d += r / 4) {
      s += Math.max(SEA + 0.8, this.raw(x + Math.cos(a * 0.785) * d, z + Math.sin(a * 0.785) * d)); c++;
    }
    return s / c;
  }
  /** Flatten a rectangle (half sizes hw, hd) to height y, blending back to the terrain over `blend` metres. */
  flattenRect(x: number, z: number, hw: number, hd: number, y: number, blend: number) {
    const n = this.n, step = (this.half * 2) / (n - 1);
    const i0 = Math.max(0, Math.floor((x - hw - blend + this.half) / step)), i1 = Math.min(n - 1, Math.ceil((x + hw + blend + this.half) / step));
    const j0 = Math.max(0, Math.floor((z - hd - blend + this.half) / step)), j1 = Math.min(n - 1, Math.ceil((z + hd + blend + this.half) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = -this.half + i * step, wz = -this.half + j * step;
      const dx = Math.max(0, Math.abs(wx - x) - hw), dz = Math.max(0, Math.abs(wz - z) - hd);
      const d = Math.hypot(dx, dz);
      if (d > blend) continue;
      const t = d / blend, s = t * t * (3 - 2 * t);
      this.h[j * n + i] = y * (1 - s) + this.h[j * n + i] * s;
    }
  }
  flattenDisc(x: number, z: number, r: number, y: number, blend: number) {
    const n = this.n, step = (this.half * 2) / (n - 1);
    const R = r + blend;
    const i0 = Math.max(0, Math.floor((x - R + this.half) / step)), i1 = Math.min(n - 1, Math.ceil((x + R + this.half) / step));
    const j0 = Math.max(0, Math.floor((z - R + this.half) / step)), j1 = Math.min(n - 1, Math.ceil((z + R + this.half) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.max(0, Math.hypot(-this.half + i * step - x, -this.half + j * step - z) - r);
      if (d > blend) continue;
      const t = d / blend, s = t * t * (3 - 2 * t);
      this.h[j * n + i] = y * (1 - s) + this.h[j * n + i] * s;
    }
  }
  /** Distance along a ray to the ground, or -1. Sphere-trace style steps, then bisect. */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
    let t = 0, prev = 0;
    for (let i = 0; i < 160 && t <= maxT; i++) {
      const y = oy + dy * t, g = this.ground(ox + dx * t, oz + dz * t);
      const gap = y - g;
      if (gap <= 0) {
        let a = prev, b = t;
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m - this.ground(ox + dx * m, oz + dz * m) > 0) a = m; else b = m; }
        return b;
      }
      prev = t;
      t += Math.max(0.4, gap * 0.6);
    }
    return -1;
  }
}
