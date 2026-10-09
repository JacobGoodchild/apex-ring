// All sound is synthesised with Web Audio: engine with gears, tyre squeal, boost whoosh, beeps and clicks,
// rival engines placed left/right of you with a Doppler shift as they pass, and the procedural soundtrack.
import { initMusic } from "./music.js";
let rivalsV = [];
let ctx = null, master = null, eng = null, squeal = null, wind = null, muted = false, lastGear = 0, shiftT = 0;

// Each car has its own engine character: pitch, harmonic mix, filter brightness and gearbox.
// electric: one long whine with no gear changes.
const ENGINES = {
  v10: { pitch: 1.0, ratio: 1.5, sub: 0.5, bright: 1.0, gears: 7 },
  v8: { pitch: 0.8, ratio: 1.25, sub: 0.8, bright: 0.8, gears: 6 },
  flat6: { pitch: 1.15, ratio: 2.0, sub: 0.35, bright: 1.2, gears: 7 },
  v12: { pitch: 1.3, ratio: 1.5, sub: 0.25, bright: 1.35, gears: 8 },
  i4: { pitch: 1.45, ratio: 2.0, sub: 0.2, bright: 1.5, gears: 6 },
  electric: { pitch: 2.6, ratio: 2.0, sub: 0.05, bright: 1.6, gears: 1, electric: true },
};
let engine = ENGINES.v10;
export function setEngine(kind) { engine = ENGINES[kind] || ENGINES.v10; lastGear = 0; }

function noiseBuffer(c) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function startAudio() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    // engine: two detuned saws + a sub square through a resonant low-pass
    const eg = ctx.createGain(); eg.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 5; lp.connect(eg); eg.connect(comp);
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.detune.value = 9;
    const o3 = ctx.createOscillator(); o3.type = "square"; const g3 = ctx.createGain(); g3.gain.value = 0.5;
    o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp); o1.start(); o2.start(); o3.start();
    eng = { g: eg, lp, o1, o2, o3, g3 };
    const nb = noiseBuffer(ctx);
    // tyre squeal: band-passed noise
    const sq = ctx.createBufferSource(); sq.buffer = nb; sq.loop = true; const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 6;
    const sg = ctx.createGain(); sg.gain.value = 0; sq.connect(bp); bp.connect(sg); sg.connect(comp); sq.start(); squeal = { g: sg, bp };
    // wind / boost rush
    const wn = ctx.createBufferSource(); wn.buffer = nb; wn.loop = true; const wf = ctx.createBiquadFilter(); wf.type = "lowpass"; wf.frequency.value = 600;
    const wg = ctx.createGain(); wg.gain.value = 0; wn.connect(wf); wf.connect(wg); wg.connect(comp); wn.start(); wind = { g: wg, f: wf };
    // three pooled voices for the nearest rival cars: saw + sub through a low-pass, panned left/right
    rivalsV = [0, 1, 2].map(() => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; const s = ctx.createOscillator(); s.type = "square";
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3; lp.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0; const sg = ctx.createGain(); sg.gain.value = 0.4;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      o.connect(lp); s.connect(sg); sg.connect(lp); lp.connect(g); g.connect(pan); pan.connect(comp); o.start(); s.start();
      return { o, s, lp, g, pan };
    });
    initMusic(ctx, master);
  } catch (e) { ctx = null; }
}

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
export const isMuted = () => muted;

// The gearbox, shared by the engine sound and the rev counter: gear index (0-based) and rpm 0..1 from speed.
// Gear thresholds spread a little wider at the top, like a real gearbox; electric cars have one long gear.
export function gearbox(v, vmax) {
  const E = engine, n = E.gears, f = Math.max(0, Math.min(1.2, v / vmax));
  if (E.electric) return { gear: 0, rpm: 0.12 + 0.88 * Math.min(1.2, f), electric: true };
  const edge = (k) => Math.pow(k / n, 0.85) * 1.02;
  let g = 0; while (g < n - 1 && f > edge(g + 1)) g++;
  const inGear = (f - edge(g)) / (edge(g + 1) - edge(g));
  return { gear: g, rpm: 0.28 + 0.72 * Math.min(1, inGear) };
}

