// Procedural hypercar meshes built from lofted cross-sections (smooth curved bodywork, not boxes).
// Each car style is a handful of numbers (see `shape` in cars.js). Static parts are merged per material
// to keep draw calls low: roughly 20 per car including wheels.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Piecewise-linear lookup through [z, value] pairs (z descending from nose to tail is fine; we sort).
function curve(pairs) {
  const p = pairs.slice().sort((a, b) => a[0] - b[0]);
  return (z) => {
    if (z <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) if (z <= p[i][0]) { const t = (z - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); const s = t * t * (3 - 2 * t); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * s; }
    return p[p.length - 1][1];
  };
}

// Loft: for each z between z0..z1 build a rounded section from width w(z), top t(z), bottom b(z).
// tumble(z) narrows the upper half; th0..th1 lets us cut out a patch (used for doors).
function loft({ z0, z1, nz = 40, nt = 28, w, t, b, n = 2.6, tumble = () => 0.85, th0 = 0, th1 = Math.PI * 2, scale = 1, closeEnds = true }) {
  const pos = [], idx = [];
  const ring = nt + 1;
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * (i / nz);
    const W = w(z) * scale, T = t(z), B = b(z), k = tumble(z);
    for (let j = 0; j <= nt; j++) {
      const a = th0 + (th1 - th0) * (j / nt), c = Math.cos(a), s = Math.sin(a);
      const yy = B + (T - B) * (0.5 + 0.5 * sp(s, 2 / n));
      const xs = s > 0 ? 1 - (1 - k) * s * s : 1;
      pos.push(W * sp(c, 2 / n) * xs, yy + (scale - 1) * 0.5 * (T - B) * s, z);
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) {
    const a = i * ring + j, b2 = a + ring;
    idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
  }
  if (closeEnds) {
    // cap both ends with a fan
    for (const [i, flip] of [[0, true], [nz, false]]) {
      const c = pos.length / 3; let cx = 0, cy = 0;
      for (let j = 0; j <= nt; j++) { cx += pos[(i * ring + j) * 3]; cy += pos[(i * ring + j) * 3 + 1]; }
      pos.push(cx / ring, cy / ring, pos[(i * ring) * 3 + 2]);
      for (let j = 0; j < nt; j++) flip ? idx.push(c, i * ring + j + 1, i * ring + j) : idx.push(c, i * ring + j, i * ring + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const strip = (g) => { const keep = new THREE.BufferGeometry(); keep.setAttribute("position", g.getAttribute("position")); keep.setAttribute("normal", g.getAttribute("normal")); if (g.index) keep.setIndex(g.index); return keep; };
const mergeAll = (list) => mergeGeometries(list.map((g) => strip(g.index ? g : g.toNonIndexed ? g : g)), false);

const MATS = {};
function mats(paintHex) {
  if (!MATS.carbon) {
    MATS.carbon = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.4, roughness: 0.4 });
    MATS.glass = new THREE.MeshPhysicalMaterial({ color: 0x0a121c, metalness: 0.3, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 });
    MATS.dark = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.8 });
    MATS.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeeff, emissiveIntensity: 3 });
    MATS.tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
    MATS.disc = new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: 0.8, roughness: 0.35 });
  }
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.55, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.05 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a0a, emissiveIntensity: 1.4 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9aa1ab, metalness: 0.95, roughness: 0.2 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.35 }),
    ...MATS,
  };
}

export const RIMS = [
  { name: "Split 5", color: 0x9aa1ab, spokes: 5, twin: true },
  { name: "Turbine", color: 0x2a2d33, spokes: 10, twin: false },
  { name: "Gold Mesh", color: 0xc9a227, spokes: 7, twin: true },
  { name: "Chrome Y", color: 0xe6e9ee, spokes: 6, twin: false },
];

