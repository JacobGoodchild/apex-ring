// Modelled cars: a car listed in CAR_MODELS uses a downloaded glTF/GLB body (CC0 / CC-BY, credited in CREDITS.md)
// instead of the procedural one. The file is loaded once at boot; until it arrives (or if it fails) the car stays
// procedural, so nothing ever waits on the network. To add one:
//   1. put the file in assets/cars/ (keep it small: ideally under ~40k triangles and a few MB)
//   2. add an entry below: { file, credit, rotY (radians, so the nose points +z), paint (material name regex), len }
//   3. check it from every side: dev/carview8.html?car=<id>  (and &close=1)
// The wheels are found by name (wheel / tyre / tire / rim on the mesh, a parent node or its material) and grouped by
// position into four, so they spin and the front two steer.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const CAR_MODELS = {};

const cache = new Map(), WHEEL = /wheel|tyre|tire|(?<!t)rim/i; // (not "trim")
export function registerCarModel(id, spec) { CAR_MODELS[id] = spec; }
export function hasCarModel(id) { return cache.has(id); }

// loads every listed model; onReady runs once they've all arrived (or failed)
export function preloadCarModels(onReady) {
  const ids = Object.keys(CAR_MODELS);
  if (!ids.length) return;
  const loader = new GLTFLoader();
  Promise.all(ids.map((id) => loader.loadAsync(CAR_MODELS[id].file).then((g) => cache.set(id, g.scene)).catch((e) => console.warn("car model", id, e.message))))
    .then(() => onReady && onReady());
}

const nameChain = (o) => { let s = ""; for (let p = o; p; p = p.parent) s += " " + (p.name || ""); return s; };
const isWheel = (m) => WHEEL.test(nameChain(m)) || [].concat(m.material || []).some((x) => WHEEL.test(x.name || ""));

// a car model in the same shape makeCar() returns, built from the cached glTF scene (or null if it isn't loaded)
export function glbCar(def, paintHex) {
  const src = cache.get(def.id), spec = CAR_MODELS[def.id];
  if (!src || !spec) return null;
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const root = src.clone(true); root.rotation.y = spec.rotY || 0; body.add(root);
  // fit: nose along +z, the requested length, wheels on the ground, centred
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  if (size.x > size.z * 1.2) { root.rotation.y += Math.PI / 2; root.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(root); size = box.getSize(new THREE.Vector3()); } // lying sideways: turn it lengthways
  const len = spec.len || (def.shape && def.shape.len) || 4.7, k = len / Math.max(size.z, 1e-6);
  root.scale.setScalar(k); root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root); const c = box.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -box.min.y, -c.z); root.updateMatrixWorld(true);
  // materials: each car gets its own paint (a physical material so the finishes work) and light materials
  const paintRe = spec.paint ? new RegExp(spec.paint, "i") : /paint|body|carcolor|car_color/i;
  const paint = new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.5, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  let tailMat = null, headMat = null, rimMat = null;
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    m.castShadow = true; m.receiveShadow = false;
    m.material = [].concat(m.material).map((mat) => {
      const n = mat.name || "";
      if (paintRe.test(n)) { if (mat.map) paint.map = mat.map; if (mat.normalMap) paint.normalMap = mat.normalMap; return paint; }
      if (/rear.?light|tail|brake/i.test(n)) return (tailMat = tailMat || Object.assign(mat.clone(), { emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 1.1 }));
      if (/head.?light|led/i.test(n)) return (headMat = headMat || Object.assign(mat.clone(), { emissive: new THREE.Color(0xdfeeff), emissiveIntensity: 1.2 }));
      if (/alloy|rim/i.test(n)) return (rimMat = rimMat || mat.clone());
      return mat;
    });
    if (m.material.length === 1) m.material = m.material[0];
  }
  // wheels: group the wheel meshes by position into (up to) four, each in a pivot (steers) holding a spin group
  const groups = [];
  for (const m of meshes.filter(isWheel)) {
    const p = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
    let g = groups.find((q) => q.c.distanceTo(p) < len * 0.12);
    if (!g) groups.push((g = { c: p.clone(), ms: [] }));
    g.ms.push(m);
  }
  const wheels = [], steerers = [];
  for (const g of groups.slice(0, 4)) {
    const bb = new THREE.Box3(); g.ms.forEach((m) => bb.expandByObject(m)); const ctr = bb.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.position.copy(ctr); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin); spin.updateMatrixWorld(true);
    g.ms.forEach((m) => spin.attach(m));
    wheels.push(spin); if (ctr.z > 0) steerers.push(pivot);
  }
  const L = len / 2;
  return {
    glb: true, blurs: [], blurMat: null, group: car, body, doors: [], doorType: "none", wheels, steerers, paint,
    rimMat: rimMat || new THREE.MeshStandardMaterial(), tailMat: tailMat || new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a1a, emissiveIntensity: 1.1 }), tailMesh: null,
    headMat: headMat || new THREE.MeshStandardMaterial({ emissive: 0xdfeeff }), decalCtx: { L, number: 1 },
    exhaust: [new THREE.Vector3(-0.32, 0.38, -L - 0.02), new THREE.Vector3(0.32, 0.38, -L - 0.02)],
  };
}