// v: forward speed, vmax: top speed, on: engine audible, slip: 0..1 tyre slip, boost: bool
export function updateAudio(v, vmax, on, slip, boost) {
  if (!ctx || !eng) return;
  const t = ctx.currentTime, f = Math.max(0, Math.min(1.2, v / vmax));
  const E = engine, { gear: g, rpm } = gearbox(v, vmax);
  if (on && g > lastGear && v > 3) shiftBlip(); lastGear = g;
  const base = (48 + rpm * 150 + g * 6) * E.pitch;
  eng.o1.frequency.setTargetAtTime(base, t, 0.03); eng.o2.frequency.setTargetAtTime(base * E.ratio, t, 0.03); eng.o3.frequency.setTargetAtTime(base / 2, t, 0.03);
  eng.g3.gain.setTargetAtTime(E.sub, t, 0.1);
  eng.lp.frequency.setTargetAtTime((400 + rpm * 2200 + (boost ? 900 : 0)) * E.bright, t, 0.04);
  eng.g.gain.setTargetAtTime(on ? 0.075 + rpm * 0.03 : 0, t, 0.08);
  // squeal grows with the drift angle (slip) and with speed; pitch rises as the slide gets wider
  const sq = slip * Math.min(1, v / 25);
  squeal.g.gain.setTargetAtTime(on ? Math.min(0.13, sq * sq * 0.16 + sq * 0.03) : 0, t, 0.05);
  squeal.bp.frequency.setTargetAtTime(1250 + slip * 900, t, 0.1);
  wind.g.gain.setTargetAtTime(on ? f * 0.05 + (boost ? 0.12 : 0) : 0, t, 0.12);
  wind.f.frequency.setTargetAtTime(boost ? 2400 : 500 + f * 900, t, 0.1);
}

// Rival engines: list of { pan -1..1, dist m, rpm 0..1, closing m/s } for the nearest cars (up to 3).
export function updateRivalAudio(list, on) {
  if (!ctx || !rivalsV.length) return;
  const t = ctx.currentTime;
  rivalsV.forEach((v, i) => {
    const r = on ? list[i] : null;
    if (!r) { v.g.gain.setTargetAtTime(0, t, 0.15); return; }
    const doppler = 343 / Math.max(200, 343 - r.closing * 1.6); // exaggerated a little so passes are audible
    const f = (55 + r.rpm * 160) * doppler * (0.9 + i * 0.07);
    v.o.frequency.setTargetAtTime(f, t, 0.05); v.s.frequency.setTargetAtTime(f / 2, t, 0.05);
    v.lp.frequency.setTargetAtTime(Math.max(200, 500 + r.rpm * 1400 - r.dist * 6), t, 0.08);
    v.g.gain.setTargetAtTime(0.05 * Math.max(0, 1 - r.dist / 70) ** 1.5, t, 0.08);
    if (v.pan.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, r.pan)), t, 0.05);
  });
}

// A quick dip and crackle on each upshift.
function shiftBlip() {
  if (!ctx || muted) return;
  const t = ctx.currentTime; if (t - shiftT < 0.25) return; shiftT = t;
  eng.g.gain.cancelScheduledValues(t); eng.g.gain.setValueAtTime(eng.g.gain.value, t); eng.g.gain.linearRampToValueAtTime(0.02, t + 0.06); eng.g.gain.linearRampToValueAtTime(0.1, t + 0.18);
  tone(90, 0.08, "sawtooth", 0.06); tone(140, 0.05, "square", 0.04, 0.03);
}

// Pause all sound while the page is hidden.
export function suspend(hidden) { if (!ctx) return; if (hidden) ctx.suspend(); else ctx.resume(); }

function tone(freq, dur, type = "square", vol = 0.15, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
export const beep = (go) => tone(go ? 880 : 440, go ? 0.6 : 0.25, "square", 0.12);
export const click = () => tone(1200, 0.05, "triangle", 0.08);
export const thud = (k) => tone(70, 0.25, "sine", Math.min(0.4, 0.1 + k * 0.02));
export const chime = () => { tone(660, 0.2, "triangle", 0.1); tone(990, 0.35, "triangle", 0.1, 0.12); };
export function whoosh() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.8);
}
export const lapChime = () => { tone(784, 0.15, "triangle", 0.1); tone(1046, 0.25, "triangle", 0.1, 0.1); };
export function fanfare(win) {
  const notes = win ? [523, 659, 784, 1046, 784, 1046] : [392, 440, 523];
  notes.forEach((f, i) => tone(f, 0.28, "triangle", 0.12, i * 0.13));
}
