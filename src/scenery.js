// Themed scenery around a track. Everything repeated is instanced (one draw call per kind).
import * as THREE from "three";
import { makeRng } from "./rng.js";
import { canvasTex } from "./textures.js";

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

  // trees (pines and round trees)
  if (kind === "parkland" || kind === "forest" || kind === "mountain") {
    const n = Math.round((kind === "forest" ? 900 : 520) * density);
    const cone = new THREE.ConeGeometry(2.4, 7, 7); cone.translate(0, 5.5, 0);
    const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 5); trunk.translate(0, 1.1, 0);
    const trees = scatter(path, grid, rnd, n, edge + 8, 260, (x, z) => ({ x, z, s: 0.7 + rnd() * 0.9, r: rnd() * 6, c: new THREE.Color(theme.tree || 0x1f4a32).offsetHSL(0, 0, (rnd() - 0.5) * 0.08) }));
    const leaves = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    g.add(instanced(cone, leaves, trees, { shadow: false }));
    g.add(instanced(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3626 }), trees.map((t) => ({ ...t, c: null }))));
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
    stand.position.set(tmp.x, tmp.y, tmp.z); stand.rotation.y = tmp.h + Math.PI; g.add(stand);
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
    g.add(instanced(pg, new THREE.MeshStandardMaterial({ color: 0x30384a, metalness: 0.5, roughness: 0.5 }), poles));
    const hm = instanced(new THREE.BoxGeometry(2.2, 0.5, 0.9), new THREE.MeshBasicMaterial({ color: theme.lampColor || 0xfff0cc }), heads);
    hm.userData.glow = true; g.add(hm);
  }
  return g;
}
