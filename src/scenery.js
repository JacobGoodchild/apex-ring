// Themed scenery around a track. Everything repeated is instanced (one draw call per kind).
import * as THREE from "three";
import { makeRng } from "./rng.js";
import { canvasTex, waveNormals } from "./textures.js";
import { photo } from "./photo.js";
import { Terrain, hasTerrain } from "./terrain.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Spatial hash of centre-line samples so we can keep scenery off the road cheaply.
export function trackGrid(path) {
  const cell = 24, map = new Map();
  for (let i = 0; i < path.N; i++) {
    const k = Math.floor(path.x[i] / cell) + "," + Math.floor(path.z[i] / cell);
    if (!map.has(k)) map.set(k, []); map.get(k).push(i);
  }
  return {
    // distance from (x,z) to the nearest centre-line sample (checks neighbouring cells only, so capped near 48 m)
    dist(x, z) {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell); let best = 1e9;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const l = map.get(cx + a + "," + (cz + b)); if (!l) continue;
        for (const i of l) { const dx = x - path.x[i], dz = z - path.z[i]; const d = dx * dx + dz * dz; if (d < best) best = d; }
      }
      return Math.sqrt(best);
    },
  };
}

function instanced(geo, mat, list, { shadow = false } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
  list.forEach((it, k) => { o.position.set(it.x, it.y || 0, it.z); o.rotation.set(0, it.r || 0, 0); o.scale.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1); o.updateMatrix(); im.setMatrixAt(k, o.matrix); if (it.c != null) im.setColorAt(k, new THREE.Color(it.c)); });
  im.castShadow = shadow; im.receiveShadow = false;
  return im;
}

// Scatter n items in a ring around the track, at least `clear` metres from the centre-line.
function scatter(path, grid, rnd, n, clear, spread, fn) {
  const out = []; let tries = 0;
  const minX = Math.min(...path.x) - spread, maxX = Math.max(...path.x) + spread, minZ = Math.min(...path.z) - spread, maxZ = Math.max(...path.z) + spread;
  while (out.length < n && tries++ < n * 8) {
    const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
    if (grid.dist(x, z) < clear) continue;
    const it = fn(x, z); if (it) out.push(it);
  }
  return out;
}

const tmp = {};

