// Ghost car for time trials: records your lap 10 times a second and replays your best one as a see-through car.
import * as THREE from "three";

const RATE = 10;

export class Ghost {
  constructor(model, color = 0x7fe3ff) {
    this.model = model;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false });
    model.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    model.group.visible = false;
    this.rec = []; this.data = null; this.nextT = 0;
  }

  startLap() { this.rec = []; this.nextT = 0; }

  // t = time into the current lap
  record(t, v) {
    if (t < this.nextT) return;
    this.nextT += 1 / RATE;
    this.rec.push(Math.round(v.x * 10) / 10, Math.round(v.y * 10) / 10, Math.round(v.z * 10) / 10, Math.round(v.h * 100) / 100);
  }

  // Finished lap: returns the recording if it should be kept.
  lapDone(lapTime) { const out = { t: Math.round(lapTime * 1000) / 1000, s: this.rec }; this.rec = []; this.nextT = 0; return out; }

  load(data) { this.data = data && data.s && data.s.length >= 8 ? data : null; }

  update(t, show) {
    const g = this.model.group, d = this.data;
    if (!show || !d) { g.visible = false; return; }
    const n = d.s.length / 4, f = Math.min(n - 1.001, t * RATE), i = Math.floor(f), k = f - i, s = d.s;
    if (t > d.t + 0.5) { g.visible = false; return; }
    const a = i * 4, b = Math.min(n - 1, i + 1) * 4;
    let dh = s[b + 3] - s[a + 3]; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
    g.position.set(s[a] + (s[b] - s[a]) * k, s[a + 1] + (s[b + 1] - s[a + 1]) * k, s[a + 2] + (s[b + 2] - s[a + 2]) * k);
    g.rotation.set(0, s[a + 3] + dh * k, 0);
    g.visible = true;
  }
}
