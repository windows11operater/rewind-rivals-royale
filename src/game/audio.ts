// @ts-nocheck -- Web Audio graph is intentionally kept lightweight for mobile browsers.
// Recorded Tactical Shotgun sample + synthesized, event-driven gameplay effects.
import shotgunAsset from "@/assets/sounds/tac_shotgun_v2.mp3.asset.json";
import stepsAsset from "@/assets/sounds/footsteps.mp3.asset.json";
/** start times (s) of each footfall in the user's footstep recording */
const STEP_AT = [1.15, 1.44, 1.68, 1.95, 2.18, 2.46, 2.68, 2.98, 3.19, 3.49, 3.72, 3.99, 4.22, 4.48, 4.72, 5.03, 5.22, 5.53, 5.76, 6.03, 6.26, 6.53, 6.76, 7.06, 7.27, 7.57, 7.8, 8.07];
let stepI = 0;
export const vol = { master: 1, sfx: 1, steps: 1 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function audio() {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // A short, reusable noise buffer; avoids allocating a large buffer for every sound.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const samples: Record<string, AudioBuffer | null> = {};
const loading: Record<string, boolean> = {};
function loadSample(name: string, url: string) {
  const c = audio();
  if (!c || loading[name] || samples[name]) return;
  loading[name] = true;
  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Audio sample request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => c.decodeAudioData(buffer))
    .then((buffer) => { samples[name] = buffer; })
    .catch(() => { loading[name] = false; });
}

export function preloadSamples() {
  loadSample("shotgun", shotgunAsset.url);
  loadSample("steps", stepsAsset.url);
}

function playSample(name: string, volume: number, rate = 1) {
  const c = audio(), buffer = samples[name];
  if (!c || !master || !buffer) return false;
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = c.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(master);
  source.start();
  return true;
}

function noise(duration: number, frequency: number, q: number, volume: number, type: BiquadFilterType = "lowpass", when = 0) {
  const c = audio();
  if (!c || !master || !noiseBuf) return;
  const start = c.currentTime + when;
  const source = c.createBufferSource();
  source.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.25), start + duration);
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(master);
  source.start(start, Math.random() * 0.5);
  source.stop(start + duration + 0.05);
}

function tone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine", when = 0, slideTo?: number) {
  const c = audio();
  if (!c || !master) return;
  const start = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export type FootstepSurface = "grass" | "wood" | "stone" | "metal" | "water";
const stepSounds: Record<FootstepSurface, () => void> = {
  grass: () => { noise(0.065, 680, 0.8, 0.12, "lowpass"); tone(115, 0.045, 0.045, "triangle"); },
  wood: () => { noise(0.055, 1450, 1.4, 0.12, "bandpass"); tone(180, 0.06, 0.09, "triangle"); },
  stone: () => { noise(0.045, 2200, 1.1, 0.1, "highpass"); tone(250, 0.04, 0.06, "square", 0, 150); },
  metal: () => { noise(0.07, 3000, 2, 0.1, "bandpass"); tone(430, 0.11, 0.07, "triangle", 0, 270); },
  water: () => { noise(0.13, 1100, 0.6, 0.13, "lowpass"); tone(360, 0.1, 0.035, "sine", 0, 180); },
};

