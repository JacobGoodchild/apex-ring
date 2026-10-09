// Rule-based rival drivers. No learning, no network: each rival follows the racing line with its own personality,
// brakes from the track's speed profile, makes the odd mistake, overtakes, defends, and uses slipstream and boost.
import { makeRng } from "./rng.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export const RIVALS = [
  { name: "Mara Voss", style: "aggressive", color: 0xd7263d },
  { name: "Kenji Arata", style: "careful", color: 0x2e86ab },
  { name: "Lio Brandt", style: "inconsistent", color: 0xf4d35e },
  { name: "Sasha Quell", style: "aggressive", color: 0x7b2cbf },
  { name: "Tomas Reyes", style: "careful", color: 0x3bb273 },
  { name: "Ines Faro", style: "inconsistent", color: 0xff8c42 },
  { name: "Dev Okoro", style: "aggressive", color: 0xe9edf2 },
];

const STYLES = {
  aggressive: { pace: 1.0, brake: 1.04, mistake: 0.012, overtake: 1.0, defend: 0.8, boost: 0.9, wobble: 0.4 },
  careful: { pace: 0.975, brake: 0.95, mistake: 0.004, overtake: 0.45, defend: 0.3, boost: 0.5, wobble: 0.2 },
  inconsistent: { pace: 0.99, brake: 1.0, mistake: 0.03, overtake: 0.7, defend: 0.5, boost: 0.7, wobble: 0.9 },
};

export class Driver {
  constructor(vehicle, profile, skill, seed) {
    this.v = vehicle; this.name = profile.name; this.color = profile.color; this.style = profile.style;
    this.p = STYLES[profile.style]; this.skill = skill; this.rnd = makeRng(seed);
    this.lineBias = (this.rnd() - 0.5) * 1.6;
    this.passOff = 0; this.passT = 0; this.mistakeT = 0; this.mistake = null; this.phase = this.rnd() * 10;
  }

  // cars: every vehicle in the race (including the player); leaderGap: metres to the player (+ = ahead of player)
  think(dt, cars, gapToPlayer) {
    const v = this.v, t = v.track, P = this.p;
    this.phase += dt;

    // occasional mistakes: lift early or run wide for a moment
    if (this.mistakeT > 0) this.mistakeT -= dt;
    else if (this.rnd() < P.mistake * dt * 6) { this.mistake = this.rnd() < 0.5 ? "lift" : "wide"; this.mistakeT = 0.8 + this.rnd() * 1.2; }
    if (this.mistakeT <= 0) this.mistake = null;

    // look for traffic ahead (overtake) and behind (defend)
    let ahead = null, behind = null, slip = false;
    for (const o of cars) {
      if (o === v) continue;
      const dd = o.totalD - v.totalD, dl = o.lat - v.lat;
      if (dd > 0 && dd < 30 && Math.abs(dl) < 3.2 && (!ahead || dd < ahead.dd)) ahead = { o, dd, dl };
      if (dd < 0 && dd > -14 && (!behind || dd > behind.dd)) behind = { o, dd, dl };
      if (dd > 6 && dd < 35 && Math.abs(dl) < 2.4) slip = true;
    }
    v.draft = slip ? 1.045 : 1;
    const half = t.width / 2 - 1.6;
    if (ahead && ahead.o.vF < v.vF + 3 && this.passT <= 0 && this.rnd() < P.overtake * dt * 4) {
      // go round the side with more room
      const side = ahead.o.lat > 0 ? -1 : 1;
      this.passOff = side * 3.4; this.passT = 2.5;
    }
    if (this.passT > 0) { this.passT -= dt; if (this.passT <= 0) this.passOff = 0; }
    let defend = 0;
    if (!ahead && behind && behind.o.vF > v.vF - 2 && this.rnd() < P.defend) defend = clamp(behind.dl, -2, 2) * 0.5;

    // steering toward a point on the chosen line
    const look = Math.max(9, v.vF * 0.5);
    const i = Math.floor(t.wrapD(v.p.d + look) / t.ds) % t.N;
    let lat = t.line[i] * 0.85 + this.lineBias + this.passOff + defend + Math.sin(this.phase * 0.7) * P.wobble * 0.5;
    if (this.mistake === "wide") lat -= Math.sign(t.cs[i] || 1) * 3.5;
    lat = clamp(lat, -half, half);
    const tp = t.pointAt(v.p.d + look, lat, this._tp || (this._tp = {}));
    const want = Math.atan2(tp.x - v.x, tp.z - v.z);
    v.ctl.steer = clamp(wrapA(v.h - want) * 2.4, -1, 1);

    // braking points from the speed profile, scaled by style and skill
    const prof = t.speedProfile(v.spec.grip);
    let vt = Infinity;
    for (let k = 0; k < 44; k += 3) vt = Math.min(vt, prof[(v.p.i + k) % t.N]);
    let pace = P.pace * this.skill * P.brake;
    if (this.mistake === "lift") pace *= 0.86;
    // subtle rubber-banding so the pack stays together
    if (gapToPlayer > 120) pace *= 0.97; else if (gapToPlayer < -120) pace *= 1.03;
    v.ctl.targetSpeed = vt * Math.min(1.02, pace);
    v.spec.vmaxScale = pace;

    // boost on long straights
    let straight = Infinity; for (let k = 0; k < 60; k += 4) straight = Math.min(straight, prof[(v.p.i + k) % t.N]);
    v.ctl.boost = straight > v.spec.vmax * 0.95 && v.boost > 0.3 && this.rnd() < P.boost;
    if (!v.boosting) v.boost = Math.min(1, v.boost + dt * 0.02);
    v.ctl.drift = false; v.ctl.brake = false;
  }
}

// Push overlapping cars apart. Works in track space (distance along, lateral), which is cheap and stable.
export function collide(cars, onHit) {
  for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
    const A = cars[a], B = cars[b];
    const dd = B.totalD - A.totalD, dl = B.lat - A.lat;
    if (Math.abs(dd) > 4.6 || Math.abs(dl) > 2.1) continue;
    const ol = 4.6 - Math.abs(dd), ow = 2.1 - Math.abs(dl);
    const rx = -Math.cos(A.p.h), rz = Math.sin(A.p.h);
    if (ow * 2.2 < ol) {
      // side by side: push apart sideways
      const s = Math.sign(dl) || 1, k = ow / 2 + 0.02;
      A.x -= rx * s * k; A.z -= rz * s * k; B.x += rx * s * k; B.z += rz * s * k;
      const rel = (B.vx - A.vx) * rx + (B.vz - A.vz) * rz;
      if (rel * s < 0) { const j = rel * 0.5; A.vx += rx * j; A.vz += rz * j; B.vx -= rx * j; B.vz -= rz * j; }
      if (onHit) onHit(A, B, Math.abs(rel));
    } else {
      // nose to tail: the car behind loses speed, the one in front gets a nudge
      const [back, front] = dd > 0 ? [A, B] : [B, A];
      const fx = Math.sin(back.h), fz = Math.cos(back.h);
      const rel = back.vF - front.vF;
      back.x -= fx * ol * 0.6; back.z -= fz * ol * 0.6; front.x += fx * ol * 0.4; front.z += fz * ol * 0.4;
      if (rel > 0) {
        back.vx -= fx * rel * 0.6; back.vz -= fz * rel * 0.6; front.vx += fx * rel * 0.3; front.vz += fz * rel * 0.3;
        if (onHit) onHit(back, front, rel);
      }
    }
  }
}
