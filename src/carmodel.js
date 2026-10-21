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
    idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
  }
  if (closeEnds) {
    // cap both ends with a fan
    for (const [i, flip] of [[0, true], [nz, false]]) {
      const c = pos.length / 3; let cx = 0, cy = 0;
      for (let j = 0; j <= nt; j++) { cx += pos[(i * ring + j) * 3]; cy += pos[(i * ring + j) * 3 + 1]; }
      pos.push(cx / ring, cy / ring, pos[(i * ring) * 3 + 2]);
      for (let j = 0; j < nt; j++) flip ? idx.push(c, i * ring + j, i * ring + j + 1) : idx.push(c, i * ring + j + 1, i * ring + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const strip = (g) => { const keep = new THREE.BufferGeometry(); keep.setAttribute("position", g.getAttribute("position")); keep.setAttribute("normal", g.getAttribute("normal")); if (g.index) keep.setIndex(g.index); return keep; };
// merge parts into one geometry; if any part has no index (extruded shapes), drop the index from all of them so they match
const mergeAll = (list) => { const flat = list.some((g) => !g.index); return mergeGeometries(list.map((g) => strip(flat && g.index ? g.toNonIndexed() : g)), false); };

// a wing section: a rounded leading edge tapering to a thin trailing edge, extruded across the car's width
function aerofoil(span, chord, thick, x, y, z, aoa) {
  const sh = new THREE.Shape(); sh.moveTo(0, 0);
  sh.bezierCurveTo(0, thick * 0.9, chord * 0.25, thick, chord * 0.45, thick * 0.8); sh.bezierCurveTo(chord * 0.75, thick * 0.55, chord * 0.95, thick * 0.2, chord, 0.005);
  sh.lineTo(chord, -0.005); sh.bezierCurveTo(chord * 0.7, -thick * 0.15, chord * 0.2, -thick * 0.3, 0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -span / 2); g.rotateY(Math.PI / 2); g.rotateX(aoa); g.translate(x, y, z); g.computeVertexNormals();
  return g;
}

const MATS = {};
function mats(paintHex) {
  if (!MATS.carbon) {
    MATS.carbon = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.4, roughness: 0.4 });
    // tinted glass you can see into (the cabin has seats, a dash and a wheel), with crisp sky reflections on top
    MATS.glass = new THREE.MeshPhysicalMaterial({ color: 0x1b2a38, metalness: 0.1, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.7,
      transparent: true, opacity: 0.62, depthWrite: false, specularIntensity: 1, side: THREE.DoubleSide });
    MATS.cabin = new THREE.MeshStandardMaterial({ color: 0x16171b, roughness: 0.85 });
    MATS.leather = new THREE.MeshStandardMaterial({ color: 0x5a1a14, roughness: 0.6 });
    MATS.trim = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide });
    MATS.dark = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.8 });
    MATS.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfeeff, emissiveIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3 });
    MATS.tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
    // drilled brake discs: a ring of small dark holes on a brushed-metal disc
    const dc = document.createElement("canvas"); dc.width = dc.height = 128; const dg = dc.getContext("2d");
    dg.fillStyle = "#7a7e86"; dg.fillRect(0, 0, 128, 128); dg.fillStyle = "#2a2c30";
    for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2 + ring * 0.13, rr = 34 + ring * 9; dg.beginPath(); dg.arc(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 2.2, 0, Math.PI * 2); dg.fill(); }
    dg.fillStyle = "#3a3d42"; dg.beginPath(); dg.arc(64, 64, 26, 0, Math.PI * 2); dg.fill();
    const discTex = new THREE.CanvasTexture(dc); discTex.colorSpace = THREE.SRGBColorSpace;
    MATS.disc = new THREE.MeshStandardMaterial({ color: 0xffffff, map: discTex, metalness: 0.75, roughness: 0.38 });
    MATS.wall = new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.9, transparent: true, alphaTest: 0.01, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a0a, emissiveIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -3 }),
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

