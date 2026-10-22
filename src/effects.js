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
export function setTrail(model, idx) { if (model.flameMat) model.flameMat.uniforms.uColor.value.setHex(TRAILS[idx % TRAILS.length].hex); }
// Exhaust flames: three crossed planes per pipe with a flame shader (a white-hot core at the nozzle, the trail colour around it,
// a flickering turbulent edge, shock diamonds when boosting) and a soft glow at the nozzle. Short orange pops on lift-off.
const FLAME_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAME_FS = `uniform float uTime, uPower, uPop, uSeed; uniform vec3 uColor; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float v = vUv.y, x = vUv.x - 0.5;
  float len = mix(uPower, 0.45, uPop);
  if (v > len) discard;
  float s = v / len;
  float n = n2(vec2(x * 6.0 + uSeed, s * 6.0 - uTime * 22.0)) * 0.6 + n2(vec2(x * 14.0, s * 14.0 - uTime * 37.0)) * 0.4;
  float w = mix(0.44, 0.05, pow(s, 0.6)) * (0.6 + 0.8 * n);
  float d = abs(x) / max(w, 0.001);
  float body = smoothstep(1.0, 0.2, d) * smoothstep(1.0, 0.35 + 0.5 * n, s) * smoothstep(0.0, 0.04, s);
  float core = smoothstep(0.55, 0.0, d) * smoothstep(0.5, 0.0, s);
  float diamonds = (1.0 - uPop) * smoothstep(0.6, 1.0, uPower) * (0.5 + 0.5 * cos(s * 34.0)) * smoothstep(0.7, 0.1, s) * smoothstep(0.6, 0.0, d) * 0.6;
  vec3 hot = vec3(1.0, 0.97, 0.88);
  vec3 popc = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.4), core);
  vec3 c = mix(mix(uColor * 1.1, hot, core * 0.9), popc, uPop) + hot * diamonds;
  c = mix(c, uColor * 0.6, smoothstep(0.5, 1.0, s) * (1.0 - uPop));
  gl_FragColor = vec4(c, clamp(body * (0.9 + 0.4 * core) + diamonds, 0.0, 1.0));
}`;
let flameGeo = null, glowTex = null;
export function addFlames(model) {
  if (!flameGeo) {
    // three planes through the flame's axis (z from the nozzle backwards), so it has body from every angle
    const one = new THREE.PlaneGeometry(0.75, 1.25); one.translate(0, 0.625, 0); one.rotateX(-Math.PI / 2); // v runs along -z: backwards out of the pipe
    const parts = [0, Math.PI / 3, (2 * Math.PI) / 3].map((r) => one.clone().rotateZ(r));
    const pos = [], uv = [], idx = []; let off = 0;
    for (const g of parts) { pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); idx.push(...g.index.array.map((i) => i + off)); off += g.attributes.position.count; }
    flameGeo = new THREE.BufferGeometry(); flameGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); flameGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); flameGeo.setIndex(idx);
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 }, uPop: { value: 0 }, uSeed: { value: Math.random() * 10 }, uColor: { value: new THREE.Color(0x4cc9f0) } } });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x9fe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const p of model.exhaust) {
    const f = new THREE.Group(); f.position.copy(p);
    const m = new THREE.Mesh(flameGeo, mat); m.frustumCulled = false; f.add(m);
    const glow = new THREE.Sprite(glowMat); glow.scale.set(0.7, 0.7, 1); glow.position.z = -0.12; f.add(glow);
    f.visible = false; model.body.add(f); flames.push(f);
  }
  model.flames = flames; model.flameMat = mat; model.flameGlow = glowMat; model.popT = 0;
}
// on: boosting; pop: lifting off the throttle at speed (short orange pops now and then)
export function updateFlames(model, on, t, pop = false, dt = 1 / 60) {
  if (!model.flames) return;
  if (pop && !on && model.popT <= 0 && Math.random() < 0.06) model.popT = 0.07 + Math.random() * 0.06;
  model.popT -= dt;
  const popping = !on && model.popT > 0, vis = on || popping;
  const U = model.flameMat.uniforms;
  U.uTime.value = t; U.uPop.value = popping ? 1 : 0;
  U.uPower.value = on ? 0.78 + Math.sin(t * 47) * 0.08 + Math.random() * 0.16 : 0.55;
  model.flameGlow.color.copy(popping ? new THREE.Color(0xffa040) : U.uColor.value).lerp(new THREE.Color(0xffffff), 0.35);
  for (const f of model.flames) { f.visible = vis; if (vis) f.scale.setScalar(on ? 1 + Math.random() * 0.08 : 0.8); }
  return popping && model.popT > 0.05; // true on the first frame of a pop (for the crackle sound)
}

