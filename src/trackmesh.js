// Turns a TrackPath into meshes: road, run-off, kerbs, barriers, embankments, bridges, tunnels, start gantry.
// Everything long and continuous is one ribbon mesh so the draw-call count stays low on phones.
import * as THREE from "three";
import { canvasTex } from "./textures.js";
import { photo, overlayMarkings } from "./photo.js";

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

// Painted markings only (transparent elsewhere); the asphalt itself is a photo texture under it.
export function roadMarkings(theme) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(w * 0.22, 0, w * 0.1, h); g.fillRect(w * 0.68, 0, w * 0.1, h); // racing-line rubber
    g.fillStyle = theme.lines || "#e8ecf0"; g.fillRect(w * 0.035, 0, w * 0.022, h); g.fillRect(w * 0.943, 0, w * 0.022, h);
    if (theme.centreLine) { g.fillStyle = theme.centreLine; g.fillRect(w * 0.484, 0, w * 0.01, h); g.fillRect(w * 0.506, 0, w * 0.01, h); } // double line
    else g.fillRect(w * 0.494, 0, w * 0.012, h * 0.45);
  }, { repeat: [1, 1], aniso: 8 });
}

// A photo-textured surface material, tinted per theme (tint can be a colour or a brightness factor).
export function surface(name, tint, rep, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ map: photo(name, { repeat: rep }), roughness: 1, ...extra });
  if (typeof tint === "number" && tint > 16) m.color.set(tint); else if (tint) m.color.setScalar(tint);
  return m;
}

