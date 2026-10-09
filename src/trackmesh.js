// Turns a TrackPath into meshes: road, run-off, kerbs, barriers, embankments, bridges, tunnels, start gantry.
// Everything long and continuous is one ribbon mesh so the draw-call count stays low on phones.
import * as THREE from "three";
import { canvasTex } from "./textures.js";

const tmp = { x: 0, y: 0, z: 0, h: 0 };

// A ribbon between two lateral offsets, following the track. yA/yB lift each edge; mask(i) can skip quads.
function strip(path, latA, latB, { yA = 0, yB = 0, vScale = 10, mask = null, edgeFn = null } = {}) {
  const N = path.N, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const d = i * path.ds;
    const ea = edgeFn ? edgeFn(i % N, 0) : null, eb = edgeFn ? edgeFn(i % N, 1) : null;
    path.pointAt(d, ea ? ea.lat : latA, tmp); pos.push(tmp.x, ea ? ea.y : tmp.y + yA, tmp.z);
    path.pointAt(d, eb ? eb.lat : latB, tmp); pos.push(tmp.x, eb ? eb.y : tmp.y + yB, tmp.z);
    uv.push(0, d / vScale, 1, d / vScale);
    if (i < N && (!mask || mask(i))) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function merge(geos) {
  // tiny merge for non-indexed + indexed ribbons with position/uv only
  const pos = [], uv = [], idx = [], col = []; let off = 0; let hasCol = geos.some((g) => g.attributes.color);
  for (const g of geos) {
    const p = g.attributes.position.array, u = g.attributes.uv.array, c = g.attributes.color?.array;
    for (let k = 0; k < p.length; k++) pos.push(p[k]);
    for (let k = 0; k < u.length; k++) uv.push(u[k]);
    if (hasCol) for (let k = 0; k < p.length; k++) col.push(c ? c[k] : 1);
    const ix = g.index.array; for (let k = 0; k < ix.length; k++) idx.push(ix[k] + off);
    off += p.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (hasCol) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function roadTexture(theme) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = theme.asphalt || "#3c4048"; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(w * 0.22, 0, w * 0.1, h); g.fillRect(w * 0.68, 0, w * 0.1, h); // racing-line grime
    g.fillStyle = theme.lines || "#e8ecf0"; g.fillRect(w * 0.035, 0, w * 0.022, h); g.fillRect(w * 0.943, 0, w * 0.022, h);
    g.fillRect(w * 0.494, 0, w * 0.012, h * 0.45);
  }, { repeat: [1, 1], aniso: 8 });
}

