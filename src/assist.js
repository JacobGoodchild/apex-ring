// Driver aids shared by the game and the tests: auto-brake for corners, and a gentle steering assist that
// keeps the car off the walls and nudges it toward the racing line without taking over.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const tp = {};

// Steering that would follow the racing line (what a tidy driver would do right now).
export function lineSteer(v, t, lineScale = 0.85) {
  const look = Math.max(12, v.vF * 0.6);
  const i = Math.floor(t.wrapD(v.p.d + look) / t.ds) % t.N;
  t.pointAt(v.p.d + look, t.line[i] * lineScale, tp);
  return clamp(wrapA(v.h - Math.atan2(tp.x - v.x, tp.z - v.z)) * 2.2, -1, 1);
}

// Target speed for the auto-brake. margin > 1 brakes later (harder), < 1 earlier (safer).
// guard > 0 also lifts when the car is heading for a barrier it can't turn away from in time.
export function cornerSpeed(v, t, margin = 1.06, guard = 0) {
  const prof = t.speedProfile(v.spec.grip * 1.1);
  let vt = Infinity; for (let k = 2; k < 30; k += 3) vt = Math.min(vt, prof[(v.p.i + k) % t.N]);
  vt *= margin;
  if (guard) {
    const trx = -Math.cos(v.p.h), trz = Math.sin(v.p.h), latV = v.vx * trx + v.vz * trz;
    const room = t.width / 2 + t.runoff - 2 - Math.abs(v.lat);
    if (Math.sign(latV) === Math.sign(v.lat) && Math.abs(latV) > 1 && room / Math.abs(latV) < 0.8) vt = Math.min(vt, v.vF * (1 - 0.25 * guard));
  }
  return vt;
}

// Blend the player's steering with the assist. strength 0..1 (0 = off).
// The assist only shapes steering the player is already doing: with no input the car simply goes straight.
export function assistSteer(v, t, input, strength) {
  if (!strength || Math.abs(input) < 0.05) return input;
  let out = input;
  // a light pull toward the racing line while you steer
  const ls = lineSteer(v, t);
  // heading limiter: you can't swing the nose much more than ~15-20 degrees off the track's direction,
  // which stops a late correction turning into a weave from wall to wall
  const hErr = wrapA(v.h - v.p.h); // > 0: pointing left of the track
  const away = input < 0 ? hErr : -hErr; // how far the current input is pushing the nose away
  if (away > 0.12) input *= Math.max(0, 1 - (away - 0.12) / (0.18 / Math.max(0.3, strength * 1.8)));
  out = input;
  const fighting = Math.abs(input) > 0.05 && Math.sign(input) !== Math.sign(ls) && Math.abs(ls) > 0.2;
  out += (ls - input) * strength * (fighting ? 0.45 : 0.2);
  // wall guard (only while steering): if your steering is taking you into the barrier within ~0.7 s, ease it off
  const trx = -Math.cos(v.p.h), trz = Math.sin(v.p.h);
  const latV = v.vx * trx + v.vz * trz;
  const ahead = v.lat + latV * 0.7, lim = t.width / 2 + t.runoff - 3.5;
  if (Math.abs(ahead) > lim && Math.sign(latV) === Math.sign(v.lat)) {
    const push = clamp((Math.abs(ahead) - lim) / 4, 0, 1) * strength * 1.6;
    out -= Math.sign(v.lat) * push; // positive lateral is the right-hand side, so steer left (negative)
  }
  return clamp(out, -1, 1);
}

// Touch steering is on/off, so build the lock up progressively (slower at speed) and let it go quickly.
// state is any object; returns the smoothed steering value.
export function smoothSteer(state, raw, vF, vmax, dt) {
  const cur = state.s || 0, f = Math.min(1, Math.max(0, vF / vmax));
  const toward = Math.abs(raw) > Math.abs(cur) && Math.sign(raw) !== -Math.sign(cur);
  const rate = toward ? 5 - 3 * f : 10;
  state.s = cur + (raw - cur) * Math.min(1, dt * rate);
  return state.s;
}