export function buildTrackMeshes(path, theme, { embankments = true } = {}) {
  const group = new THREE.Group();
  const W = path.width / 2, R = path.runoff, N = path.N;

  // road
  const solid = (i) => !path.cliff[i]; // no road surface across a cliff drop
  const rep = [(2 * W) / 6, 2]; // one asphalt photo tile is ~6 m across
  // wet roads are darker and much smoother, so they mirror the sky and the lights
  const roadMat = new THREE.MeshStandardMaterial({ map: photo("asphalt"), normalMap: photo("asphalt_n", { repeat: rep, srgb: false }), normalScale: new THREE.Vector2(theme.wetRoad ? 0.3 : 0.6, theme.wetRoad ? 0.3 : 0.6), roughness: theme.wetRoad ? (theme.stars || theme.dark ? 0.22 : 0.14) : 0.82, metalness: theme.wetRoad ? 0.15 : 0, envMapIntensity: theme.wetRoad ? 2 : 1 });
  // water fills the texture (flatter normals) and soaks the asphalt darker, which lets the sky's reflection show
  roadMat.color.setScalar((theme.asphaltTint || 0.8) * (theme.wetRoad ? (theme.stars || theme.dark ? 0.9 : 0.75) : 1)); // at night keep some of the glow
  overlayMarkings(roadMat, roadMarkings(theme), rep);
  const road = new THREE.Mesh(strip(path, -W, W, { vScale: 12, mask: solid }), roadMat);
  road.receiveShadow = true; road.name = "road"; group.add(road);

  // run-off on both sides
  const runMat = surface(theme.runTex || "grass", theme.runTint || 0xd8d8d8, [R / 5, 6 / 5]);
  const run = new THREE.Mesh(merge([strip(path, -W - R, -W, { yA: -0.02, vScale: 6, mask: solid }), strip(path, W, W + R, { yB: -0.02, vScale: 6, mask: solid })]), runMat);
  run.receiveShadow = true; group.add(run);

  // kerbs on the inside and outside of real bends
  const kerbMask = (i) => Math.abs(path.cs[i]) > 0.006 && !path.cliff[i];
  const kerbGeo = merge([strip(path, -W - 1.1, -W + 0.05, { yA: 0.02, yB: 0.06, vScale: 4, mask: kerbMask }), strip(path, W - 0.05, W + 1.1, { yA: 0.06, yB: 0.02, vScale: 4, mask: kerbMask })]);
  const kerbTex = canvasTex(8, 64, (g, w, h) => { g.fillStyle = "#d8322a"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2f2f2"; g.fillRect(0, 0, w, h / 2); });
  const kerb = new THREE.Mesh(kerbGeo, new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  kerb.receiveShadow = true; group.add(kerb);

  // barriers
  // concrete barriers with a painted band along the top in the theme colours
  const wallBand = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = theme.wallA || "#d9dde3"; g.fillRect(w * 0.72, 0, w * 0.28, h / 2);
    g.fillStyle = theme.wallB || "#c2332b"; g.fillRect(w * 0.72, h / 2, w * 0.28, h / 2);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, w * 0.08, h); // grime at the foot
  });
  const wallH = 1.1, wl = -W - R, wr = W + R;
  const wallEdge = (lat) => (i, side) => { path.pointAt(i * path.ds, lat, tmp); return { lat, y: tmp.y + (side ? wallH : 0) }; };
  const walls = new THREE.Mesh(merge([
    strip(path, wl, wl, { vScale: 4, edgeFn: wallEdge(wl), mask: solid }),
    strip(path, wr, wr, { vScale: 4, edgeFn: wallEdge(wr), mask: solid }),
  ]), overlayMarkings(new THREE.MeshStandardMaterial({ map: photo("concrete"), color: 0xd0d0d0, roughness: 0.9, side: THREE.DoubleSide, emissive: theme.wallGlow || 0x000000, emissiveIntensity: theme.wallGlow ? 0.6 : 0 }), wallBand, [0.55, 2], "wallBand"));
  walls.receiveShadow = true; group.add(walls);

  // embankments under raised road (skipped on bridges so the lower road stays open)
  const embMask = (i) => embankments && !path.cliff[i] && !path.bridge[i] && !path.bridge[(i + 1) % N] && (path.y[i] > 0.4 || path.y[(i + 1) % N] > 0.4);
  const embEdge = (lat, dir) => (i, side) => {
    if (!side) { path.pointAt(i * path.ds, lat, tmp); return { lat, y: tmp.y }; }
    const y = path.y[i]; return { lat: lat + dir * (y * 1.4 + 1), y: -0.05 };
  };
  const embMat = surface(theme.embTex || theme.groundTex || "grass", theme.groundTint || 0xd8d8d8, [3, 1], { side: THREE.DoubleSide });
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

  // hazards: glossy oil slicks with a rainbow sheen, and dark puddles
  {
    const oil = new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.06, metalness: 0.4, iridescence: 1, iridescenceIOR: 1.3, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    const wet = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.65, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    const ice = new THREE.MeshStandardMaterial({ color: 0xcfe6f5, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    for (const h of path.hazards) {
      if (h.all || h.type === "split") continue;
      const blobs = h.type === "oil" ? 3 : 4;
      for (let k = 0; k < blobs; k++) {
        const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2);
        const off = (k - (blobs - 1) / 2) * h.len * 0.22, side = (k % 2 ? 1 : -1) * h.w * 0.12;
        path.pointAt(h.d + off, h.lat + side, tmp);
        const m = new THREE.Mesh(g, h.type === "oil" ? oil : h.type === "ice" ? ice : wet);
        m.position.set(tmp.x, tmp.y + 0.035, tmp.z); m.rotation.y = tmp.h + k * 0.7;
        m.scale.set(h.w * (0.32 + 0.1 * (k % 2)), 1, h.len * (0.26 + 0.06 * k));
        m.receiveShadow = true; group.add(m);
      }
    }
  }

  // split-path islands: a raised verge down the middle of the road with chevron-painted sides and a keep-left/right sign
  {
    const islands = path.hazards.filter((h) => h.type === "split");
    if (islands.length) {
      const chev = canvasTex(64, 32, (g, w, h) => {
        g.fillStyle = "#f2c230"; g.fillRect(0, 0, w, h); g.fillStyle = "#16181c";
        for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 32, h); g.lineTo(k * 32 + 16, h); g.fill(); }
      }, { repeat: [1, 1] });
      const sideMat = new THREE.MeshStandardMaterial({ map: chev, roughness: 0.7 });
      const topMat = surface(theme.groundTex || "grass", theme.groundTint || 0xd8d8d8, [1, 1]);
      const H = 0.7, sides = [], tops = [];
      for (const h of islands) {
        const n = Math.max(8, Math.round(h.len / 1.5)), sp = [], su = [], si = [], tp = [], tu = [], ti = [];
        for (let k = 0; k <= n; k++) {
          const d = h.d - h.len / 2 + (k / n) * h.len, hw = Math.max(0.15, path.islandHalf(h, d + 1e-3 * (k === 0 ? 1 : k === n ? -1 : 0)));
          const L = path.pointAt(d, h.lat - hw, { ...tmp }), R = path.pointAt(d, h.lat + hw, { ...tmp });
          const v = d / 1.4;
          // side walls (left then right), each a bottom/top pair per slice
          sp.push(L.x, L.y, L.z, L.x, L.y + H, L.z, R.x, R.y, R.z, R.x, R.y + H, R.z); su.push(v, 0, v, 1, v, 0, v, 1);
          tp.push(L.x, L.y + H, L.z, R.x, R.y + H, R.z); tu.push(0, d / 6, hw / 3, d / 6);
          if (k < n) {
            const a = k * 4, b = a + 4; si.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
            const c = k * 2, e = c + 2; ti.push(c, c + 1, e, c + 1, e + 1, e);
          }
        }
        const mk = (p, u, i) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2)); g.setIndex(i); g.computeVertexNormals(); return g; };
        sides.push(mk(sp, su, si)); tops.push(mk(tp, tu, ti));
      }
      const sm = new THREE.Mesh(merge(sides), sideMat), tm = new THREE.Mesh(merge(tops), topMat);
      sideMat.side = THREE.DoubleSide; sm.castShadow = sm.receiveShadow = tm.receiveShadow = true; group.add(sm, tm);
      // a round blue sign with two arrows on a post at each nose, facing the oncoming cars
      const signTex = canvasTex(64, 64, (g, w) => {
        g.fillStyle = "#1d5fd0"; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#fff"; g.lineWidth = 4; g.stroke();
        g.fillStyle = "#fff";
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2 + s * 6, 20); g.lineTo(w / 2 + s * 22, 34); g.lineTo(w / 2 + s * 6, 48); g.fill(); }
      });
      for (const h of islands) {
        const nose = path.pointAt(h.d - h.len / 2 + 3, h.lat, { ...tmp });
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.4 }));
        post.position.set(nose.x, nose.y + H + 0.8, nose.z);
        const sign = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
        sign.position.set(nose.x - Math.sin(nose.h) * 0.08, nose.y + H + 1.75, nose.z - Math.cos(nose.h) * 0.08); sign.rotation.y = nose.h + Math.PI;
        group.add(post, sign);
      }
    }
  }

  // rubber laid down by braking cars: faint dark tyre lines either side of the racing line into each corner
  {
    const prof = path.speedProfile(34), pos = [], idx = [];
    let n = 0;
    for (let i = 0; i < N; i++) {
      const drop = Math.max(0, Math.min(84, prof[i]) - Math.min(84, prof[(i + 14) % N])) / 12;
      if (drop < 0.35) continue;
      const lat = path.line[i] * 0.9;
      for (const o of [-0.85, 0.85]) for (const w of [-0.14, 0.14]) {
        path.pointAt(i * path.ds, lat + o + w, tmp); pos.push(tmp.x, tmp.y + 0.025, tmp.z);
        path.pointAt((i + 1) * path.ds, lat + o + w, tmp); pos.push(tmp.x, tmp.y + 0.025, tmp.z);
      }
      for (let k = 0; k < 2; k++) { const a = n + k * 4; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      n += 8;
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide })));
    }
  }

  // racing-line guide: an amber/red stripe on the ideal line in the braking zones before corners
  {
    const prof = path.speedProfile(34), pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const k = i % N, lat = path.line[k];
      // how much speed the next ~28 m asks you to lose, judged against a real top speed (~300 km/h), not the
      // profile's 500 km/h ceiling, so the stripe only shows where you actually need to brake
      const drop = Math.max(0, Math.min(84, prof[k]) - Math.min(84, prof[(k + 14) % N])) / 12;
      c.setRGB(1, 0.62 - 0.45 * Math.min(1, drop), 0.12);
      for (const o of [-0.32, 0.32]) { path.pointAt(k * path.ds, lat + o, tmp); pos.push(tmp.x, tmp.y + 0.03, tmp.z); col.push(c.r, c.g, c.b); }
      if (i < N && drop > 0.25) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // only in braking zones
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    // faint on the straights, clear amber/red where you need to brake
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.name = "racingLine"; group.add(m);
  }

  // chevron warning boards before sharp corners, on the outside, facing oncoming cars
  {
    const tex = canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = "#11141b"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffcc1f";
      for (let x = 8; x < w; x += 40) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 18, 6); g.lineTo(x + 36, 32); g.lineTo(x + 18, 58); g.lineTo(x, 58); g.lineTo(x + 18, 32); g.closePath(); g.fill(); }
    });
    const boards = { 1: [], [-1]: [] };
    let i = 0;
    while (i < N) {
      if (Math.abs(path.cs[i]) < 0.011) { i++; continue; } // gentler than ~90 m radius: no warning
      let j = i, peak = 0; while (j < i + N && Math.abs(path.cs[j % N]) >= 0.011) { peak = Math.max(peak, Math.abs(path.cs[j % N])); j++; }
      const dir = Math.sign(path.cs[i]), count = peak > 0.025 ? 3 : peak > 0.016 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const d = i * path.ds - 45 - k * 30;
        path.pointAt(d, -dir * (W + 2.2), tmp);
        boards[dir].push({ x: tmp.x, y: tmp.y, z: tmp.z, h: tmp.h });
      }
      i = j + 10;
    }
    for (const dir of [1, -1]) {
      if (!boards[dir].length) continue;
      const geo = new THREE.PlaneGeometry(3.6, 1.8); geo.translate(0, 2.1, 0);
      if (dir < 0) { const uv = geo.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setX(q, 1 - uv.getX(q)); }
      const leg = new THREE.BoxGeometry(0.14, 1.3, 0.14); leg.translate(0, 0.65, -0.03);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), boards[dir].length);
      const lm = new THREE.InstancedMesh(leg, new THREE.MeshStandardMaterial({ color: 0x30384a }), boards[dir].length);
      const o = new THREE.Object3D();
      boards[dir].forEach((b, k) => { o.position.set(b.x, b.y, b.z); o.rotation.set(0, b.h + Math.PI, 0); o.updateMatrix(); im.setMatrixAt(k, o.matrix); lm.setMatrixAt(k, o.matrix); });
      im.name = "chevrons"; group.add(im, lm);
    }
  }

  // cliff faces: a rock wall where the road drops away, with hazard stripes along the lip
  if (path.cliff.some((c) => c)) {
    const rock = new THREE.MeshStandardMaterial({ color: 0xc8b8a8, map: photo("darkrock", { repeat: [4, 2] }), normalMap: photo("darkrock_n", { repeat: [4, 2], srgb: false }), roughness: 1, side: THREE.DoubleSide });
    const lipTex = canvasTex(64, 8, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = "#ffcc1f"; g.fillRect(x, 0, 8, h); g.fillStyle = "#11141b"; g.fillRect(x + 8, 0, 8, h); } }, { repeat: [8, 1] });
    for (let i = 0; i < N; i++) {
      if (!path.cliff[i]) continue;
      const j = (i + 1) % N, top = path.y[i], bot = path.y[j];
      const face = new THREE.PlaneGeometry((W + R) * 2, top - bot + 0.5, 6, 3);
      const pa = face.attributes.position; for (let k = 0; k < pa.count; k++) pa.setZ(k, (Math.random() - 0.5) * 0.6);
      face.computeVertexNormals();
      path.pointAt(j * path.ds - 0.5, 0, tmp);
      const m = new THREE.Mesh(face, rock); m.position.set(tmp.x, (top + bot) / 2, tmp.z); m.rotation.y = tmp.h; group.add(m);
      const lip = new THREE.Mesh(new THREE.BoxGeometry((W + R) * 2, 0.25, 0.6), new THREE.MeshStandardMaterial({ map: lipTex }));
      path.pointAt(i * path.ds, 0, tmp); lip.position.set(tmp.x, top + 0.02, tmp.z); lip.rotation.y = tmp.h; group.add(lip);
    }
  }

  // ramps: striped wedges; the top follows the road and lifts to the ramp height at the lip
  if (path.ramps.length) {
    const rampTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#e8ecf0"; g.fillRect(0, 0, w, h); g.fillStyle = "#d7263d"; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 8); });
    const mat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const r of path.ramps) {
      const pos = [], uv = [], idx = [], steps = Math.max(4, Math.round(r.len / 2));
      for (let k = 0; k <= steps; k++) {
        const d = r.d - r.len + (r.len * k) / steps, hgt = (r.h * k) / steps;
        for (const lat of [r.lat - r.half, r.lat + r.half]) { path.pointAt(d, lat, tmp); pos.push(tmp.x, tmp.y + hgt + 0.02, tmp.z); uv.push(lat > r.lat ? 1 : 0, k / steps * r.len / 8); }
        if (k < steps) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      // back face down to the road at the lip
      const b0 = pos.length / 3;
      for (const lat of [r.lat - r.half, r.lat + r.half]) for (const hh of [r.h, 0]) { path.pointAt(r.d, lat, tmp); pos.push(tmp.x, tmp.y + hh + 0.02, tmp.z); uv.push(0, 0); }
      idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m);
    }
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