// Speed lines: streaks in a tube around the camera that rush past at high speed or under boost.
// Rain: streaks in a box that travels with the camera. Each drop falls, and the streak leans with the car's
// motion so it rushes at you at speed. One draw call.
export class Rain {
  constructor(scene, n = 900, snow = false) {
    this.n = n; this.p = new Float32Array(n * 3); this.box = snow ? 18 : 28; this.snow = snow; this.t = 0;
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() * 2 - 1) * this.box; this.p[i * 3 + 1] = Math.random() * (snow ? 12 : 22); this.p[i * 3 + 2] = (Math.random() * 2 - 1) * this.box; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * (snow ? 3 : 6)), 3).setUsage(THREE.DynamicDrawUsage));
    if (snow) {
      // snow: tiny white specks in one instanced mesh, so near flakes look bigger than far ones; only the translation
      // part of each instance matrix is written per frame
      const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xf4f8ff }), n);
      for (let i = 0; i < n; i++) im.setMatrixAt(i, new THREE.Matrix4());
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.lines = im;
    } else this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc4ced6, transparent: true, opacity: 0.2, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false; scene.add(this.lines); this.geo = g; this.out = snow ? this.lines.instanceMatrix.array : null;
  }
  update(dt, cam, vx, vz) {
    if (!this.lines.visible) return;
    const P = this.p, out = this.snow ? this.out : this.geo.attributes.position.array, B = this.box, fall = this.snow ? 3.2 : 24;
    this.t += dt;
    for (let i = 0; i < this.n; i++) {
      let x = P[i * 3], y = P[i * 3 + 1] - fall * dt, z = P[i * 3 + 2];
      x -= vx * dt; z -= vz * dt; // the car drives through the rain
      if (this.snow) x += Math.sin(this.t * 0.9 + i) * dt * 0.8; // flakes drift
      if (y < -2) y += this.snow ? 14 : 24; if (x < -B) x += 2 * B; else if (x > B) x -= 2 * B; if (z < -B) z += 2 * B; else if (z > B) z -= 2 * B;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      const wx = cam.x + x, wy = cam.y + y - (this.snow ? 4 : 6), wz = cam.z + z;
      if (this.snow) { const k = i * 16 + 12; out[k] = wx; out[k + 1] = wy; out[k + 2] = wz; continue; }
      const k = i * 6;
      out[k] = wx; out[k + 1] = wy; out[k + 2] = wz;
      out[k + 3] = wx + vx * 0.02 + 0.05; out[k + 4] = wy + 0.7; out[k + 5] = wz + vz * 0.02;
    }
    if (this.snow) this.lines.instanceMatrix.needsUpdate = true; else this.geo.attributes.position.needsUpdate = true;
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

// Sparks: short glowing streaks thrown off when a car scrapes a wall. One draw call (line segments), pooled.
export class Sparks {
  // streaks (line segments, white-hot fading to orange) plus a glowing head on each spark, so they read on a phone screen
  constructor(scene, max = 420) {
    this.max = max; this.i = 0; this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.life0 = new Float32Array(max);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false; scene.add(this.lines); this.geo = g;
    const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    hg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const dot = document.createElement("canvas"); dot.width = dot.height = 32;
    const c = dot.getContext("2d"), gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,220,150,.8)"); gr.addColorStop(1, "rgba(255,120,30,0)");
    c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
    this.heads = new THREE.Points(hg, new THREE.PointsMaterial({ size: 0.32, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.heads.frustumCulled = false; scene.add(this.heads); this.hgeo = hg;
  }
  // a burst at (x, y, z), thrown along the car's velocity and away from the wall (nx, nz)
  emit(x, y, z, vx, vz, nx, nz, n = 10, up = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.i++ % this.max, s = 0.3 + Math.random() * 0.6;
      this.p[i * 3] = x + (Math.random() - 0.5) * 0.6; this.p[i * 3 + 1] = y + 0.3 + Math.random() * 0.3; this.p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.v[i * 3] = vx * s + nx * (3 + Math.random() * 7) + (Math.random() - 0.5) * 8;
      this.v[i * 3 + 1] = (1.5 + Math.random() * 6) * up;
      this.v[i * 3 + 2] = vz * s + nz * (3 + Math.random() * 7) + (Math.random() - 0.5) * 8;
      this.life[i] = this.life0[i] = 0.35 + Math.random() * 0.5;
    }
  }
  update(dt) {
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array, hp = this.hgeo.attributes.position.array, hc = this.hgeo.attributes.color.array;
    for (let i = 0; i < this.max; i++) {
      const o = i * 6, q = i * 3;
      if (this.life[i] <= 0) { for (let k = 0; k < 6; k++) { pos[o + k] = 0; col[o + k] = 0; } hp[q] = hp[q + 1] = hp[q + 2] = 0; hc[q] = hc[q + 1] = hc[q + 2] = 0; continue; }
      this.life[i] -= dt; this.v[q + 1] -= 14 * dt;
      const x = this.p[q], y = this.p[q + 1], z = this.p[q + 2];
      this.p[q] += this.v[q] * dt; this.p[q + 2] += this.v[q + 2] * dt;
      let ny = y + this.v[q + 1] * dt;
      if (ny < 0.03) { ny = 0.03; this.v[q + 1] *= -0.35; this.v[q] *= 0.7; this.v[q + 2] *= 0.7; } // skitter along the road
      this.p[q + 1] = ny;
      // a longer streak behind each spark: where it was a moment ago to where it is now
      pos[o] = x - this.v[q] * 0.05; pos[o + 1] = y - this.v[q + 1] * 0.05; pos[o + 2] = z - this.v[q + 2] * 0.05;
      pos[o + 3] = this.p[q]; pos[o + 4] = ny; pos[o + 5] = this.p[q + 2];
      const h = Math.min(1, this.life[i] / this.life0[i] * 1.6);
      col[o] = h; col[o + 1] = 0.35 * h; col[o + 2] = 0.05 * h; col[o + 3] = 1; col[o + 4] = 0.55 + 0.45 * h; col[o + 5] = 0.25 + 0.65 * h;
      hp[q] = this.p[q]; hp[q + 1] = ny; hp[q + 2] = this.p[q + 2]; hc[q] = 1; hc[q + 1] = 0.5 + 0.45 * h; hc[q + 2] = 0.2 + 0.6 * h;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    this.hgeo.attributes.position.needsUpdate = true; this.hgeo.attributes.color.needsUpdate = true;
  }
}

// Fireworks for a win: rockets climb above a point, then burst into a sphere of coloured sparks that fall and fade.
export class Fireworks {
  constructor(scene, max = 900) {
    this.max = max; this.i = 0; this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.c = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)); // rgba: sparks fade out by alpha, not to black
    const dot = document.createElement("canvas"); dot.width = dot.height = 32;
    const x = dot.getContext("2d"), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "#fff"); gr.addColorStop(0.4, "rgba(255,255,255,.6)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.pts.frustumCulled = false; scene.add(this.pts); this.geo = g; this.rockets = []; this.t = 0;
  }
  show(where, seconds = 6) { this.where = where; this.t = seconds; this.next = 0; } // where() -> [x, y, z], asked at each launch so the show follows the camera
  stop() { this.t = 0; this.rockets = []; this.life.fill(0); this.live = 1; } // one more update clears the buffers
  burst(x, y, z) {
    const hue = Math.random(), col = new THREE.Color().setHSL(hue, 0.9, 0.62), col2 = new THREE.Color().setHSL((hue + 0.12) % 1, 0.9, 0.7);
    for (let k = 0; k < 110; k++) {
      const i = this.i++ % this.max, u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 14 + Math.random() * 8;
      this.p.set([x, y, z], i * 3); this.v.set([Math.cos(a) * r * sp, u * sp + 2, Math.sin(a) * r * sp], i * 3);
      const cc = k % 3 ? col : col2; this.c.set([cc.r, cc.g, cc.b], i * 3); this.life[i] = 1.4 + Math.random() * 0.6;
    }
  }
  update(dt) {
    if (this.t <= 0 && !this.rockets.length && !this.live) { this.pts.visible = false; return; } // idle: nothing to draw or upload
    this.pts.visible = true;
    if (this.t > 0) {
      this.t -= dt; this.next -= dt;
      if (this.next <= 0) { this.next = 0.35 + Math.random() * 0.45; const [x, y, z] = this.where(); this.rockets.push({ x: x + (Math.random() - 0.5) * 60, y, z: z + (Math.random() - 0.5) * 60, vy: 38 + Math.random() * 10, t: 0.9 + Math.random() * 0.4 }); }
    }
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array;
    for (const r of this.rockets) { r.t -= dt; r.y += r.vy * dt; if (r.t <= 0) this.burst(r.x, r.y, r.z); }
    this.rockets = this.rockets.filter((r) => r.t > 0);
    this.live = 0;
    for (let i = 0; i < this.max; i++) {
      const q = i * 3;
      if (this.life[i] <= 0) { pos[q] = pos[q + 1] = pos[q + 2] = 0; col[i * 4 + 3] = 0; continue; }
      this.live++; this.life[i] -= dt; this.v[q] *= 1 - dt * 1.2; this.v[q + 1] = this.v[q + 1] * (1 - dt * 1.2) - 9 * dt; this.v[q + 2] *= 1 - dt * 1.2;
      this.p[q] += this.v[q] * dt; this.p[q + 1] += this.v[q + 1] * dt; this.p[q + 2] += this.v[q + 2] * dt;
      const f = Math.min(1, this.life[i]) * (0.75 + 0.25 * Math.random());
      pos[q] = this.p[q]; pos[q + 1] = this.p[q + 1]; pos[q + 2] = this.p[q + 2]; col[i * 4] = this.c[q]; col[i * 4 + 1] = this.c[q + 1]; col[i * 4 + 2] = this.c[q + 2]; col[i * 4 + 3] = f;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