let _blurTex = null;
function blurTex() {
  if (_blurTex) return _blurTex;
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, "rgba(90,90,90,1)"); r.addColorStop(0.2, "rgba(200,200,200,.9)"); r.addColorStop(0.5, "rgba(150,150,150,.65)"); r.addColorStop(0.85, "rgba(210,210,210,.8)"); r.addColorStop(1, "rgba(60,60,60,1)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  _blurTex = new THREE.CanvasTexture(c); _blurTex.colorSpace = THREE.SRGBColorSpace;
  return _blurTex;
}
// spinning-wheel blur from speed (m/s): invisible when slow, mostly opaque flat out
export function wheelBlur(model, speed) {
  if (!model.blurs) return;
  const k = Math.max(0, Math.min(0.85, (Math.abs(speed) - 12) / 25));
  model.blurMat.opacity = k; for (const b of model.blurs) b.visible = k > 0.02;
}

// sidewall lettering for the tyres (a made-up brand), drawn round a ring and shared by every car
let _wallTex = null;
function wallTex() {
  if (_wallTex) return _wallTex;
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#151515"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#cfd3d8"; g.font = "bold 15px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  const say = (txt, a0) => { [...txt].forEach((ch, i) => { const a = a0 + i * 0.075; g.save(); g.translate(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); }); };
  say("APEX RACING", -Math.PI / 2 - 0.4); say("APEX RACING", Math.PI / 2 - 0.4);
  g.font = "bold 10px Arial, sans-serif"; [..."285/30 R20"].forEach((ch, i) => { const a = 0.2 + i * 0.055; g.save(); g.translate(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); });
  _wallTex = new THREE.CanvasTexture(c); _wallTex.colorSpace = THREE.SRGBColorSpace; _wallTex.anisotropy = 4;
  return _wallTex;
}
function wheelGeos(r, wdt, rim) {
  // a tyre with rounded shoulders (a lathe of its cross-section), so it isn't a plain cylinder
  const hw = wdt / 2, prof = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; prof.push(new THREE.Vector2(r - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * (hw - 0.01) * 0.98)); }
  prof.unshift(new THREE.Vector2(r * 0.7, -hw * 0.93)); prof.push(new THREE.Vector2(r * 0.7, hw * 0.93));
  const tyreG = new THREE.LatheGeometry(prof, 32); tyreG.rotateZ(Math.PI / 2);
  const parts = [];
  const barrel = new THREE.CylinderGeometry(r * 0.7, r * 0.7, wdt * 0.9, 24, 1, true); barrel.rotateZ(Math.PI / 2); parts.push(strip(barrel));
  const hub = new THREE.CylinderGeometry(r * 0.13, r * 0.13, wdt * 0.98, 10); hub.rotateZ(Math.PI / 2); parts.push(strip(hub));
  for (let k = 0; k < rim.spokes; k++) {
    for (const o of rim.twin ? [-0.09, 0.09] : [0]) {
      const g = new THREE.BoxGeometry(0.04, r * 0.6, 0.045); g.translate(wdt * 0.42, r * 0.38, 0); g.rotateX((k / rim.spokes) * Math.PI * 2 + o); parts.push(strip(g));
    }
  }
  const cap = new THREE.CylinderGeometry(r * 0.1, r * 0.12, 0.03, 12); cap.rotateZ(Math.PI / 2); cap.translate(wdt * 0.47, 0, 0); parts.push(strip(cap)); // centre-lock nut
  const disc = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.04, 24); disc.rotateZ(Math.PI / 2);
  // the lettered sidewall on the outside face of the tyre
  const wall = new THREE.RingGeometry(r * 0.72, r * 0.97, 40); wall.rotateY(Math.PI / 2); wall.translate(hw * 0.95, 0, 0);
  return { tyre: tyreG, rim: mergeGeometries(parts), disc, wall };
}

