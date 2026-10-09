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
export function cornerSpeed(v, t, margin = 1.06) {
  if (v.drifting) return Infinity;
  const prof = t.speedProfile(v.spec.grip * 1.1);
  let vt = Infinity; for (let k = 2; k < 30; k += 3) vt = Math.min(vt, prof[(v.p.i + k) % t.N]);
  return vt * margin;
}

// Blend the player's steering with the assist. strength 0..1 (0 = off).
export function assistSteer(v, t, input, strength) {
  if (!strength) return input;
  let out = input;
  // toward the racing line: strongest when the player isn't steering, light touch when they are
  const ls = lineSteer(v, t);
  out += (ls - input) * strength * (Math.abs(input) < 0.05 ? 0.6 : 0.2);
  // wall guard: predict where the car will be in ~0.7 s and steer away if that's near the barrier
  const trx = -Math.cos(v.p.h), trz = Math.sin(v.p.h);
  const latV = v.vx * trx + v.vz * trz;
  const ahead = v.lat + latV * 0.7, lim = t.width / 2 + t.runoff - 3.5;
  if (Math.abs(ahead) > lim && Math.sign(latV) === Math.sign(v.lat)) {
    const push = clamp((Math.abs(ahead) - lim) / 4, 0, 1) * strength * 1.6;
    out -= Math.sign(v.lat) * push; // positive lateral is the right-hand side, so steer left (negative)
  }
  return clamp(out, -1, 1);
}
