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
    this.x = p.x; this.z = p.z; this.y = p.y; this.h = p.h; this.vy = 0; this.airborne = false; this.groundPrev = null; this.landed = 0; this.slingT = 0; this.airT = 0; this.airDone = 0;
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
    const surf = (this.offTrack ? 0.8 : 1) * t.surfaceAt(p.d, p.lat); // run-off is grippy enough to recover on; oil and water aren't
    this.onOil = surf < 0.5;
    if (this.onOil && active && vF > 20) this.yawRate += Math.sin(this.totalD * 0.9) * 0.5 * dt; // the tail wriggles on oil

    // steering input is smoothed; less lock at speed keeps it stable but responsive
    const sIn = active ? clamp(c.steer, -1, 1) : 0;
    this.steer += (sIn - this.steer) * Math.min(1, dt * (Math.abs(sIn) > Math.abs(this.steer) ? 9 : 12));

    // automatic drift: steering hard at speed asks for more turn than the tyres give, so the car slides into a
    // controlled drift that actually turns a little tighter (it makes corners easier, not harder)
    const bend = t.cs[p.i] || 0; // only in real corners, steering into the bend (not swerves on a straight)
    const pro = !!c.pro;
    // Pro: the handbrake kicks the tail out on demand (any bend or none), at a decent speed with some steering
    if (active && pro && c.handbrake && !this.drifting && vF > 14 && Math.abs(this.steer) > 0.2) { this.drifting = true; this.driftDir = Math.sign(this.steer); this.yawRate += this.driftDir * 0.35; }
    const demand = !pro && Math.abs(this.steer) > 0.55 && vF > s.vmax * 0.5 && Math.abs(bend) > 0.004 && Math.sign(bend) === Math.sign(this.steer) && Math.abs(this.yawRate) > (s.grip * 0.9) / Math.max(6, vF);
    if (active && demand && !this.drifting) { this.drifting = true; this.driftDir = Math.sign(this.steer); this.yawRate += this.driftDir * 0.3; }
    if (this.drifting && !(pro && c.handbrake) && (this.steer * this.driftDir < 0.35 || vF < s.vmax * 0.35 || !active)) this.drifting = false;
    if (this.drifting && pro && c.handbrake && (vF < 10 || this.steer * this.driftDir < -0.2)) this.drifting = false;

    // boost: a tap fires a burst that lasts up to 2.5 s while the meter has charge
    const drain = 0.3 / (s.boostDur || 1); // a longer boost duration spends the meter more slowly
    if (active && c.boost && this.boost > 0.12 && !(this.boostT > 0)) this.boostT = Math.min(2.5 * (s.boostDur || 1), this.boost / drain);
    c.boost = false;
    if (this.boostT > 0) this.boostT -= dt;
    // a slipstream slingshot is a free burst that doesn't spend the meter
    const sling = active && this.slingT > 0; if (this.slingT > 0) this.slingT -= dt;
    const metered = active && this.boostT > 0 && this.boost > 0.01;
    this.boosting = metered || sling;
    if (metered) this.boost = Math.max(0, this.boost - dt * drain); else this.boostT = 0;

    // longitudinal
    const vmax = s.vmax * (this.offTrack ? 0.82 : 1) * (this.boosting ? 1.16 : 1) * (this.draft || 1);
    let a = active && !this.airborne ? s.accel * Math.max(0, 1 - (vF / vmax) ** 2) * (pro ? c.throttle || 0 : 1) : 0;
    if (this.boosting) a += s.boostPower;
    let decel = 0;
    if (pro) {
      // manual: brake pedal, engine braking when off the throttle, and the handbrake scrubs a little speed
      if (!this.airborne) decel = (c.brake || 0) * 28 + (c.throttle ? 0 : 2.5) + (c.handbrake ? 5 : 0);
    } else if (vF > c.targetSpeed && !this.airborne) decel = Math.max(decel, Math.min(26, (vF - c.targetSpeed) * 4));
    if (vF > vmax) decel = Math.max(decel, (vF - vmax) * 0.8);
    if (!active) decel = Math.max(decel, 10);
    const drag = 0.0009 * vF * vF + (this.offTrack ? 1.2 : 0) + Math.abs(vL) * (this.drifting ? 0.08 : 0.2);
    const gravity = -9.8 * this.slope * 0.6;
    const prevVF = vF;
    vF += (a - decel - drag + gravity) * dt;
    if (vF < 0) vF = active ? Math.max(vF, 0) : 0;
    this.lonAcc += ((vF - prevVF) / dt - this.lonAcc) * Math.min(1, dt * 6);

    // lateral grip
    const grip = s.grip * surf * (this.airborne ? 0.08 : 1);
    let latCap = grip * (this.drifting ? 1.02 * (s.driftGrip || 1) : 1); // drifting tyres still bite, so the slide doesn't run wide
    if (!this.drifting && vF > s.vmax * 0.85 && Math.abs(this.steer) > 0.7) latCap *= 0.82; // a little slide flat out
    const dvL = Math.min(Math.abs(vL), latCap * dt);
    vL -= Math.sign(vL) * dvL;

    // yaw: kinematic yaw from the steering, capped by what the grip can hold (unless drifting)
    const lock = 0.6 / (1 + Math.max(0, vF) * s.steerFalloff);
    const kin = Math.max(0, vF) * Math.tan(this.steer * lock) / 2.7;
    const limit = (grip * 1.05) / Math.max(6, vF);
    let target = clamp(kin, -limit, limit);
    if (this.drifting) {
      // in a drift the car rotates a bit more than grip alone allows; the slide angle is capped so it never spins
      target = this.driftDir * limit * (1.15 + 0.35 * clamp(Math.abs(this.steer), 0, 1));
      if (Math.abs(this.driftAngle) > 0.3) target = this.driftDir * limit * 0.85; // hold the angle, never spin
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
        // glance off: lose the part of the velocity going into the wall (plus a small bounce), keep the rest
        this.vx -= trx * sg * vn * 1.15; this.vz -= trz * sg * vn * 1.15;
        const scrub = 1 - Math.min(0.1, vn * 0.006);
        this.vx *= scrub; this.vz *= scrub; this.wallHit = vn;
        // swing the nose back along the wall so the car carries on rather than grinding
        const hf = Math.abs(wrapA(q.h - this.h)) < Math.PI / 2 ? q.h : q.h + Math.PI;
        this.h = wrapA(this.h + wrapA(hf - this.h) * Math.min(0.75, 0.35 + vn * 0.03));
        this.yawRate *= 0.3;
        this.drifting = false;
      }
      q.lat = sg * lim;
    }
    this.lat = q.lat;
    // vertical: gravity, sitting exactly on the road, flying off ramp lips, crests and cliffs
    const ground = q.y + t.rampAt(q.d, q.lat);
    if (this.groundPrev == null) this.groundPrev = ground;
    this.vy -= 15.7 * dt; // arcade gravity (1.6 g) so jumps stay short and punchy
    this.y += this.vy * dt;
    this.landed = 0; this.airDone = 0;
    if (this.airborne) this.airT += dt;
    if (this.y <= ground) {
      if (this.airborne) { this.airDone = this.airT; this.airT = 0; }
      if (this.airborne && this.vy < -3) { this.landed = -this.vy; this.vx *= 0.98; this.vz *= 0.98; }
      this.y = ground;
      this.vy = Math.min(14, Math.max(-14, (ground - this.groundPrev) / dt));
      this.airborne = false;
    } else if (this.y > ground + 0.08) this.airborne = true;
    this.groundPrev = ground;
    this.slope = q.slope; this.bank = q.bank;

    // progress along the track (handles the wrap at the line)
    let dd = q.d - this.lastD; const L = t.length;
    if (dd < -L / 2) dd += L; else if (dd > L / 2) dd -= L;
    this.totalD += dd; this.lastD = q.d;

    // stuck detection
    if (active && this.vF < 3 && !(pro && !c.throttle)) this.stuckT += dt; else this.stuckT = 0; // a Pro driver standing still on purpose is not stuck
    if (this.stuckT > 1.6) { this.stuckT = 0; this.respawn(); }
    if (this.respawnFlash) this.respawnFlash = Math.max(0, this.respawnFlash - dt);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
}