export function makeCar(def, paintHex, rimIdx = 0, decalIdx = 0) {
  const S = Object.assign({ bulge: 0.035, waist: 1, n: 3.2, tumble: 0.8, len: 4.7, wid: 1.0, nose: 0.42, hood: 0.72, deck: 0.92, tail: 0.86, cabinZ: -0.05, cabinLen: 2.3, cabinH: 1.2, cabinW: 0.72,
    wing: "high", wheelR: 0.36, intake: true, splitter: true, fin: false }, def.shape || {});
  const M = mats(paintHex);
  const L = S.len / 2, zf = 1.42 * (S.len / 4.7), zr = -1.38 * (S.len / 4.7);
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);

  // body profile
  const arch = (z) => Math.max(0, 1 - ((z - zf) / 0.5) ** 2) ** 0.5 + Math.max(0, 1 - ((z - zr) / 0.52) ** 2) ** 0.5;
  // waist < 1 pinches the body between the wheels, bulge > 0 swells the fenders over them
  const w = (z) => S.wid * curve([[L, 0.78], [L - 0.35, 0.93], [zf, 1.0], [0.4, 0.94 * S.waist], [-0.5, 0.96 * S.waist], [zr, 1.03], [-L + 0.3, 0.97], [-L, 0.9]])(z) + S.bulge * arch(z);
  const t = curve([[L, S.nose - 0.12], [L - 0.15, S.nose], [L - 0.6, S.hood - 0.12], [zf, S.hood], [S.cabinZ + 0.8, S.hood + 0.06], [S.cabinZ - 0.6, S.deck], [-L + 0.25, S.tail], [-L, S.tail - 0.25]]);
  const b = (z) => 0.16 + 0.02 * smooth(L - 0.5, L, z) + 0.5 * Math.min(1, arch(z)) * smooth(0, 1, arch(z) * 2);
  const shell = loft({ z0: -L, z1: L, nz: 84, nt: 40, w, t, b, n: S.n, tumble: () => S.tumble });
  // cabin canopy
  const c0 = S.cabinZ - S.cabinLen * 0.55, c1 = S.cabinZ + S.cabinLen * 0.45;
  const ct = curve([[c1, t(c1) - 0.02], [c1 - 0.55, S.cabinH - 0.05], [S.cabinZ - 0.2, S.cabinH], [c0 + 0.5, S.cabinH - 0.12], [c0, t(c0) + 0.02]]);
  const cabin = loft({ z0: c0, z1: c1, nz: 36, nt: 28, w: (z) => S.cabinW * (0.85 + 0.15 * Math.sin(Math.PI * (z - c0) / (c1 - c0))), t: ct, b: (z) => t(z) - 0.12, n: 2.4, tumble: () => 0.62 });
  const paintParts = [shell];
  // roof spine in body colour
  paintParts.push(loft({ z0: c0 + 0.35, z1: c1 - 0.5, nz: 16, nt: 10, w: () => 0.16, t: (z) => ct(z) + 0.025, b: (z) => ct(z) - 0.04, n: 2, th0: 0, th1: Math.PI }));
  // mirrors
  const mz = c1 - 0.55;
  for (const s of [-1, 1]) {
    const cap = new THREE.SphereGeometry(0.1, 14, 10); cap.scale(0.85, 0.55, 1.15); cap.translate(s * (w(mz) + 0.01), t(mz) + 0.14, mz); paintParts.push(cap);
    const arm = new THREE.CylinderGeometry(0.018, 0.022, 0.16, 8); arm.rotateZ(s * 0.9); arm.translate(s * (w(mz) - 0.07), t(mz) + 0.08, mz); paintParts.push(arm);
  }
  const carbonParts = [];
  if (S.splitter) carbonParts.push(box(S.wid * 2.02, 0.04, 0.4, 0, 0.17, L - 0.15));
  carbonParts.push(box(S.wid * 1.8, 0.24, 0.35, 0, 0.3, -L + 0.12, 0.45));
  const scoops = [];
  if (S.intake) scoops.push(loft({ z0: -1.05, z1: -0.42, nz: 8, nt: 4, w, t, b, n: S.n, tumble: () => S.tumble, th0: -0.12, th1: 0.32, scale: 1.006, closeEnds: false }),
    loft({ z0: -1.05, z1: -0.42, nz: 8, nt: 4, w, t, b, n: S.n, tumble: () => S.tumble, th0: Math.PI - 0.32, th1: Math.PI + 0.12, scale: 1.006, closeEnds: false }));
  // rear diffuser: vertical strakes under the bumper
  for (let k = -2; k <= 2; k++) carbonParts.push(box(0.025, 0.16, 0.42, k * S.wid * 0.32, 0.19, -L + 0.2));
  const chrome = [];
  for (const s of [-1, 1]) {
    const ex = new THREE.CylinderGeometry(0.075, 0.085, 0.24, 14, 1, true); ex.rotateX(Math.PI / 2); ex.translate(s * 0.32, 0.38, -L + 0.02); chrome.push(ex);
    const lip = new THREE.TorusGeometry(0.078, 0.012, 6, 16); lip.translate(s * 0.32, 0.38, -L - 0.1); chrome.push(lip);
  }
  // wing
  const wingY = S.wing === "high" ? S.deck + 0.42 : S.deck + 0.12;
  if (S.wing === "high" || S.wing === "low") {
    carbonParts.push(aerofoil(S.wid * 2.1, 0.44, 0.065, 0, wingY, -L + 0.52, -0.12));
    for (const s of [-1, 1]) {
      carbonParts.push(box(0.018, 0.17, 0.48, s * S.wid * 1.05, wingY - 0.01, -L + 0.5, 0.12)); // slim endplates
      if (S.wing === "high") { // slim swept struts from the deck up to the wing
        const h = wingY - S.deck + 0.02, strut = new THREE.BoxGeometry(0.035, h, 0.16); strut.rotateX(0.25); strut.translate(s * 0.45, S.deck + h / 2 - 0.02, -L + 0.55); carbonParts.push(strut);
      }
    }
  } else if (S.wing === "duck") paintParts.push(box(S.wid * 1.7, 0.06, 0.22, 0, S.tail + 0.05, -L + 0.12, -0.35));
  if (S.fin) paintParts.push(box(0.035, 0.16, 1.0, 0, S.deck + 0.06, -L + 0.95, -0.08));

  const add = (geos, mat, shadow = true) => { const m = new THREE.Mesh(mergeAll(geos), mat); m.castShadow = shadow; body.add(m); return m; };
  add(paintParts, M.paint);
  add([cabin], M.glass);
  add(carbonParts, M.carbon);
  // lights
  const heads = [], tails = [];
  // light strips are thin patches of the body surface, so they follow its curves
  const patch = (th0, th1, z0, z1, sc = 1.01) => loft({ z0, z1, nz: 8, nt: 16, w, t, b, n: S.n, tumble: () => S.tumble, th0, th1, scale: sc, closeEnds: false });
  const hl = S.lights || 0;
  const hz0 = L - (hl === 1 ? 0.62 : 0.5), hz1 = L - (hl === 1 ? 0.5 : 0.3);
  heads.push(patch(0.22, hl === 2 ? 0.75 : 0.55, hz0, hz1), patch(Math.PI - (hl === 2 ? 0.75 : 0.55), Math.PI - 0.22, hz0, hz1));
  tails.push(patch(0.3, Math.PI - 0.3, -L + 0.12, -L + 0.17, 1.015));
  const tz = -L + 0.1, ty = t(tz) - 0.1;
  for (const s of [-1, 1]) tails.push(box(0.05, 0.14, 0.06, s * S.wid * 0.8, ty - 0.06, tz - 0.08));
  add(heads, M.head, false);
  add(chrome, M.rim, false);
  // LED projector lenses: two small glowing lenses tucked under each headlight strip
  const lenses = [];
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const z = hz0 + 0.02 + k * 0.1, x = s * (w(z) * (0.62 + k * 0.12)), lens = new THREE.SphereGeometry(0.045, 10, 8);
    lens.scale(1, 0.75, 0.6); lens.translate(x, t(z) - 0.06, z + 0.02); lenses.push(lens);
  }
  add(lenses, M.head, false);
  const tailMesh = add(tails, M.tail, false);
  // grille / arch shadows / scoops
  add([...scoops, box(S.wid * 1.1, 0.1, 0.12, 0, (t(L - 0.08) + 0.2) / 2, L - 0.08), box(S.wid * 1.4, 0.14, 0.08, 0, 0.42, -L + 0.06)], M.dark, false);

  // doors: a patch of the body side, hinged according to the style
  const doors = [];
  const dz0 = c0 + 0.45, dz1 = Math.min(c1 - 0.05, zf - 0.45);
  for (const s of [-1, 1]) {
    const th0 = s > 0 ? -0.35 : Math.PI - 0.95, th1 = s > 0 ? 0.95 : Math.PI + 0.35;
    const g = loft({ z0: dz0, z1: dz1, nz: 12, nt: 10, w, t, b: () => 0.22, n: S.n, tumble: () => S.tumble, th0, th1, scale: 1.012, closeEnds: false });
    const hinge = new THREE.Group();
    const hy = t(dz1), hx = s * w(dz1);
    hinge.position.set(def.doors === "gullwing" ? s * 0.15 : hx, def.doors === "gullwing" ? ct(S.cabinZ) : hy, def.doors === "gullwing" ? (dz0 + dz1) / 2 : dz1);
    const mesh = new THREE.Mesh(g, M.paint); mesh.position.set(-hinge.position.x, -hinge.position.y, -hinge.position.z);
    const win = loft({ z0: dz0 + 0.05, z1: dz1 - 0.05, nz: 6, nt: 6, w: (z) => S.cabinW * 1.02, t: (z) => ct(z) - 0.03, b: (z) => t(z) - 0.06, n: 2.4, tumble: () => 0.62, th0: s > 0 ? 0.15 : Math.PI - 1.2, th1: s > 0 ? 1.2 : Math.PI - 0.15, closeEnds: false });
    const wm = new THREE.Mesh(win, M.glass); wm.position.copy(mesh.position);
    const card = new THREE.Mesh(loft({ z0: dz0 + 0.04, z1: dz1 - 0.04, nz: 10, nt: 8, w: (z) => w(z) - 0.06, t: (z) => t(z) - 0.04, b: () => 0.27, n: S.n, tumble: () => S.tumble, th0, th1, scale: 1, closeEnds: false }), M.trim);
    card.position.copy(mesh.position);
    mesh.material.side = THREE.DoubleSide;
    hinge.add(mesh, card, wm); hinge.userData.side = s; body.add(hinge); doors.push(hinge);
  }
  // rear number plate (made-up registration)
  {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: plateTex(def.id), roughness: 0.4, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
    plate.position.set(0, Math.max(0.36, Math.min(0.52, S.tail - 0.42)), -L - 0.015); plate.rotation.y = Math.PI; body.add(plate);
  }
  // the cabin you see through the glass: a dark tub over the body top, seat backs with headrests, a dash and a steering wheel
  const tub = loft({ z0: c0 + 0.1, z1: c1 - 0.1, nz: 12, nt: 12, w: (z) => S.cabinW * 0.95, t: (z) => t(z) + 0.012, b: (z) => t(z) - 0.05, n: 2.4, tumble: () => 0.62, th0: 0.2, th1: Math.PI - 0.2, closeEnds: false });
  add([tub, box(S.cabinW * 1.5, 0.08, 0.32, 0, t(c1 - 0.35) + 0.07, c1 - 0.35, -0.25)], M.cabin, false);
  // seat backs sized to fit under the canopy (the roof is lowest at the sides, so they sit well inside it)
  const seatZ = S.cabinZ - 0.3, seats = [], sx = Math.min(0.22, S.cabinW * 0.3);
  const top = ct(seatZ) - 0.24, base = t(seatZ) + 0.04, r = 0.11, len = Math.max(0.02, top - base - 2 * r); // tops stay well under the curved roof
  for (const s of [-1, 1]) {
    const back = new THREE.CapsuleGeometry(r, len, 4, 10); back.scale(1, 1, 0.45); back.rotateX(-0.2);
    back.translate(s * sx, base + r + len / 2, seatZ); seats.push(back);
  }
  add(seats, M.leather, false);
  const wheel = new THREE.TorusGeometry(0.13, 0.018, 6, 20); wheel.rotateX(-0.55); wheel.translate(0.31, t(c1 - 0.55) + 0.18, c1 - 0.55);
  add([wheel], M.carbon, false);

  // wheels
  const rim = RIMS[rimIdx % RIMS.length];
  const wg = wheelGeos(S.wheelR, 0.32, rim);
  const rimMat = M.rim; rimMat.color.setHex(rim.color);
  const wheels = [], steerers = [], rimMeshes = [], blurs = [];
  // spoke blur: at speed a soft spinning-disc look replaces the sharp spokes (opacity set from speed in main.js)
  const blurMat = new THREE.MeshStandardMaterial({ map: blurTex(), color: rim.color, metalness: 0.7, roughness: 0.35, transparent: true, opacity: 0, depthWrite: false });
  const blurGeo = new THREE.CircleGeometry(S.wheelR * 0.72, 24);
  [[1, zf], [-1, zf], [1, zr], [-1, zr]].forEach(([s, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(s * (S.wid * 0.9), S.wheelR, z); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tm = new THREE.Mesh(wg.tyre, M.tyre); tm.castShadow = true; spin.add(tm);
    const wl = new THREE.Mesh(wg.wall, M.wall); wl.scale.x = s; spin.add(wl);
    const rm = new THREE.Mesh(wg.rim, rimMat); rm.scale.x = s; spin.add(rm); rimMeshes.push(rm);
    const disc = new THREE.Mesh(wg.disc, M.disc); disc.position.x = -s * 0.05; pivot.add(disc);
    const bl = new THREE.Mesh(blurGeo, blurMat); bl.rotation.y = s * Math.PI / 2; bl.position.x = s * 0.17; bl.visible = false; pivot.add(bl); blurs.push(bl);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.26), M.caliper); cal.position.set(-s * 0.02, S.wheelR * 0.42, 0.12 * Math.sign(z)); pivot.add(cal);
    wheels.push(spin); if (i < 2) steerers.push(pivot);
  });
  const model = { blurs, blurMat, group: car, body, doors, doorType: def.doors || "scissor", wheels, steerers, paint: M.paint, rimMat, tailMat: M.tail, tailMesh, headMat: MATS.head,
    decalCtx: { w, t, b, L, dz0, dz1, n: S.n, tumble: S.tumble, number: (def.id.charCodeAt(0) % 9) + 1 },
    exhaust: [new THREE.Vector3(-0.32, 0.38, -L - 0.02), new THREE.Vector3(0.32, 0.38, -L - 0.02)] };
  setDecal(model, decalIdx, paintHex);
  return model;
}

