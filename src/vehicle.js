// Arcade car physics shared by the player and the rivals.
// The car keeps a world-space velocity and a heading. Steering turns the heading; tyre grip pulls the velocity
// back in line with it. When the heading turns faster than the grip can follow, the car slides: that's a drift.
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Vehicle {
  constructor(spec, track) {
    this.spec = spec; this.track = track;
    this.ctl = { steer: 0, brake: false, drift: false, boost: false, targetSpeed: Infinity };
    this.reset(0, 0);
  }

  reset(d, lat) {
    const p = this.track.pointAt(d, lat, {});
    this.x = p.x; this.z = p.z; this.y = p.y; this.h = p.h;
    this.vx = 0; this.vz = 0; this.vF = 0; this.vL = 0;
    this.yawRate = 0; this.steer = 0; this.latAcc = 0; this.lonAcc = 0;
    this.drifting = false; this.driftAngle = 0; this.driftTime = 0; this.driftScore = 0;
    this.boost = this.boost ?? 0.25; this.boosting = false;
    this.offTrack = false; this.wallHit = 0; this.stuckT = 0;
    this.hint = -1;
    this.track.project(this.x, this.z, -1, this.p = {});
    this.hint = this.p.i;
    this.lastD = this.p.d; this.totalD = d > this.track.length / 2 ? d - this.track.length : d;
    this.slope = 0; this.bank = 0; this.lat = this.p.lat;
  }

  // Put the car back on the racing line after getting stuck.
  respawn() {
    const t = this.track, d = this.p.d, i = this.p.i;
    const keepTotal = this.totalD, keepBoost = this.boost;
    this.reset(d, t.line[i] * 0.5);
    this.totalD = keepTotal; this.lastD = this.p.d; this.boost = keepBoost;
    this.vF = 18; this.vx = Math.sin(this.h) * 18; this.vz = Math.cos(this.h) * 18;
    this.respawnFlash = 1.2;
  }

  step(dt, active = true) {
    const s = this.spec, c = this.ctl, t = this.track;
    let fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -Math.cos(this.h), rz = Math.sin(this.h);
    let vF = this.vx * fx + this.vz * fz, vL = this.vx * rx + this.vz * rz;
    const p = t.project(this.x, this.z, this.hint, this.p); this.hint = p.i;
    const halfW = t.width / 2;
    this.offTrack = Math.abs(p.lat) > halfW + 0.7;
    const surf = this.offTrack ? 0.55 : 1;

    // steering input is smoothed; less lock at speed keeps it stable but responsive
    const sIn = active ? clamp(c.steer, -1, 1) : 0;
    this.steer += (sIn - this.steer) * Math.min(1, dt * (Math.abs(sIn) > Math.abs(this.steer) ? 9 : 12));

    // drift: holding drift while steering at speed breaks the rear loose
    const wantDrift = active && c.drift && Math.abs(this.steer) > 0.25 && vF > 18;
    if (wantDrift && !this.drifting) { this.drifting = true; this.driftDir = Math.sign(this.steer); this.yawRate += this.driftDir * 0.6; }
    // the slide holds while you keep steering into it (so a tap of drift is enough on a phone)
    const holding = c.drift || this.steer * (this.driftDir || 0) > 0.3;
    if (this.drifting && (!holding || vF < 12)) { if (Math.abs(this.driftAngle) < 0.3 || vF < 12) this.drifting = false; }

    // boost
    this.boosting = active && c.boost && this.boost > 0.01;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.3);

    // longitudinal
    const vmax = s.vmax * (this.offTrack ? 0.62 : 1) * (this.boosting ? 1.16 : 1);
    let a = active ? s.accel * Math.max(0, 1 - (vF / vmax) ** 2) : 0;
    if (this.boosting) a += s.boostPower;
    let decel = 0;
    if (active && (c.brake || (c.drift && Math.abs(this.steer) < 0.25)) && !this.drifting) decel = 30;
    if (vF > c.targetSpeed) decel = Math.max(decel, Math.min(26, (vF - c.targetSpeed) * 4));
    if (vF > vmax) decel = Math.max(decel, (vF - vmax) * 0.8);
    if (!active) decel = Math.max(decel, 10);
    const drag = 0.0009 * vF * vF + (this.offTrack ? 3 : 0) + Math.abs(vL) * 0.35;
    const gravity = -9.8 * this.slope * 0.6;
    const prevVF = vF;
    vF += (a - decel - drag + gravity) * dt;
    if (vF < 0) vF = active ? Math.max(vF, 0) : 0;
    this.lonAcc += ((vF - prevVF) / dt - this.lonAcc) * Math.min(1, dt * 6);

    // lateral grip
    const grip = s.grip * surf;
    let latCap = grip * (this.drifting ? 0.42 : 1);
    if (!this.drifting && vF > s.vmax * 0.85 && Math.abs(this.steer) > 0.7) latCap *= 0.82; // a little slide flat out
    const dvL = Math.min(Math.abs(vL), latCap * dt);
    vL -= Math.sign(vL) * dvL;

    // yaw: kinematic yaw from the steering, capped by what the grip can hold (unless drifting)
    const lock = 0.6 / (1 + Math.max(0, vF) * s.steerFalloff);
    const kin = Math.max(0, vF) * Math.tan(this.steer * lock) / 2.7;
    const limit = (grip * 1.05) / Math.max(6, vF);
    let target = clamp(kin, -limit, limit);
    if (this.drifting) {
      // hold a slide: steering into the drift keeps rotation going, counter-steer catches it
      const k = this.driftDir * this.steer; // +1 into the drift, -1 counter-steer
      target = this.driftDir * limit * (0.95 + 0.75 * clamp(k, -1, 1));
      if (Math.abs(this.driftAngle) > 0.75) target *= 0.4;
    }
    this.yawRate += (target - this.yawRate) * Math.min(1, dt * s.response);
    this.h = wrapA(this.h - this.yawRate * dt);
    this.latAcc += (vF * this.yawRate - this.latAcc) * Math.min(1, dt * 5);

    // rebuild world velocity in the old frame, so turning the heading leaves velocity behind (slip)
    this.vx = fx * vF + rx * vL; this.vz = fz * vF + rz * vL;
    this.x += this.vx * dt; this.z += this.vz * dt;

    fx = Math.sin(this.h); fz = Math.cos(this.h); rx = -Math.cos(this.h); rz = Math.sin(this.h);
    this.vF = this.vx * fx + this.vz * fz; this.vL = this.vx * rx + this.vz * rz;
    this.driftAngle = Math.atan2(this.vL, Math.max(1, Math.abs(this.vF)));
    if (Math.abs(this.driftAngle) > 0.14 && this.vF > 14 && !this.offTrack) {
      this.driftTime += dt; this.driftScore += dt * this.vF * 0.1;
      this.boost = Math.min(1, this.boost + dt * 0.16 * s.boostFill * Math.min(2, Math.abs(this.driftAngle) / 0.25));
    } else this.driftTime = 0;

    // barriers
    const q = t.project(this.x, this.z, this.hint, this.p); this.hint = q.i;
    const lim = halfW + t.runoff - 1.05;
    this.wallHit = 0;
    if (Math.abs(q.lat) > lim) {
      const sg = Math.sign(q.lat), over = Math.abs(q.lat) - lim;
      const trx = -Math.cos(q.h), trz = Math.sin(q.h);
      this.x -= trx * sg * over; this.z -= trz * sg * over;
      const vn = (this.vx * trx + this.vz * trz) * sg;
      if (vn > 0) {
        this.vx -= trx * sg * vn * 1.25; this.vz -= trz * sg * vn * 1.25;
        const scrub = 1 - Math.min(0.35, vn * 0.02);
        this.vx *= scrub; this.vz *= scrub; this.wallHit = vn;
        this.h = wrapA(this.h + wrapA(q.h - this.h) * Math.min(0.5, 0.1 + vn * 0.02));
        this.drifting = false;
      }
      q.lat = sg * lim;
    }
    this.lat = q.lat;
    this.y += (q.y - this.y) * Math.min(1, dt * 20);
    this.slope = q.slope; this.bank = q.bank;

    // progress along the track (handles the wrap at the line)
    let dd = q.d - this.lastD; const L = t.length;
    if (dd < -L / 2) dd += L; else if (dd > L / 2) dd -= L;
    this.totalD += dd; this.lastD = q.d;

    // stuck detection
    if (active && this.vF < 3) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 1.6) { this.stuckT = 0; this.respawn(); }
    if (this.respawnFlash) this.respawnFlash = Math.max(0, this.respawnFlash - dt);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
}