export const sfx = {
  shot(kind: string, volume = 1) {
    if (volume < 0.02) return;
    if (kind === "shotgun") {
      if (playSample("shotgun", 0.95 * volume, 0.97 + Math.random() * 0.06)) return;
      preloadSamples();
      noise(0.45, 2200, 0.7, 0.9 * volume);
      tone(70, 0.25, 0.5 * volume, "sine", 0, 42);
    } else if (kind === "smg") {
      noise(0.09, 3200, 1, 0.45 * volume);
      tone(125, 0.045, 0.12 * volume, "square", 0, 75);
    } else if (kind === "pistol") {
      noise(0.14, 2800, 1, 0.55 * volume);
      tone(160, 0.06, 0.2 * volume, "square", 0, 80);
    } else {
      noise(0.16, 2600, 0.9, 0.65 * volume);
      tone(110, 0.08, 0.3 * volume, "sine", 0, 50);
    }
  },
  pickaxe() { noise(0.22, 1800, 0.8, 0.22, "bandpass"); },
  harvest() { tone(150, 0.12, 0.42, "sine", 0.04, 90); noise(0.09, 900, 1.6, 0.5, "lowpass", 0.04); tone(420, 0.05, 0.12, "triangle", 0.04); },
  crit(streak = 1) {
    tone(170, 0.1, 0.4, "sine", 0.04, 100);
    noise(0.07, 1200, 1.4, 0.45, "lowpass", 0.04);
    const f = 880 * Math.pow(1.06, Math.min(12, streak - 1));
    tone(f, 0.35, 0.2, "sine", 0.05); tone(f * 1.5, 0.28, 0.09, "sine", 0.07); tone(f * 2, 0.2, 0.05, "triangle", 0.05);
  },
  propBreak() { noise(0.6, 700, 0.6, 0.55); tone(90, 0.5, 0.3, "sine", 0, 45); noise(0.3, 2500, 0.8, 0.2, "bandpass", 0.15); },
  hit() { tone(1400, 0.07, 0.18, "triangle"); },
  headshot() { tone(1800, 0.09, 0.2, "triangle"); tone(2400, 0.08, 0.15, "triangle", 0.04); },
  hurt() { noise(0.15, 600, 1, 0.4); },
  shieldBreak() { noise(0.3, 5000, 0.4, 0.4, "highpass"); tone(900, 0.3, 0.2, "sawtooth", 0, 200); },
  elim() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 0.18, "square", i * 0.06)); },
  chestOpen() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.5, 0.12, "sine", i * 0.07)); noise(0.6, 6000, 0.3, 0.15, "highpass"); },
  chestHum(volume: number) { if (volume > 0.03) { tone(1568 + Math.random() * 200, 0.4, 0.05 * volume, "sine"); tone(2093, 0.3, 0.03 * volume, "sine", 0.15); } },
  pickup() { tone(660, 0.07, 0.15, "square"); tone(990, 0.09, 0.12, "square", 0.05); },
  reload(kind = "ar") {
    const duration = kind === "shotgun" ? 0.55 : kind === "pistol" ? 0.32 : 0.42;
    noise(0.06, kind === "shotgun" ? 1200 : 2000, 3, 0.3, "bandpass");
    noise(0.06, 1500, 3, 0.28, "bandpass", duration * 0.55);
    noise(0.08, 2500, 3, 0.32, "bandpass", duration);
  },
  weaponSwitch() { noise(0.08, 1900, 1.8, 0.16, "bandpass"); tone(520, 0.07, 0.07, "triangle", 0.025, 340); },
  empty() { tone(1800, 0.03, 0.1, "square"); },
  build() { noise(0.15, 800, 2, 0.4); tone(300, 0.1, 0.2, "square", 0.02, 150); },
  heal() { tone(440, 0.2, 0.1, "sine"); tone(660, 0.3, 0.1, "sine", 0.15); },
  shield() { tone(600, 0.6, 0.12, "sine", 0, 1400); },
  step(surface: FootstepSurface = "grass", volume = 1) {
    const v = volume * vol.steps;
    if (v < 0.02) return;
    const c = audio(), buffer = samples.steps;
    if (c && master && buffer) {
      const at = STEP_AT[stepI++ % STEP_AT.length] - 0.02;
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buffer;
      src.playbackRate.value = (surface === "metal" ? 1.15 : surface === "wood" ? 1.05 : 1) * (0.96 + Math.random() * 0.08);
      g.gain.value = 0.9 * v * vol.master;
      src.connect(g); g.connect(master);
      src.start(c.currentTime, Math.max(0, at), 0.24);
      if (surface === "metal" || surface === "wood") stepSounds[surface]();
      return;
    }
    preloadSamples();
    stepSounds[surface]();
  },
  land() { noise(0.16, 500, 0.7, 0.22, "lowpass"); tone(85, 0.12, 0.18, "sine", 0, 55); },
  wind(volume = 0.12) { if (volume > 0.01) noise(0.65, 360, 0.25, volume, "lowpass"); },
  horn() { tone(330, 0.5, 0.2, "sawtooth"); tone(415, 0.5, 0.15, "sawtooth"); tone(330, 0.5, 0.2, "sawtooth", 0.6); tone(415, 0.5, 0.15, "sawtooth", 0.6); },
  jump() { noise(0.8, 3000, 0.3, 0.25, "highpass"); },
  glider() { tone(200, 0.3, 0.15, "triangle", 0, 400); noise(0.4, 2000, 0.5, 0.15, "bandpass"); },
  storm() { tone(55, 1.2, 0.12, "sawtooth"); noise(1.2, 400, 0.5, 0.1); },
  stormWarn() { [440, 440, 440].forEach((f, i) => tone(f, 0.25, 0.15, "square", i * 0.4)); },
  click() { tone(900, 0.04, 0.12, "square"); },
  ready() { tone(523, 0.1, 0.15, "square"); tone(784, 0.15, 0.15, "square", 0.08); },
  victory() { [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 0.15, "square", i * 0.15)); },
  defeat() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.4, 0.15, "triangle", i * 0.25)); },
};