// Animate the doors: 0 = shut, 1 = fully open. Each style opens a different way.
export function setDoors(car, open) {
  let o = Math.max(0, Math.min(1, open)); o = o * o * (3 - 2 * o); // ease in and out, so doors glide rather than snap
  for (const d of car.doors) {
    const s = d.userData.side;
    d.rotation.set(0, 0, 0);
    if (car.doorType === "scissor") d.rotation.x = o * 1.25;
    else if (car.doorType === "butterfly") { d.rotation.x = o * 1.0; d.rotation.z = s * o * 0.55; }
    else if (car.doorType === "gullwing") d.rotation.z = s * o * 1.25;
    else if (car.doorType === "dihedral") { d.rotation.x = o * 0.6; d.rotation.y = s * o * 0.5; d.rotation.z = s * o * 0.35; }
    else d.rotation.y = s * o * 1.1;
  }
}

export function setRims(car, idx) {
  const rim = RIMS[idx % RIMS.length];
  car.rimMat.color.setHex(rim.color); if (car.blurMat) car.blurMat.color.setHex(rim.color);
}

// Paint finishes: changes how the paint reflects light (gloss is the default clear-coat look).
export const FINISHES = [{ name: "Gloss" }, { name: "Matte" }, { name: "Metallic" }, { name: "Pearl" }, { name: "Neon glow" }];
export function setFinish(model, idx, paintHex) {
  const m = model.paint;
  Object.assign(m, { metalness: 0.5, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08, iridescence: 0, emissiveIntensity: 0 });
  m.emissive.setHex(0x000000);
  if (idx === 1) Object.assign(m, { metalness: 0.15, roughness: 0.62, clearcoat: 0 });
  else if (idx === 2) Object.assign(m, { metalness: 0.92, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04 });
  else if (idx === 3) Object.assign(m, { metalness: 0.35, roughness: 0.25, clearcoat: 1, iridescence: 0.85, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 520] });
  else if (idx === 4) { m.emissive.setHex(paintHex); m.emissiveIntensity = 0.32; }
  m.needsUpdate = true;
}

