// Themed scenery around a track. Everything repeated is instanced (one draw call per kind).
import * as THREE from "three";
import { makeRng } from "./rng.js";
import { canvasTex } from "./textures.js";
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

  // far mountains / mesas / hills on the horizon
  if (kind === "mountain" || kind === "desert" || kind === "forest" || kind === "parkland") {
    const n = kind === "mountain" ? 34 : 24, peaks = [], caps = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.2, r = radius + 420 + rnd() * 380;
      const h = kind === "mountain" ? 220 + rnd() * 260 : kind === "desert" ? 60 + rnd() * 90 : 50 + rnd() * 70;
      const w = kind === "desert" ? 90 + rnd() * 120 : h * (0.9 + rnd() * 0.6);
      peaks.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, sx: w, sy: h, sz: w, r: rnd() * 6 });
      if (kind === "mountain") caps.push({ x: cx + Math.cos(a) * r, y: h * 0.62, z: cz + Math.sin(a) * r, sx: w * 0.38, sy: h * 0.38, sz: w * 0.38, r: peaks[k].r });
    }
    const geo = kind === "desert" ? new THREE.CylinderGeometry(0.42, 0.5, 1, 7) : new THREE.ConeGeometry(1, 1, 7); geo.translate(0, 0.5, 0);
    const col = kind === "mountain" ? 0x5d6470 : kind === "desert" ? 0xb4583a : 0x355a35;
    add(instanced(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 1, flatShading: true }), peaks));
    if (caps.length) add(instanced(geo, new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.8, flatShading: true }), caps));
  }

  // rocks and boulders
  if (kind === "mountain" || kind === "desert") {
    const rocks = scatter(path, grid, rnd, Math.round(220 * density), edge + 6, 160, (x, z) => ({ x, z, y: -0.5, s: 1 + rnd() * 4, r: rnd() * 6 }));
    add(instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: kind === "desert" ? 0xa8603e : 0x7d7f84, roughness: 1, flatShading: true }), rocks));
  }
  if (kind === "desert") {
    // mesas close to the track, and cacti
    const mesas = scatter(path, grid, rnd, Math.round(26 * density) + 6, edge + 45, 220, (x, z) => ({ x, z, sx: 30 + rnd() * 50, sy: 25 + rnd() * 55, sz: 30 + rnd() * 50, r: rnd() * 6 }));
    const mg = new THREE.CylinderGeometry(0.45, 0.5, 1, 8); mg.translate(0, 0.5, 0);
    const band = canvasTex(8, 64, (c, w, h) => { for (let y = 0; y < h; y += 4) { c.fillStyle = `hsl(${14 + Math.random() * 12},${45 + Math.random() * 15}%,${36 + Math.random() * 14}%)`; c.fillRect(0, y, w, 4); } });
    add(instanced(mg, new THREE.MeshStandardMaterial({ map: band, roughness: 1, flatShading: true }), mesas));
    const cacti = scatter(path, grid, rnd, Math.round(160 * density), edge + 5, 120, (x, z) => ({ x, z, s: 0.8 + rnd() * 0.8, r: rnd() * 6 }));
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
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: neon ? 1.4 : 0.9, roughness: 0.6, metalness: 0.2 });
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
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000), new THREE.MeshStandardMaterial({ color: 0x0a1a33, metalness: 0.7, roughness: 0.18 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(bounds.maxX + 40 + 2000, 0, cz); g.add(sea);
    // a lit far shore
  }

  // trees (pines and round trees)
  if (kind === "parkland" || kind === "forest" || kind === "mountain") {
    const n = Math.round((kind === "forest" ? 1100 : kind === "mountain" ? 380 : 520) * density);
    const cone = new THREE.ConeGeometry(2.4, 7, 7); cone.translate(0, 5.5, 0);
    const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 5); trunk.translate(0, 1.1, 0);
    const trees = scatter(path, grid, rnd, n, edge + 8, 260, (x, z) => ({ x, z, s: 0.7 + rnd() * 0.9, r: rnd() * 6, c: new THREE.Color(theme.tree || 0x1f4a32).offsetHSL(0, 0, (rnd() - 0.5) * 0.08) }));
    const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    add(instanced(cone, leaves, trees, { shadow: false }));
    add(instanced(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3626 }), trees.map((t) => ({ ...t, c: null }))));
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

  // light poles along the outside of the track
  {
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
    const hm = add(instanced(new THREE.BoxGeometry(2.2, 0.5, 0.9), new THREE.MeshBasicMaterial({ color: theme.lampColor || 0xfff0cc }), heads));
    if (hm) hm.userData.glow = true;
  }
  return g;
}
