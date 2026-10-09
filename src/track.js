// Track geometry: a closed Catmull-Rom centre-line sampled every ~2 m, plus the queries the
// physics and AI need (nearest point, lateral offset, road height, racing line, speed profile).
import * as THREE from "three";

const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class TrackPath {
  constructor(def) {
    this.def = def;
    this.width = def.width || 14;
    this.runoff = def.runoff ?? 4;
    // control points are [x, z, y]
    const pts = def.points.map((p) => new THREE.Vector3(p[0], p[2] || 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);
    this.curve = curve;
    const length = curve.getLength();
    const N = Math.max(64, Math.round(length / 2));
    this.N = N; this.length = length; this.ds = length / N;
    const A = () => new Float32Array(N);
    this.x = A(); this.y = A(); this.z = A(); this.h = A(); this.curv = A(); this.cs = A(); this.bank = A();
    this.line = A(); this.slope = A(); this.tunnel = new Uint8Array(N); this.bridge = new Uint8Array(N);
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      curve.getPointAt(i / N, p); curve.getTangentAt(i / N, t);
      this.x[i] = p.x; this.y[i] = Math.max(0.06, p.y); this.z[i] = p.z;
      this.h[i] = Math.atan2(t.x, t.z);
    }
    // signed curvature: positive = right-hand bend (heading decreasing)
    for (let i = 0; i < N; i++) {
      const a = this.h[(i - 1 + N) % N], b = this.h[(i + 1) % N];
      this.curv[i] = -wrapA(b - a) / (2 * this.ds);
      this.slope[i] = (this.y[(i + 1) % N] - this.y[(i - 1 + N) % N]) / (2 * this.ds);
    }
    this.cs = this.smooth(this.curv, 6);
    const wide = this.smooth(this.curv, 14);
    const maxBank = def.banking ?? 0.12;
    const half = this.width / 2 - 2.2;
    for (let i = 0; i < N; i++) {
      this.bank[i] = Math.max(-maxBank, Math.min(maxBank, wide[i] * 9 * maxBank / 0.12));
      // racing line: hug the inside of bends (positive lateral = right side)
      const k = wide[i] * 260;
      this.line[i] = Math.max(-1, Math.min(1, k)) * half;
    }
    this.line = this.smooth(this.line, 10);
    for (const [a, b] of def.tunnels || []) for (let i = Math.floor(a * N); i < Math.floor(b * N); i++) this.tunnel[i % N] = 1;
    // optional height profile [[fraction, height], ...]: two entries at the same fraction make a cliff drop
    this.cliff = new Uint8Array(N);
    if (def.heights) {
      const H = def.heights;
      for (let i = 0; i < N; i++) {
        const f = i / N; let k = 0; while (k < H.length - 1 && H[k + 1][0] <= f) k++;
        const a = H[k], b = H[Math.min(k + 1, H.length - 1)];
        this.y[i] = Math.max(0.06, b[0] > a[0] ? a[1] + (b[1] - a[1]) * ((f - a[0]) / (b[0] - a[0])) : a[1]);
      }
      for (let i = 0; i < N; i++) {
        this.slope[i] = (this.y[(i + 1) % N] - this.y[(i - 1 + N) % N]) / (2 * this.ds);
        if (this.y[i] - this.y[(i + 1) % N] > 2.5) { this.cliff[i] = 1; this.slope[i] = 0; this.slope[(i + 1) % N] = 0; }
      }
    }
    // ramps: wedges on the road; the car leaves the ground at the lip
    this.ramps = (def.ramps || []).map((r) => ({ d: r.at * this.length, len: r.len || 16, h: r.h || 1.4, lat: r.lat || 0, half: r.half || this.width / 2 }));
    this.findBridges();
    this._profiles = new Map();
    this.out = { i: 0, t: 0, d: 0, lat: 0, y: 0, h: 0 };
  }

  smooth(arr, r) {
    const N = this.N, out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += arr[(i + k + N) % N];
      out[i] = s / (2 * r + 1);
    }
    return out;
  }

  // Samples that pass over another part of the track (figure-of-eight crossings) become bridges.
  findBridges() {
    const N = this.N, w = this.width + this.runoff * 2 + 4;
    for (let i = 0; i < N; i += 1) {
      if (this.y[i] < 4) continue;
      for (let j = 0; j < N; j += 2) {
        if (Math.abs(i - j) < 40 || this.y[i] - this.y[j] < 4) continue;
        const dx = this.x[i] - this.x[j], dz = this.z[i] - this.z[j];
        if (dx * dx + dz * dz < w * w * 1.6) { this.bridge[i] = 1; break; }
      }
    }
    // widen the bridge flags a little so the embankment doesn't clip the lower road
    const b = this.bridge.slice();
    for (let i = 0; i < N; i++) if (b[i]) for (let k = -8; k <= 8; k++) this.bridge[(i + k + N) % N] = 1;
  }

  // Extra height of any ramp at distance d and lateral offset lat.
  rampAt(d, lat) {
    for (const r of this.ramps) {
      if (Math.abs(lat - r.lat) > r.half) continue;
      let x = d - (r.d - r.len); if (x < 0) x += this.length;
      if (x >= 0 && x <= r.len) return r.h * (x / r.len);
    }
    return 0;
  }

  wrapD(d) { const L = this.length; return ((d % L) + L) % L; }

  // Position of the point at distance d along the track and lateral offset lat.
  pointAt(d, lat, out) {
    const f = this.wrapD(d) / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    const h = this.h[i] + wrapA(this.h[j] - this.h[i]) * t;
    const cx = this.x[i] + (this.x[j] - this.x[i]) * t, cz = this.z[i] + (this.z[j] - this.z[i]) * t;
    const cy = this.y[i] + (this.y[j] - this.y[i]) * t;
    const rx = -Math.cos(h), rz = Math.sin(h);
    const bank = this.bank[i] + (this.bank[j] - this.bank[i]) * t;
    out.x = cx + rx * lat; out.z = cz + rz * lat; out.y = cy - lat * Math.sin(bank); out.h = h;
    return out;
  }

  // Finds the nearest centre-line point to (x,z). hint = last known sample index (or -1 for a full search).
  project(x, z, hint = -1, out = this.out) {
    const N = this.N;
    let best = -1, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < N; i++) { const dx = x - this.x[i], dz = z - this.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    } else {
      for (let k = -14; k <= 14; k++) { const i = (hint + k + N) % N; const dx = x - this.x[i], dz = z - this.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    }
    // refine on the segment in front or behind
    let i = best, j = (best + 1) % N;
    let sx = this.x[j] - this.x[i], sz = this.z[j] - this.z[i];
    let t = ((x - this.x[i]) * sx + (z - this.z[i]) * sz) / (sx * sx + sz * sz);
    if (t < 0) { i = (best - 1 + N) % N; j = best; sx = this.x[j] - this.x[i]; sz = this.z[j] - this.z[i]; t = ((x - this.x[i]) * sx + (z - this.z[i]) * sz) / (sx * sx + sz * sz); }
    t = Math.max(0, Math.min(1, t));
    const h = this.h[i] + wrapA(this.h[j] - this.h[i]) * t;
    const cx = this.x[i] + sx * t, cz = this.z[i] + sz * t;
    const lat = (x - cx) * -Math.cos(h) + (z - cz) * Math.sin(h);
    const bank = this.bank[i] + (this.bank[j] - this.bank[i]) * t;
    out.i = i; out.t = t; out.d = (i + t) * this.ds; out.lat = lat; out.h = h;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t - Math.max(-this.width / 2 - this.runoff, Math.min(this.width / 2 + this.runoff, lat)) * Math.sin(bank);
    out.bank = bank; out.slope = this.slope[i]; out.tunnel = this.tunnel[i];
    return out;
  }

  // Maximum comfortable speed at each sample for a car with lateral grip `g` (m/s^2) and braking `brake`.
  speedProfile(g, brake = 26) {
    const key = Math.round(g * 10) + ":" + brake;
    if (this._profiles.has(key)) return this._profiles.get(key);
    const N = this.N, v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = Math.min(140, Math.sqrt(g / Math.max(1e-4, Math.abs(this.cs[i]))));
    for (let pass = 0; pass < 2; pass++) for (let k = 2 * N - 1; k >= 0; k--) {
      const i = k % N, j = (i + 1) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * this.ds));
    }
    this._profiles.set(key, v);
    return v;
  }
}