export const DECALS = [{ name: "None" }, { name: "Twin stripes" }, { name: "Centre stripe" }, { name: "Side flash" }, { name: "Race number" },
  { name: "Le Mans" }, { name: "Two-tone" }, { name: "Stripes + number" }];

// Decals are thin patches lifted just off the bodywork, in a colour that contrasts with the paint.
// livery colours for stripes and numbers; 0 = automatic (dark on light paint, white on dark)
export const LIVERY = [{ name: "Auto" }, { name: "White", hex: 0xf2f4f7 }, { name: "Black", hex: 0x14161b }, { name: "Red", hex: 0xd7263d }, { name: "Gold", hex: 0xe0a526 }, { name: "Cyan", hex: 0x2bc4e8 }, { name: "Lime", hex: 0x8fd400 }];
export function setDecal(car, idx, paintHex, livery = car.livery || 0) {
  car.livery = livery;
  if (car.decals) { car.decals.forEach((m) => { m.removeFromParent(); m.geometry.dispose(); }); }
  car.decals = [];
  const c = new THREE.Color(paintHex), lum = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  const mat = new THREE.MeshPhysicalMaterial({ color: LIVERY[livery] && LIVERY[livery].hex != null ? LIVERY[livery].hex : lum > 0.55 ? 0x14161b : 0xf2f4f7, roughness: 0.3, clearcoat: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const { w, t, b, L, dz0, dz1, n: secN, tumble: tb } = car.decalCtx;
  const patch = (th0, th1, z0, z1) => { const m = new THREE.Mesh(loft({ z0, z1, nz: 40, nt: 3, w, t, b, n: secN, tumble: () => tb, th0, th1, scale: 1.012, closeEnds: false }), mat); car.body.add(m); car.decals.push(m); };
  const top = Math.PI / 2;
  if (idx === 1) { patch(top - 0.24, top - 0.12, -L + 0.05, L - 0.05); patch(top + 0.12, top + 0.24, -L + 0.05, L - 0.05); }
  else if (idx === 2) patch(top - 0.09, top + 0.09, -L + 0.05, L - 0.05);
  else if (idx === 3) { patch(-0.05, 0.18, -L + 0.4, dz0 - 0.05); patch(Math.PI - 0.18, Math.PI + 0.05, -L + 0.4, dz0 - 0.05); patch(-0.05, 0.12, dz1 + 0.05, L - 0.4); patch(Math.PI - 0.12, Math.PI + 0.05, dz1 + 0.05, L - 0.4); }
  else if (idx === 6) { patch(-0.32, 0.05, -L + 0.08, L - 0.08); patch(Math.PI - 0.05, Math.PI + 0.32, -L + 0.08, L - 0.08); } // lower body in the livery colour
  if (idx === 5) patch(top - 0.09, top + 0.09, -L + 0.05, L - 0.05);
  if (idx === 7) { patch(top - 0.24, top - 0.12, -L + 0.05, L - 0.05); patch(top + 0.12, top + 0.24, -L + 0.05, L - 0.05); }
  if (idx === 4 || idx === 5 || idx === 7) {
    const tex = numberTex(car.decalCtx.number);
    for (const d of car.doors) {
      const s = d.userData.side, zm = (dz0 + dz1) / 2;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.position.set(s * (w(zm) * 1.02 + 0.005) - d.position.x, (t(zm) + 0.22) / 2 + 0.06 - d.position.y, zm - d.position.z);
      m.rotation.set(0, s * Math.PI / 2, 0);
      d.add(m); car.decals.push(m);
    }
  }
}

// Underglow: a soft neon pool of light under the car (one additive plane, no real light, so it's cheap)
export const UNDERGLOW = [{ name: "Off" }, { name: "Cyan", hex: 0x22d3ee }, { name: "Magenta", hex: 0xff2bd6 }, { name: "Lime", hex: 0x84ff3a }, { name: "Orange", hex: 0xff7a1a }, { name: "Violet", hex: 0x8b5cf6 }];
let glowTex = null;
export function setUnderglow(car, idx) {
  const u = UNDERGLOW[idx] || UNDERGLOW[0];
  if (!car.underglow) {
    if (!glowTex) {
      const c = document.createElement("canvas"); c.width = 64; c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 64, 4, 32, 64, 62);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
      glowTex = new THREE.CanvasTexture(c);
    }
    const L = car.decalCtx.L, m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, L * 2 + 1.2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 1; car.group.add(m); car.underglow = m;
  }
  car.underglow.visible = u.hex != null; if (u.hex != null) car.underglow.material.color.setHex(u.hex);
}

const plateCache = {};
function plateTex(id) {
  if (plateCache[id]) return plateCache[id];
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const txt = "APX " + String(100 + (h % 900)) + " " + String.fromCharCode(65 + (h >> 4) % 26, 65 + (h >> 9) % 26);
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "#f1c40f"; g.fillRect(0, 0, 256, 64); g.strokeStyle = "#222"; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = "#111"; g.font = "bold 40px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 128, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (plateCache[id] = t);
}
const numberTexCache = {};
function numberTex(n) {
  if (numberTexCache[n]) return numberTexCache[n];
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  g.fillStyle = "#f4f4f4"; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#111"; g.font = "bold 84px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (numberTexCache[n] = t);
}
