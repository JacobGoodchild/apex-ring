// Visual effects: skid marks, tyre smoke, exhaust flames and speed lines. Each is a single draw call.
import * as THREE from "three";
import { softDot } from "./textures.js";

// Skid marks: a ring buffer of quads laid on the road behind sliding wheels.
export class Skids {
  constructor(scene, max = 1400) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 6 * 3); this.alpha = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
      vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA*0.55); }",
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.last = new Map();
  }
  // key identifies a wheel; (x,y,z) its contact point; h car heading; on = sliding this frame
  mark(key, x, y, z, h, strength) {
    const prev = this.last.get(key);
    if (strength <= 0) { this.last.delete(key); return; }
    this.last.set(key, { x, y, z });
    if (!prev) return;
    const dx = x - prev.x, dz = z - prev.z; if (dx * dx + dz * dz < 0.04) { this.last.set(key, prev); return; }
    const w = 0.16, rx = -Math.cos(h) * w, rz = Math.sin(h) * w;
    const i = this.n % this.max, o = i * 18, yy = y + 0.04, py = prev.y + 0.04;
    const P = this.pos, q = [prev.x - rx, py, prev.z - rz, prev.x + rx, py, prev.z + rz, x + rx, yy, z + rz, prev.x - rx, py, prev.z - rz, x + rx, yy, z + rz, x - rx, yy, z - rz];
    for (let k = 0; k < 18; k++) P[o + k] = q[k];
    for (let k = 0; k < 6; k++) this.alpha[i * 6 + k] = Math.min(1, strength);
    this.n++;
    const a = this.geo.attributes.position, b = this.geo.attributes.alpha;
    a.needsUpdate = true; b.needsUpdate = true;
    this.geo.setDrawRange(0, Math.min(this.n, this.max) * 6);
  }
  clear() { this.n = 0; this.alpha.fill(0); this.geo.attributes.alpha.needsUpdate = true; this.geo.setDrawRange(0, 0); this.last.clear(); }
}

// Tyre smoke: pooled soft sprites that grow and fade.
export class Smoke {
  constructor(scene, max = 180) {
    this.max = max; this.i = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max);
    this.size = new Float32Array(max); this.a = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: softDot("235,235,240") }, scale: { value: 400 } },
      vertexShader: "attribute float size; attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/-mv.z; gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform sampler2D map; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.82), t.a*vA*0.5); }",
    });
    this.mat = m;
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vz, amount = 1) {
    const i = this.i++ % this.max;
    this.p[i * 3] = x + (Math.random() - 0.5) * 0.4; this.p[i * 3 + 1] = y + 0.25; this.p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
    this.v[i * 3] = vx * 0.25 + (Math.random() - 0.5) * 1.5; this.v[i * 3 + 1] = 0.6 + Math.random() * 0.8; this.v[i * 3 + 2] = vz * 0.25 + (Math.random() - 0.5) * 1.5;
    this.life[i] = 1; this.size[i] = 0.8; this.a[i] = Math.min(1, amount);
  }
  update(dt, viewportH) {
    this.mat.uniforms.scale.value = viewportH * 0.9;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.a[i] = 0; continue; }
      this.life[i] -= dt * 0.9;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.v[i * 3] *= 1 - dt * 1.5; this.v[i * 3 + 2] *= 1 - dt * 1.5;
      this.size[i] += dt * 3.2; this.a[i] = Math.max(0, this.life[i]) * (this.a[i] > 0 ? 1 : 0) * 0.9 + 0.0001;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.size.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
}

// Exhaust flames for boost, attached to a car model.
// Boost flame colours (outer flame; the core stays white-hot).
export const TRAILS = [{ name: "Ice blue", hex: 0x4cc9f0 }, { name: "Inferno", hex: 0xff6a2a }, { name: "Toxic", hex: 0x7dff4a }, { name: "Magenta", hex: 0xff3fd2 }, { name: "Violet", hex: 0x9d6bff }, { name: "Ghost", hex: 0xe8f4ff }];
export function setTrail(model, idx) { if (model.flameOuter) model.flameOuter.color.setHex(TRAILS[idx % TRAILS.length].hex); }
export function addFlames(model) {
  const g = new THREE.ConeGeometry(0.13, 0.9, 10, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.45);
  const outer = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const p of model.exhaust) {
    const f = new THREE.Group(); f.position.copy(p);
    const o = new THREE.Mesh(g, outer); const i = new THREE.Mesh(g, inner); i.scale.set(0.5, 0.5, 0.6);
    f.add(o, i); f.visible = false; model.body.add(f); flames.push(f);
  }
  model.flames = flames; model.flameOuter = outer;
}
export function updateFlames(model, on, t) {
  if (!model.flames) return;
  for (const f of model.flames) {
    f.visible = on;
    if (on) { const k = 0.8 + Math.sin(t * 60 + f.position.x * 10) * 0.15 + Math.random() * 0.2; f.scale.set(1, 1, k * 1.4); }
  }
}