function wheelGeos(r, wdt, rim) {
  const tyre = new THREE.CylinderGeometry(r, r, wdt, 28, 1, false); tyre.rotateZ(Math.PI / 2);
  const side = new THREE.TorusGeometry(r * 0.86, r * 0.14, 6, 28); side.rotateY(Math.PI / 2);
  const s1 = side.clone().translate(wdt / 2 - 0.02, 0, 0), s2 = side.clone().translate(-wdt / 2 + 0.02, 0, 0);
  const tyreG = mergeGeometries([strip(tyre), strip(s1), strip(s2)]);
  const parts = [];
  const barrel = new THREE.CylinderGeometry(r * 0.7, r * 0.7, wdt * 0.9, 24, 1, true); barrel.rotateZ(Math.PI / 2); parts.push(strip(barrel));
  const hub = new THREE.CylinderGeometry(r * 0.13, r * 0.13, wdt * 0.98, 10); hub.rotateZ(Math.PI / 2); parts.push(strip(hub));
  for (let k = 0; k < rim.spokes; k++) {
    for (const o of rim.twin ? [-0.09, 0.09] : [0]) {
      const g = new THREE.BoxGeometry(0.04, r * 0.6, 0.045); g.translate(wdt * 0.42, r * 0.38, 0); g.rotateX((k / rim.spokes) * Math.PI * 2 + o); parts.push(strip(g));
    }
  }
  const disc = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.04, 20); disc.rotateZ(Math.PI / 2);
  return { tyre: tyreG, rim: mergeGeometries(parts), disc };
}

