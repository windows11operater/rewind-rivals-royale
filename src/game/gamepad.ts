// @ts-nocheck -- gamepad API arrays are loosely typed across browsers
import { useEffect, useRef, useState } from "react";
import type { Input } from "./sim";

/** Standard-mapping button indices. */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export function firstPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) if (p && p.connected) return p;
  return null;
}

const DZ = 0.16;
export function deadzone(v: number) { return Math.abs(v) < DZ ? 0 : (v - Math.sign(v) * DZ) / (1 - DZ); }
const pressed = (p: Gamepad, i: number) => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.4); };

/** Look speed in input "pixels" per second at full stick deflection. */
export const PAD_LOOK_X = 1050;
export const PAD_LOOK_Y = 650;

/** Reads the first controller into the match Input once per frame. */
export class PadReader {
  prev: boolean[] = [];
  fireHeld = false;
  aimHeld = false;
  poll(inp: Input, dt: number, building: boolean): { connected: boolean; ui: string[] } {
    const p = firstPad();
    const ui: string[] = [];
    if (!p) {
      if (this.fireHeld) { inp.fire = false; this.fireHeld = false; }
      if (this.aimHeld) { inp.aim = false; this.aimHeld = false; }
      inp.mx = 0; inp.my = 0; this.prev = [];
      return { connected: false, ui };
    }
    inp.mx = deadzone(p.axes[0] ?? 0);
    inp.my = -deadzone(p.axes[1] ?? 0);
    const rx = deadzone(p.axes[2] ?? 0), ry = deadzone(p.axes[3] ?? 0);
    inp.dx += rx * Math.abs(rx) * PAD_LOOK_X * dt;
    inp.dy += ry * Math.abs(ry) * PAD_LOOK_Y * dt;
    const down = (i: number) => pressed(p, i) && !this.prev[i];
    if (down(BTN.A)) inp.events.push("jump");
    if (down(BTN.B)) inp.events.push("build");
    if (down(BTN.X)) inp.events.push("use");
    if (down(BTN.Y)) inp.events.push("slot0");
    if (down(BTN.LB) || down(BTN.LEFT)) inp.events.push(building ? "prevpiece" : "prev");
    if (down(BTN.RB) || down(BTN.RIGHT)) inp.events.push(building ? "nextpiece" : "next");
    if (down(BTN.UP)) inp.events.push("reload");
    if (down(BTN.DOWN) || down(BTN.R3)) inp.events.push("drop");
    if (building) {
      if (down(BTN.LT)) inp.events.push("mat");
      if (this.aimHeld) { inp.aim = false; this.aimHeld = false; }
    } else {
      const lt = pressed(p, BTN.LT);
      if (lt !== this.aimHeld) { inp.aim = lt; this.aimHeld = lt; }
    }
    const rt = pressed(p, BTN.RT);
    if (rt !== this.fireHeld) { inp.fire = rt; this.fireHeld = rt; }
    if (down(BTN.BACK)) ui.push("map");
    if (down(BTN.START)) ui.push("pause");
    this.prev = p.buttons.map((_, i) => pressed(p, i));
    return { connected: true, ui };
  }
}

/** Calls handler(buttonIndex) on each new controller button press (menus). */
export function useGamepadButtons(handler: (i: number) => void) {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    let raf = 0, prev: boolean[] | null = null;
    const loop = () => {
      const p = firstPad();
      if (p) {
        const now = p.buttons.map((_, i) => pressed(p, i));
        if (prev) now.forEach((v, i) => { if (v && !prev![i]) h.current(i); });
        prev = now;
      } else prev = null;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Name of the connected controller, or null. */
export function usePadConnected() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const f = () => setId(firstPad()?.id ?? null);
    f();
    const t = setInterval(f, 400);
    window.addEventListener("gamepadconnected", f);
    window.addEventListener("gamepaddisconnected", f);
    return () => { clearInterval(t); window.removeEventListener("gamepadconnected", f); window.removeEventListener("gamepaddisconnected", f); };
  }, []);
  return id;
}