// Speed lines: streaks in a tube around the camera that rush past at high speed or under boost.
// Rain: streaks in a box that travels with the camera. Each drop falls, and the streak leans with the car's
// motion so it rushes at you at speed. One draw call.
export class Rain {
  constructor(scene, n = 900) {
    this.n = n; this.p = new Float32Array(n * 3); this.box = 28;
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() * 2 - 1) * this.box; this.p[i * 3 + 1] = Math.random() * 22; this.p[i * 3 + 2] = (Math.random() * 2 - 1) * this.box; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc4ced6, transparent: true, opacity: 0.2, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false; scene.add(this.lines); this.geo = g;
  }
  update(dt, cam, vx, vz) {
    if (!this.lines.visible) return;
    const P = this.p, out = this.geo.attributes.position.array, B = this.box, fall = 24;
    for (let i = 0; i < this.n; i++) {
      let x = P[i * 3], y = P[i * 3 + 1] - fall * dt, z = P[i * 3 + 2];
      x -= vx * dt; z -= vz * dt; // the car drives through the rain
      if (y < -2) y += 24; if (x < -B) x += 2 * B; else if (x > B) x -= 2 * B; if (z < -B) z += 2 * B; else if (z > B) z -= 2 * B;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      const k = i * 6, wx = cam.x + x, wy = cam.y + y - 6, wz = cam.z + z;
      out[k] = wx; out[k + 1] = wy; out[k + 2] = wz;
      out[k + 3] = wx + vx * 0.02 + 0.05; out[k + 4] = wy + 0.7; out[k + 5] = wz + vz * 0.02;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class SpeedLines {
  constructor(camera, n = 70) {
    this.n = n; const pos = new Float32Array(n * 6); this.seed = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 2.6 + Math.random() * 3; this.seed.push({ a, r, z: -Math.random() * 30, len: 1.5 + Math.random() * 3 }); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; this.lines.renderOrder = 10;
    camera.add(this.lines); this.geo = g;
  }
  update(dt, speed, amount) {
    this.mat.opacity += (amount * 0.3 - this.mat.opacity) * Math.min(1, dt * 5);
    this.lines.visible = this.mat.opacity > 0.01;
    if (!this.lines.visible) return;
    const P = this.geo.attributes.position.array;
    this.seed.forEach((s, i) => {
      s.z += speed * dt * 1.4; if (s.z > 0) { s.z -= 30; s.a = Math.random() * Math.PI * 2; }
      const x = Math.cos(s.a) * s.r, y = Math.sin(s.a) * s.r * 0.7;
      P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = s.z; P[i * 6 + 3] = x; P[i * 6 + 4] = y; P[i * 6 + 5] = s.z - s.len;
    });
    this.geo.attributes.position.needsUpdate = true;
  }
}

// Fake headlight beams for night tracks: two soft additive cones and a glow pool on the road. No real lights (cheap).
let beamTex = null;
export function addBeams(model) {
  if (!beamTex) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128; const g = c.getContext("2d");
    const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, "rgba(255,244,214,0)"); r.addColorStop(0.7, "rgba(255,244,214,.12)"); r.addColorStop(1, "rgba(255,244,214,.26)");
    g.fillStyle = r; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.lineTo(40, 128); g.lineTo(24, 128); g.closePath(); g.fill();
    beamTex = new THREE.CanvasTexture(c); beamTex.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const geo = new THREE.PlaneGeometry(10, 22); geo.rotateX(Math.PI / 2); geo.translate(0, 0.06, 13.2);
  const pool = new THREE.Mesh(geo, mat);
  const grp = new THREE.Group(); grp.add(pool); model.group.add(grp); model.beams = grp;
}

// Soft contact shadow: a dark blurred patch under each car so it sits on the road (cheap, works without shadow maps).
let blobTex = null;
export function addContactShadow(model) {
  if (!blobTex) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128; const g = c.getContext("2d");
    const r = g.createRadialGradient(32, 64, 4, 32, 64, 60); r.addColorStop(0, "rgba(0,0,0,.62)"); r.addColorStop(0.55, "rgba(0,0,0,.4)"); r.addColorStop(1, "rgba(0,0,0,0)");
    g.save(); g.scale(1, 1); g.fillStyle = r; g.fillRect(0, 0, 64, 128); g.restore();
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, fog: true }));
  m.position.y = 0.04; m.renderOrder = 1; model.group.add(m); model.blob = m;
}
// keep the shadow on the ground under a jumping car, fading as it climbs
export function updateContactShadow(model, carY, groundY) {
  if (!model.blob) return;
  const up = Math.max(0, carY - groundY);
  model.blob.position.y = 0.04 - up; model.blob.material.opacity = Math.max(0, 1 - up / 6);
  const k = 1 + up * 0.08; model.blob.scale.set(k, 1, k);
}