export function makeCar(def, paintHex, rimIdx = 0) {
  const S = Object.assign({ len: 4.7, wid: 1.0, nose: 0.42, hood: 0.72, deck: 0.92, tail: 0.86, cabinZ: 0.0, cabinLen: 2.2, cabinH: 1.14, cabinW: 0.66,
    wing: "high", wheelR: 0.36, intake: true, splitter: true, fin: false }, def.shape || {});
  const M = mats(paintHex);
  const L = S.len / 2, zf = 1.42 * (S.len / 4.7), zr = -1.38 * (S.len / 4.7);
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);

  // body profile
  const arch = (z) => Math.max(0, 1 - ((z - zf) / 0.5) ** 2) ** 0.5 + Math.max(0, 1 - ((z - zr) / 0.52) ** 2) ** 0.5;
  const w = (z) => S.wid * curve([[L, 0.78], [L - 0.35, 0.93], [zf, 1.0], [0.4, 0.94], [-0.5, 0.96], [zr, 1.03], [-L + 0.3, 0.97], [-L, 0.9]])(z) + 0.035 * arch(z);
  const t = curve([[L, S.nose - 0.12], [L - 0.15, S.nose], [L - 0.6, S.hood - 0.12], [zf, S.hood], [S.cabinZ + 0.8, S.hood + 0.06], [S.cabinZ - 0.6, S.deck], [-L + 0.25, S.tail], [-L, S.tail - 0.25]]);
  const b = (z) => 0.16 + 0.02 * smooth(L - 0.5, L, z) + 0.5 * Math.min(1, arch(z)) * smooth(0, 1, arch(z) * 2);
  const shell = loft({ z0: -L, z1: L, nz: 64, nt: 32, w, t, b, n: 3.2, tumble: () => 0.8 });
  // cabin canopy
  const c0 = S.cabinZ - S.cabinLen * 0.55, c1 = S.cabinZ + S.cabinLen * 0.45;
  const ct = curve([[c1, t(c1) - 0.02], [c1 - 0.55, S.cabinH - 0.05], [S.cabinZ - 0.2, S.cabinH], [c0 + 0.5, S.cabinH - 0.12], [c0, t(c0) + 0.02]]);
  const cabin = loft({ z0: c0, z1: c1, nz: 28, nt: 22, w: (z) => S.cabinW * (0.85 + 0.15 * Math.sin(Math.PI * (z - c0) / (c1 - c0))), t: ct, b: (z) => t(z) - 0.12, n: 2.4, tumble: () => 0.62 });
  const paintParts = [shell];
  // roof spine in body colour
  paintParts.push(loft({ z0: c0 + 0.35, z1: c1 - 0.5, nz: 16, nt: 10, w: () => 0.16, t: (z) => ct(z) + 0.025, b: (z) => ct(z) - 0.04, n: 2, th0: 0, th1: Math.PI }));
  // mirrors
  for (const s of [-1, 1]) paintParts.push(box(0.2, 0.08, 0.14, s * (S.cabinW + 0.18), t(c1 - 0.4) + 0.12, c1 - 0.45));
  const carbonParts = [];
  if (S.splitter) carbonParts.push(box(S.wid * 2.02, 0.04, 0.4, 0, 0.17, L - 0.15));
  carbonParts.push(box(S.wid * 1.8, 0.24, 0.35, 0, 0.3, -L + 0.12, 0.45));
  if (S.intake) for (const s of [-1, 1]) carbonParts.push(box(0.06, 0.26, 0.7, s * (w(-0.7) + 0.0), t(-0.7) - 0.28, -0.75));
  // wing
  const wingY = S.wing === "high" ? S.deck + 0.42 : S.deck + 0.12;
  if (S.wing === "high" || S.wing === "low") {
    carbonParts.push(box(S.wid * 2.1, 0.05, 0.42, 0, wingY, -L + 0.3, -0.12));
    for (const s of [-1, 1]) {
      carbonParts.push(box(0.04, 0.24, 0.5, s * S.wid * 1.05, wingY - 0.04, -L + 0.3));
      if (S.wing === "high") carbonParts.push(box(0.05, wingY - S.deck + 0.05, 0.1, s * 0.45, (wingY + S.deck) / 2 - 0.02, -L + 0.4));
    }
  } else if (S.wing === "duck") paintParts.push(box(S.wid * 1.7, 0.06, 0.22, 0, S.tail + 0.05, -L + 0.12, -0.35));
  if (S.fin) paintParts.push(box(0.04, 0.3, 1.3, 0, S.deck + 0.12, -L + 0.85));

  const add = (geos, mat, shadow = true) => { const m = new THREE.Mesh(mergeAll(geos), mat); m.castShadow = shadow; body.add(m); return m; };
  add(paintParts, M.paint);
  add([cabin], M.glass);
  add(carbonParts, M.carbon);
  // lights
  const heads = [], tails = [];
  for (const s of [-1, 1]) heads.push(box(0.42, 0.05, 0.16, s * S.wid * 0.6, t(L - 0.3) - 0.04, L - 0.28, -0.3, s * 0.35));
  tails.push(box(S.wid * 1.75, 0.05, 0.05, 0, S.tail - 0.06, -L + 0.02));
  for (const s of [-1, 1]) tails.push(box(0.05, 0.16, 0.05, s * S.wid * 0.86, S.tail - 0.12, -L + 0.03));
  add(heads, M.head, false);
  const tailMesh = add(tails, M.tail, false);
  // grille / arch shadows
  add([box(S.wid * 1.2, 0.12, 0.05, 0, S.nose - 0.22, L - 0.04), box(S.wid * 1.5, 0.14, 0.05, 0, 0.42, -L + 0.08)], M.dark, false);

  // doors: a patch of the body side, hinged according to the style
  const doors = [];
  const dz0 = c0 + 0.45, dz1 = Math.min(c1 - 0.05, zf - 0.45);
  for (const s of [-1, 1]) {
    const th0 = s > 0 ? -0.35 : Math.PI - 0.95, th1 = s > 0 ? 0.95 : Math.PI + 0.35;
    const g = loft({ z0: dz0, z1: dz1, nz: 12, nt: 10, w, t, b: () => 0.22, n: 3.2, tumble: () => 0.8, th0, th1, scale: 1.012, closeEnds: false });
    const hinge = new THREE.Group();
    const hy = t(dz1), hx = s * w(dz1);
    hinge.position.set(def.doors === "gullwing" ? s * 0.15 : hx, def.doors === "gullwing" ? ct(S.cabinZ) : hy, def.doors === "gullwing" ? (dz0 + dz1) / 2 : dz1);
    const mesh = new THREE.Mesh(g, M.paint); mesh.position.set(-hinge.position.x, -hinge.position.y, -hinge.position.z);
    const win = loft({ z0: dz0 + 0.05, z1: dz1 - 0.05, nz: 6, nt: 6, w: (z) => S.cabinW * 1.02, t: (z) => ct(z) - 0.03, b: (z) => t(z) - 0.06, n: 2.4, tumble: () => 0.62, th0: s > 0 ? 0.15 : Math.PI - 1.2, th1: s > 0 ? 1.2 : Math.PI - 0.15, closeEnds: false });
    const wm = new THREE.Mesh(win, M.glass); wm.position.copy(mesh.position);
    mesh.material.side = THREE.DoubleSide;
    hinge.add(mesh, wm); hinge.userData.side = s; body.add(hinge); doors.push(hinge);
  }
  // interior hint (seats) visible with doors open
  add([box(0.42, 0.5, 0.12, 0.33, t(0) - 0.05, -0.45, -0.3), box(0.42, 0.5, 0.12, -0.33, t(0) - 0.05, -0.45, -0.3)], new THREE.MeshStandardMaterial({ color: 0x2a0f0f, roughness: 0.8 }), false);

  // wheels
  const rim = RIMS[rimIdx % RIMS.length];
  const wg = wheelGeos(S.wheelR, 0.32, rim);
  const rimMat = M.rim; rimMat.color.setHex(rim.color);
  const wheels = [], steerers = [], rimMeshes = [];
  [[1, zf], [-1, zf], [1, zr], [-1, zr]].forEach(([s, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(s * (S.wid * 0.9), S.wheelR, z); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tm = new THREE.Mesh(wg.tyre, M.tyre); tm.castShadow = true; spin.add(tm);
    const rm = new THREE.Mesh(wg.rim, rimMat); rm.scale.x = s; spin.add(rm); rimMeshes.push(rm);
    const disc = new THREE.Mesh(wg.disc, M.disc); disc.position.x = -s * 0.05; pivot.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.26), M.caliper); cal.position.set(-s * 0.02, S.wheelR * 0.42, 0.12 * Math.sign(z)); pivot.add(cal);
    wheels.push(spin); if (i < 2) steerers.push(pivot);
  });
  return { group: car, body, doors, doorType: def.doors || "scissor", wheels, steerers, paint: M.paint, rimMat, tailMat: M.tail, tailMesh,
    exhaust: [new THREE.Vector3(-0.32, 0.38, -L - 0.02), new THREE.Vector3(0.32, 0.38, -L - 0.02)] };
}

// Animate the doors: 0 = shut, 1 = fully open. Each style opens a different way.
export function setDoors(car, open) {
  const o = Math.max(0, Math.min(1, open));
  for (const d of car.doors) {
    const s = d.userData.side;
    d.rotation.set(0, 0, 0);
    if (car.doorType === "scissor") d.rotation.x = -o * 1.25;
    else if (car.doorType === "butterfly") { d.rotation.x = -o * 1.0; d.rotation.z = s * o * 0.55; }
    else if (car.doorType === "gullwing") d.rotation.z = s * o * 1.25;
    else if (car.doorType === "dihedral") { d.rotation.x = -o * 0.6; d.rotation.y = s * o * 0.5; d.rotation.z = s * o * 0.35; }
    else d.rotation.y = s * o * 1.1;
  }
}

export function setRims(car, idx) {
  const rim = RIMS[idx % RIMS.length];
  car.rimMat.color.setHex(rim.color);
}