export function buildTrackMeshes(path, theme) {
  const group = new THREE.Group();
  const W = path.width / 2, R = path.runoff, N = path.N;

  // road
  const road = new THREE.Mesh(strip(path, -W, W, { vScale: 12 }), new THREE.MeshStandardMaterial({ map: roadTexture(theme), roughness: 0.88, metalness: 0.0 }));
  road.receiveShadow = true; road.name = "road"; group.add(road);

  // run-off on both sides
  const runTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = theme.runoff || "#4b6b3f"; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, { repeat: [1, 1] });
  const runMat = new THREE.MeshStandardMaterial({ map: runTex, roughness: 1 });
  const run = new THREE.Mesh(merge([strip(path, -W - R, -W, { yA: -0.02, vScale: 6 }), strip(path, W, W + R, { yB: -0.02, vScale: 6 })]), runMat);
  run.receiveShadow = true; group.add(run);

  // kerbs on the inside and outside of real bends
  const kerbMask = (i) => Math.abs(path.cs[i]) > 0.006;
  const kerbGeo = merge([strip(path, -W - 1.1, -W + 0.05, { yA: 0.02, yB: 0.06, vScale: 4, mask: kerbMask }), strip(path, W - 0.05, W + 1.1, { yA: 0.06, yB: 0.02, vScale: 4, mask: kerbMask })]);
  const kerbTex = canvasTex(8, 64, (g, w, h) => { g.fillStyle = "#d8322a"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2f2f2"; g.fillRect(0, 0, w, h / 2); });
  const kerb = new THREE.Mesh(kerbGeo, new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  kerb.receiveShadow = true; group.add(kerb);

  // barriers
  const wallTex = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = theme.wallA || "#d9dde3"; g.fillRect(0, 0, w, h);
    g.fillStyle = theme.wallB || "#1d2533";
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 32, 16); g.lineTo(x + 16, 32); g.lineTo(x, 32); g.lineTo(x + 16, 16); g.closePath(); g.fill(); }
  }, { repeat: [1, 1] });
  wallTex.rotation = Math.PI / 2; // run the chevrons along the ribbon's v axis
  const wallH = 1.1, wl = -W - R, wr = W + R;
  const wallEdge = (lat) => (i, side) => { path.pointAt(i * path.ds, lat, tmp); return { lat, y: tmp.y + (side ? wallH : 0) }; };
  const walls = new THREE.Mesh(merge([
    strip(path, wl, wl, { vScale: 4, edgeFn: wallEdge(wl) }),
    strip(path, wr, wr, { vScale: 4, edgeFn: wallEdge(wr) }),
  ]), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, side: THREE.DoubleSide, emissive: theme.wallGlow || 0x000000, emissiveIntensity: theme.wallGlow ? 0.6 : 0 }));
  walls.receiveShadow = true; group.add(walls);

  // embankments under raised road (skipped on bridges so the lower road stays open)
  const embMask = (i) => !path.bridge[i] && !path.bridge[(i + 1) % N] && (path.y[i] > 0.4 || path.y[(i + 1) % N] > 0.4);
  const embEdge = (lat, dir) => (i, side) => {
    if (!side) { path.pointAt(i * path.ds, lat, tmp); return { lat, y: tmp.y }; }
    const y = path.y[i]; return { lat: lat + dir * (y * 1.4 + 1), y: -0.05 };
  };
  const embMat = new THREE.MeshStandardMaterial({ color: theme.embankment || 0x3d5a35, roughness: 1, side: THREE.DoubleSide });
  const emb = new THREE.Mesh(merge([strip(path, 0, 0, { mask: embMask, edgeFn: embEdge(wl, -1) }), strip(path, 0, 0, { mask: embMask, edgeFn: embEdge(wr, 1) })]), embMat);
  emb.receiveShadow = true; group.add(emb);

  // bridges: a deck underside + pillars that avoid the road below
  if (path.bridge.some((b) => b)) {
    const bMask = (i) => path.bridge[i] && path.bridge[(i + 1) % N];
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.9, side: THREE.DoubleSide });
    const under = (i, side) => { const lat = side ? wr : wl; path.pointAt(i * path.ds, lat, tmp); return { lat, y: tmp.y - 1.2 }; };
    const sideL = (i, side) => { path.pointAt(i * path.ds, wl, tmp); return { lat: wl, y: tmp.y - (side ? 0 : 1.2) }; };
    const sideR = (i, side) => { path.pointAt(i * path.ds, wr, tmp); return { lat: wr, y: tmp.y - (side ? 0 : 1.2) }; };
    group.add(new THREE.Mesh(merge([strip(path, 0, 0, { mask: bMask, edgeFn: under }), strip(path, 0, 0, { mask: bMask, edgeFn: sideL }), strip(path, 0, 0, { mask: bMask, edgeFn: sideR })]), concrete));
    const pil = [];
    for (let i = 0; i < N; i += 7) {
      if (!path.bridge[i]) continue;
      for (const lat of [wl + 0.8, wr - 0.8]) {
        path.pointAt(i * path.ds, lat, tmp);
        let clear = true;
        for (let j = 0; j < N; j += 2) {
          if (path.y[j] > tmp.y - 3) continue;
          const dx = tmp.x - path.x[j], dz = tmp.z - path.z[j];
          if (dx * dx + dz * dz < (W + R + 1.5) ** 2) { clear = false; break; }
        }
        if (clear) pil.push([tmp.x, tmp.y, tmp.z]);
      }
    }
    if (pil.length) {
      const geo = new THREE.CylinderGeometry(0.7, 0.9, 1, 10); geo.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, concrete, pil.length); const o = new THREE.Object3D();
      pil.forEach(([x, y, z], k) => { o.position.set(x, 0, z); o.scale.set(1, y - 1.1, 1); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
      group.add(im);
    }
  }

  // tunnels: an arch over the road with a strip of lights
  if (path.tunnel.some((t) => t)) {
    const SEG = 10, rad = W + R, pos = [], idx = [], lights = [];
    for (let i = 0; i <= N; i++) {
      for (let s = 0; s <= SEG; s++) {
        const a = Math.PI * s / SEG; const lat = -Math.cos(a) * rad; path.pointAt(i * path.ds, lat, tmp);
        pos.push(tmp.x, tmp.y + Math.sin(a) * rad * 0.62 + (s === 0 || s === SEG ? 0 : 1.1), tmp.z);
      }
      if (i < N && path.tunnel[i]) {
        for (let s = 0; s < SEG; s++) { const a = i * (SEG + 1) + s, b = a + SEG + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
        if (i % 6 === 0) lights.push(i);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.95, side: THREE.DoubleSide })));
    const lg = new THREE.BoxGeometry(0.5, 0.1, 3);
    const lm = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffe7b0 }), lights.length * 2); const o = new THREE.Object3D();
    lights.forEach((i, k) => [-1, 1].forEach((s, m) => { path.pointAt(i * path.ds, s * rad * 0.55, tmp); o.position.set(tmp.x, tmp.y + rad * 0.62 + 0.6, tmp.z); o.rotation.set(0, tmp.h, 0); o.updateMatrix(); lm.setMatrixAt(k * 2 + m, o.matrix); }));
    lm.userData.glow = true; group.add(lm);
  }

  // painted grid boxes behind the line
  {
    const geos = [];
    for (let k = 0; k < 8; k++) {
      const row = Math.floor(k / 2), col = k % 2, d = -7 - row * 9 - col * 4.5 + 2.6, lat = col ? -3.3 : 3.3;
      path.pointAt(d, lat, tmp);
      const g = new THREE.PlaneGeometry(2.6, 0.22); g.rotateX(-Math.PI / 2); g.rotateY(tmp.h); g.translate(tmp.x, tmp.y + 0.025, tmp.z); geos.push(g);
      for (const s of [-1, 1]) { path.pointAt(d - 0.7, lat + s * 1.2, tmp); const e = new THREE.PlaneGeometry(0.18, 1.4); e.rotateX(-Math.PI / 2); e.rotateY(tmp.h); e.translate(tmp.x, tmp.y + 0.025, tmp.z); geos.push(e); }
    }
    const grid = new THREE.Mesh(merge(geos.map((g) => { g.setIndex(g.index); return g; })), new THREE.MeshBasicMaterial({ color: 0xe8ecf0, polygonOffset: true, polygonOffsetFactor: -4 }));
    group.add(grid);
  }

  // start / finish line and gantry
  {
    path.pointAt(0, 0, tmp);
    const chk = canvasTex(256, 32, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4"; g.fillRect(x * 16, y * 16, 16, 16); } });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(path.width, 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }));
    line.rotation.set(-Math.PI / 2, 0, 0); line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), tmp.h);
    line.position.set(tmp.x, tmp.y + 0.03, tmp.z); group.add(line);
    const gantry = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), postMat); p.position.set(s * (W + R - 0.5), 3.75, 0); p.castShadow = true; gantry.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((W + R) * 2, 1.2, 0.6), postMat); beam.position.y = 7.2; gantry.add(beam);
    const st = canvasTex(512, 64, (g, w, h) => { g.fillStyle = "#0b1220"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2a65a"; g.font = "bold 40px 'Arial Narrow',Arial,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText((theme.sign || "APEX RING") + "  ·  START / FINISH", w / 2, h / 2 + 2); });
    for (const s of [-1, 1]) { const sign = new THREE.Mesh(new THREE.PlaneGeometry((W + R) * 2 - 1, 1.0), new THREE.MeshBasicMaterial({ map: st })); sign.position.set(0, 7.2, s * 0.31); if (s < 0) sign.rotation.y = Math.PI; gantry.add(sign); }
    gantry.position.set(tmp.x, tmp.y, tmp.z); gantry.rotation.y = tmp.h; group.add(gantry);
  }
  return group;
}
