// Lobby background music: looping the uploaded track with fade-out when a match starts.
import track from "@/assets/lobby_music.mp3.asset.json";

let el: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function get() {
  if (!el) {
    el = new Audio(track.url);
    el.loop = true;
    el.preload = "auto";
  }
  return el;
}
function clearFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
}

export const lobbyMusic = {
  /** Resolves false when the browser blocks autoplay (needs a click first). */
  async play(vol: number): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const a = get();
    clearFade();
    a.volume = Math.max(0, Math.min(1, vol));
    if (vol <= 0) { a.pause(); return true; }
    try { await a.play(); return true; } catch { return false; }
  },
  setVolume(vol: number) {
    if (!el) return;
    clearFade();
    el.volume = Math.max(0, Math.min(1, vol));
    if (vol <= 0) el.pause();
    else if (el.paused) el.play().catch(() => {});
  },
  fadeOut(ms = 900) {
    if (!el) return;
    clearFade();
    const a = el;
    const start = a.volume;
    const t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = start * (1 - k);
      if (k >= 1) { clearFade(); a.pause(); }
    }, 40);
  },
  stop() {
    clearFade();
    el?.pause();
  },
};