export function buildScenery(path, theme, density, seed) {
  const g = new THREE.Group(), rnd = makeRng(seed), grid = trackGrid(path);
  const edge = path.width / 2 + path.runoff;
  const kind = theme.scenery;
  const add = (o) => { if (o) g.add(o); return o; };

  const bounds = { minX: Math.min(...path.x), maxX: Math.max(...path.x), minZ: Math.min(...path.z), maxZ: Math.max(...path.z) };
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
  // rolling ground and mountains (city tracks stay flat); everything else sits on it
  const terrain = hasTerrain(theme) ? new Terrain(path, theme, density < 0.6 ? "low" : density < 0.9 ? "medium" : "high", seed) : null;
  if (terrain) g.add(terrain.mesh);
  const ground = (x, z) => (terrain ? terrain.heightAt(x, z) : 0);
  g.userData.terrain = terrain;

  // far mountains / mesas / hills on the horizon
  if (kind === "desert") {
    const n = kind === "mountain" ? 34 : 24, peaks = [], caps = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.2, r = radius + 420 + rnd() * 380;
      const h = kind === "mountain" ? 220 + rnd() * 260 : kind === "desert" ? 60 + rnd() * 90 : 50 + rnd() * 70;
      const w = kind === "desert" ? 90 + rnd() * 120 : h * (0.9 + rnd() * 0.6);
      peaks.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: ground(cx + Math.cos(a) * r, cz + Math.sin(a) * r) - 4, sx: w, sy: h, sz: w, r: rnd() * 6 });
      if (kind === "mountain") caps.push({ x: cx + Math.cos(a) * r, y: h * 0.62, z: cz + Math.sin(a) * r, sx: w * 0.395, sy: h * 0.38, sz: w * 0.395, r: peaks[k].r });
    }
    const geo = kind === "desert" ? new THREE.CylinderGeometry(0.42, 0.5, 1, 7) : new THREE.ConeGeometry(1, 1, 7); geo.translate(0, 0.5, 0);
    const col = kind === "mountain" ? 0x5d6470 : kind === "desert" ? 0xb4583a : 0x355a35;
    add(instanced(geo, new THREE.MeshStandardMaterial({ color: kind === "mountain" ? 0x9aa0aa : kind === "desert" ? 0xd8805a : 0x6a8a5a, map: photo(kind === "desert" ? "rock" : kind === "mountain" ? "rock" : "grass", { repeat: [5, 3] }), roughness: 1, flatShading: true }), peaks));
    if (caps.length) add(instanced(geo, new THREE.MeshStandardMaterial({ color: 0xd4dae2, map: photo("snow", { repeat: [3, 2] }), roughness: 0.95, flatShading: true }), caps));
  }

  // rocks and boulders
  if (kind === "mountain" || kind === "desert" || kind === "coastal" || kind === "winter") {
    const rocks = scatter(path, grid, rnd, Math.round(220 * density), edge + 6, 160, (x, z) => ({ x, z, y: ground(x, z) - 0.5, s: 1 + rnd() * 4, r: rnd() * 6 }));
    add(instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: kind === "desert" ? 0xe0906a : 0xb0b2b8, map: photo("rock"), roughness: 1, flatShading: true }), rocks));
  }
  if (kind === "desert") {
    // mesas close to the track, and cacti
    const mesas = scatter(path, grid, rnd, Math.round(26 * density) + 6, edge + 45, 220, (x, z) => ({ x, z, y: ground(x, z) - 3, sx: 30 + rnd() * 50, sy: 25 + rnd() * 55, sz: 30 + rnd() * 50, r: rnd() * 6 }));
    const mg = new THREE.CylinderGeometry(0.45, 0.5, 1, 8); mg.translate(0, 0.5, 0);
    const band = canvasTex(8, 64, (c, w, h) => { for (let y = 0; y < h; y += 4) { c.fillStyle = `hsl(${14 + Math.random() * 12},${45 + Math.random() * 15}%,${36 + Math.random() * 14}%)`; c.fillRect(0, y, w, 4); } });
    add(instanced(mg, new THREE.MeshStandardMaterial({ map: band, roughness: 1, flatShading: true }), mesas));
    const cacti = scatter(path, grid, rnd, Math.round(160 * density), edge + 5, 120, (x, z) => ({ x, z, y: ground(x, z) - 0.2, s: 0.8 + rnd() * 0.8, r: rnd() * 6 }));
    const parts = [new THREE.CylinderGeometry(0.28, 0.32, 4, 7).translate(0, 2, 0), new THREE.CylinderGeometry(0.18, 0.18, 1.4, 6).translate(0.7, 2.6, 0), new THREE.CylinderGeometry(0.18, 0.18, 0.5, 6).rotateZ(Math.PI / 2).translate(0.4, 1.9, 0)];
    add(instanced(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9 }), cacti));
  }

  // city blocks: three height classes so the window texture repeats sensibly
  if (kind === "city" || kind === "neon") {
    const neon = kind === "neon";
    const classes = [[8, 18, 2, 3], [18, 40, 3, 7], [40, 90, 4, 14]];
    classes.forEach(([h0, h1, rx, ry], ci) => {
      const tex = canvasTex(64, 128, (c, w, h) => {
        c.fillStyle = neon ? "#0c0a14" : "#1a1e27"; c.fillRect(0, 0, w, h);
        for (let y = 4; y < h; y += 12) for (let x = 4; x < w; x += 10) {
          const lit = Math.random() < (neon ? 0.45 : 0.55);
          c.fillStyle = lit ? (neon ? ["#ff4fd8", "#7df9ff", "#b388ff", "#ffe066"][Math.floor(Math.random() * 4)] : ["#ffd59a", "#fff1d0", "#ffc070"][Math.floor(Math.random() * 3)]) : "#0d1016";
          c.fillRect(x, y, 6, 7);
        }
      }, { repeat: [rx, ry] });
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: neon ? 1.1 : 0.6, roughness: 0.6, metalness: 0.2 });
      const list = scatter(path, grid, rnd, Math.round([90, 70, 40][ci] * density), edge + 10 + ci * 14, 180, (x, z) => {
        if (theme.sea && x > bounds.maxX + 20) return null;
        const w = 14 + rnd() * 18; return { x, z, sx: w, sy: h0 + rnd() * (h1 - h0), sz: 14 + rnd() * 18, r: Math.round(rnd() * 4) * Math.PI / 2 };
      });
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      add(instanced(geo, mat, list));
      if (neon && list.length) {
        // glowing roof edges
        const strip = new THREE.BoxGeometry(1.02, 0.6, 1.02); strip.translate(0, 0, 0);
        const cols = [0xff2bd6, 0x2bf0ff, 0x9d4dff, 0xffd02b];
        const im = instanced(strip, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.map((b, k) => ({ ...b, y: b.sy, sy: 1, c: cols[k % 4] })));
        if (im) { im.userData.glow = true; g.add(im); }
      }
    });
  }
  if (theme.sea) {
    // water: rippling normals (scrolled in main.js) so it catches the sky instead of being a flat mirror
    const nm = waveNormals(); nm.repeat.set(160, 240);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000), new THREE.MeshStandardMaterial({ color: theme.seaColor || 0x0a1a33, metalness: theme.seaColor ? 0.35 : 0.7, roughness: theme.seaColor ? 0.12 : 0.18, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5) }));
    sea.name = "sea";
    sea.rotation.x = -Math.PI / 2; sea.position.set(bounds.maxX + 40 + 2000, theme.seaY || 0, cz); g.add(sea);
    // a lit far shore
  }

  // trees: layered pines and round broadleaf trees, scattered near the track and out across the hills
  if (kind === "parkland" || kind === "forest" || kind === "mountain" || kind === "coastal" || kind === "winter") {
    const n = Math.round((kind === "forest" ? 1100 : kind === "mountain" ? 420 : kind === "coastal" ? 220 : kind === "winter" ? 700 : 560) * density);
    const jitter = (geo, amt, k) => { const p = geo.attributes.position; for (let v = 0; v < p.count; v++) { const h = Math.sin(v * 12.9898 + k * 78.233) * 43758.5453; const r = (h - Math.floor(h)) - 0.5; p.setXYZ(v, p.getX(v) * (1 + r * amt), p.getY(v) + r * amt * 0.6, p.getZ(v) * (1 + r * amt)); } return geo; };
    const tiers = [[2.6, 4.2, 3.2], [2.1, 3.8, 5.4], [1.6, 3.4, 7.4], [1.0, 2.8, 9.2]];
    const pine = mergeGeometries(tiers.map(([r, h, y], k) => jitter(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, y, 0), 0.18, k)));
    const blob = (r, x, y, z, k) => { const b = new THREE.IcosahedronGeometry(r, 0); jitter(b, 0.25, k); return b.translate(x, y, z); };
    const round = mergeGeometries([blob(2.7, 0, 5.3, 0, 1), blob(2.1, 1.3, 6.7, 0.5, 2), blob(2.0, -1.1, 6.6, -0.7, 3)]);
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 4.2, 5, 1, true); trunk.translate(0, 2.1, 0); // no caps: never seen
    const leafTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#8a8a8a"; c.fillRect(0, 0, w, h); for (let k = 0; k < 700; k++) { const l = 30 + Math.random() * 70; c.fillStyle = `rgb(${l},${l},${l})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, { repeat: [2, 2] });
    const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leafTex, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
    const pick = kind === "mountain" || kind === "coastal" || kind === "winter" ? 1 : kind === "forest" ? 0.72 : 0.35; // share of pines
    const base = new THREE.Color(theme.tree || 0x1f4a32);
    const make = (x, z) => (theme.sea && theme.seaY != null && x > bounds.maxX + 20 ? null : { x, z, y: ground(x, z) - 0.3, s: 0.9 + rnd() * 0.9, r: rnd() * 6, pine: rnd() < pick, c: base.clone().offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.08) });
    const trees = scatter(path, grid, rnd, n, edge + 8, 260, make);
    // trees out on the far hills are only ever seen small: one simple cone each (a quarter of the triangles)
    const far = terrain ? scatter(path, grid, rnd, Math.round(n * 0.5), edge + 90, 700, make) : [];
    const pines = trees.filter((t) => t.pine), rounds = trees.filter((t) => !t.pine);
    const shade = density >= 1; // High quality: near trees cast shadows onto the road
    add(instanced(pine, leaves, pines, { shadow: shade }));
    if (far.length) { const cone = new THREE.ConeGeometry(2.3, 8.5, 6); cone.translate(0, 5.2, 0); add(instanced(cone, leaves, far.map((t) => ({ ...t, s: t.s * 1.1 })))); }
    add(instanced(round, leaves, rounds.map((t) => ({ ...t, c: t.c.clone().offsetHSL(0.03, 0.05, 0.06) })), { shadow: shade }));
    add(instanced(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), trees.map((t) => ({ ...t, c: null }))));
  }

  // grandstand by the start line, on the right-hand side
  {
    const stand = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.85 });
    const crowdTex = canvasTex(256, 32, (c, w, h) => { c.fillStyle = "#1e2530"; c.fillRect(0, 0, w, h); for (let y = 2; y < h; y += 8) for (let x = 1; x < w; x += 4) { c.fillStyle = `hsl(${Math.random() * 360},35%,${35 + Math.random() * 25}%)`; c.fillRect(x, y, 3, 5); } }, { repeat: [6, 1] });
    const crowd = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 60), i % 2 ? crowd : mat);
      step.position.set(i * 1.8, 0.45 + i * 0.9, 0); stand.add(step);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(1.8, i * 0.9 + 0.01, 60), mat); fill.position.set(i * 1.8, (i * 0.9) / 2, 0); stand.add(fill);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 62), new THREE.MeshStandardMaterial({ color: 0x252b36, metalness: 0.4, roughness: 0.5 }));
    roof.position.set(5, 9.2, 0); roof.rotation.z = -0.08; stand.add(roof);
    path.pointAt(path.length - 10, -(edge + 6), tmp);
    stand.position.set(tmp.x, tmp.y, tmp.z); stand.rotation.y = tmp.h; g.add(stand);
  }

  // billboards with made-up sponsors along the straights, facing the track
  {
    const ads = [["NOVA", "TYRES", "#f2a65a", "#0b1220"], ["VOLTA", "FUEL", "#0b1220", "#4cc9f0"], ["APEX", "RING", "#e9edf2", "#d7263d"], ["HELIX", "OIL", "#46d38a", "#0b1220"]];
    const tex = canvasTex(512, 256, (c, w, h) => {
      ads.forEach(([a, b2, bg, fg], k) => {
        const x = (k % 2) * 256, y = Math.floor(k / 2) * 128;
        c.fillStyle = bg; c.fillRect(x, y, 256, 128); c.fillStyle = fg; c.font = "bold 56px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(a, x + 128, y + 50); c.font = "bold 30px Arial, sans-serif"; c.fillText(b2, x + 128, y + 98);
      });
    });
    const boards = [[], [], [], []];
    let k = 0;
    for (let d = 60; d < path.length - 60; d += 23) {
      const i = Math.floor(d / path.ds) % path.N;
      if (Math.abs(path.cs[i]) > 0.003 || path.bridge[i] || path.tunnel[i]) continue;
      if ((k++ % 4) !== 0) continue;
      const side = k % 8 < 4 ? 1 : -1;
      path.pointAt(d, side * (edge + 3.5), tmp);
      boards[k % 4].push({ x: tmp.x, y: tmp.y + 3.6, z: tmp.z, r: tmp.h + (side > 0 ? Math.PI / 2 : -Math.PI / 2) }); // front faces the road
    }
    boards.forEach((list, a) => {
      const geo = new THREE.PlaneGeometry(9, 4.5), uv = geo.attributes.uv;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, (a % 2) * 0.5 + uv.getX(q) * 0.5, (1 - Math.floor(a / 2)) * 0.5 + uv.getY(q) * 0.5 - 0.5 + 0.5);
      add(instanced(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: theme.stars ? 0.6 : 0.15 }), list));
    });
    const legs = boards.flat();
    // a plain back panel, so the boards don't show mirror-writing from behind
    add(instanced(new THREE.BoxGeometry(9.2, 4.7, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 0.8 }), legs.map((b) => ({ x: b.x - Math.sin(b.r) * 0.1, y: b.y, z: b.z - Math.cos(b.r) * 0.1, r: b.r }))));
    const lg = new THREE.BoxGeometry(0.25, 1.5, 0.25);
    add(instanced(lg, new THREE.MeshStandardMaterial({ color: 0x30384a }), legs.flatMap((b) => [-3, 3].map((o) => ({ x: b.x + Math.cos(b.r) * o, y: b.y - 3.6 + 0.7, z: b.z - Math.sin(b.r) * o, r: b.r })))));
  }

  // wooden telephone poles along the inland side with sagging wires between them
  if (theme.poles) {
    const poles = [], arms = [], wire = [];
    let prev = null;
    for (let d = 0; d < path.length; d += 42) {
      const i = Math.floor(d / path.ds) % path.N;
      path.pointAt(d, -(edge + 5), tmp);
      const top = { x: tmp.x, y: tmp.y + 9.2, z: tmp.z, h: tmp.h };
      poles.push({ x: tmp.x, y: tmp.y - 0.3, z: tmp.z, r: tmp.h });
      arms.push({ x: tmp.x, y: tmp.y + 8.6, z: tmp.z, r: tmp.h });
      if (prev) for (const o of [-0.9, 0, 0.9]) {
        const ax = prev.x - Math.cos(prev.h) * o, az = prev.z + Math.sin(prev.h) * o, bx = top.x - Math.cos(top.h) * o, bz = top.z + Math.sin(top.h) * o;
        for (let k = 0; k < 8; k++) {
          const f0 = k / 8, f1 = (k + 1) / 8, sag = (f) => 4 * f * (1 - f) * 1.1;
          wire.push(ax + (bx - ax) * f0, prev.y + (top.y - prev.y) * f0 - sag(f0) - 0.6, az + (bz - az) * f0, ax + (bx - ax) * f1, prev.y + (top.y - prev.y) * f1 - sag(f1) - 0.6, az + (bz - az) * f1);
        }
      }
      prev = top; void i;
    }
    const pg = new THREE.CylinderGeometry(0.13, 0.18, 9.5, 6); pg.translate(0, 4.75, 0);
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
    add(instanced(pg, wood, poles));
    add(instanced(new THREE.BoxGeometry(2.4, 0.14, 0.14), wood, arms));
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
    add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1c1e })));
  }

  // light poles along the outside of the track
  if (!theme.poles) {
    const poles = [], heads = [];
    for (let d = 0; d < path.length; d += 48) {
      const i = Math.floor(d / path.ds) % path.N; if (path.bridge[i] || path.tunnel[i]) continue;
      const side = path.cs[i] > 0 ? -1 : 1; // outside of the bend
      path.pointAt(d, side * (edge + 2.5), tmp);
      poles.push({ x: tmp.x, y: tmp.y, z: tmp.z });
      heads.push({ x: tmp.x, y: tmp.y + 12.2, z: tmp.z, r: tmp.h });
    }
    const pg = new THREE.CylinderGeometry(0.15, 0.22, 12, 6); pg.translate(0, 6, 0);
    add(instanced(pg, new THREE.MeshStandardMaterial({ color: 0x30384a, metalness: 0.5, roughness: 0.5 }), poles));
    const hm = add(instanced(new THREE.BoxGeometry(2.2, 0.5, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.lampColor || 0xfff0cc).multiplyScalar(0.7) }), heads));
    if (hm) hm.userData.glow = true;
  }
  return g;
}
