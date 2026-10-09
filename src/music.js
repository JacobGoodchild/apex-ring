// Procedural synthwave soundtrack: a tiny step sequencer on Web Audio. No audio files, nothing downloaded.
// Each song is a chord progression plus a seeded lead melody; the menu plays a slow, sparse version.
let ctx = null, out = null, delay = null, timer = null, noise = null;
let song = 0, mode = "menu", step = 0, nextT = 0, vol = 0.6, on = true;

export const SONGS = [
  { name: "Night Drive", bpm: 112, chords: [[57, 0], [53, 1], [60, 1], [55, 1]], seed: 3 },
  { name: "Apex Sunset", bpm: 118, chords: [[50, 0], [58, 1], [53, 1], [57, 0]], seed: 7 },
  { name: "Neon Overdrive", bpm: 124, chords: [[52, 0], [48, 1], [55, 1], [50, 1]], seed: 11 },
  { name: "Coastline", bpm: 104, chords: [[55, 1], [52, 0], [48, 1], [50, 1]], seed: 19 },
];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const triad = ([r, maj]) => [r, r + (maj ? 4 : 3), r + 7];

export function initMusic(audioCtx, dest) {
  if (ctx || !audioCtx) return;
  ctx = audioCtx;
  out = ctx.createGain(); out.gain.value = 0; out.connect(dest);
  // a dotted-eighth echo for the arp and lead
  delay = ctx.createDelay(1); const fb = ctx.createGain(); fb.gain.value = 0.32; const dl = ctx.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 2400;
  delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(out);
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  nextT = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 25);
  applyVol();
}

function applyVol() { if (out) out.gain.setTargetAtTime(on ? vol * 0.32 : 0, ctx.currentTime, 0.3); }
export function setMusicVolume(v) { vol = Math.max(0, Math.min(1, v)); applyVol(); }
export function setMusicOn(v) { on = v; applyVol(); }
// mode: "menu" (slow, sparse) or "race" (full band); a new song restarts from its first bar
export function setMusicMode(m, songIndex = song) {
  if (m === mode && songIndex === song) return;
  mode = m; song = ((songIndex % SONGS.length) + SONGS.length) % SONGS.length; step = 0;
  if (ctx) { nextT = Math.max(nextT, ctx.currentTime + 0.05); }
}
export const songName = () => SONGS[song].name;

function voice(type, f, t, dur, gain, { cut = 3000, q = 1, to = out, attack = 0.005, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = f; o.detune.value = detune; lp.type = "lowpass"; lp.frequency.value = cut; lp.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.05);
  return g;
}
function hit(t, dur, gain, type, freq) {
  const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function kick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
}

// seeded lead melody: 16 sixteenth-note slots per bar, chord tones and passing notes from the minor scale
function melody(s, bar, k) {
  let h = (s.seed * 9301 + bar * 49297 + k * 233280) % 233280; h = h / 233280;
  if (k % 2 === 1 && h < 0.6) return null; // mostly eighth notes
  if (h < 0.18) return null;
  const tones = triad(s.chords[bar % s.chords.length]), scale = [0, 2, 3, 5, 7, 8, 10];
  const r = tones[0] + 12;
  return h < 0.7 ? tones[Math.floor(h * 30) % 3] + 12 : r + scale[Math.floor(h * 70) % 7];
}

function schedule() {
  if (!ctx || ctx.state !== "running") return;
  const s = SONGS[song], race = mode === "race", bpm = race ? s.bpm : s.bpm * 0.75, sx = 60 / bpm / 4;
  delay.delayTime.value = sx * 3;
  while (nextT < ctx.currentTime + 0.12) {
    const t = nextT, k = step % 16, bar = Math.floor(step / 16), ch = s.chords[bar % s.chords.length], tones = triad(ch);
    const section = Math.floor(bar / 4) % 4; // 4-bar sections: intro, verse, chorus, breakdown
    if (on && vol > 0) {
      // pad: a soft chord at the start of every bar
      if (k === 0) tones.forEach((m, i) => { voice("sawtooth", mtof(m), t, sx * 16, race ? 0.05 : 0.07, { cut: race ? 1400 : 900, attack: 0.4, detune: i * 6 - 6 }); voice("sawtooth", mtof(m), t, sx * 16, 0.035, { cut: 1100, attack: 0.5, detune: 9 }); });
      // driving bass on eighths, octave jump on the offbeat
      if (race && k % 2 === 0) voice("sawtooth", mtof(ch[0] - 24 + (k % 4 === 2 ? 12 : 0)), t, sx * 1.8, 0.2, { cut: 520 + (k % 4 === 2 ? 300 : 0), q: 4 });
      else if (!race && k % 8 === 0) voice("triangle", mtof(ch[0] - 24), t, sx * 7, 0.22, { cut: 400 });
      // arpeggio through the chord, into the echo
      if ((race && section !== 0) || (!race && k % 4 === 0)) {
        const m = tones[k % 3] + (k % 6 < 3 ? 12 : 24);
        const g = voice(race ? "square" : "triangle", mtof(m), t, sx * 0.9, race ? 0.035 : 0.05, { cut: race ? 2600 : 1800 });
        g.connect(delay);
      }
      // drums
      if (race) {
        if (k % 4 === 0 && section !== 3) kick(t);
        if (k === 4 || k === 12) { hit(t, 0.18, 0.28, "bandpass", 1800); voice("triangle", 190, t, 0.1, 0.12); }
        if (k % 2 === 1 || section === 2) hit(t, 0.04, k % 4 === 2 ? 0.08 : 0.05, "highpass", 7500);
      } else if (k === 0 && bar % 2 === 0) kick(t);
      // lead in the chorus
      if (race && section === 2) {
        const m = melody(s, bar, k);
        if (m) voice("sawtooth", mtof(m), t, sx * 1.7, 0.05, { cut: 3200, detune: 4 }).connect(delay);
      }
    }
    nextT += sx; step++;
  }
}
