// Mech wings for the chasm on Zeus's Fury. Each side is a little machine: an armoured pod slides out of the flank,
// a two-part spar swings out and unfolds like an arm, then five armour feathers fan out one after another, each with a
// glowing trailing edge. Thrusters at the roots glow when boosting in flight.
// addWings(model, paintHex, detail) builds it hidden; setWings(model, w, t, flying, steer, boost) animates it, w = 0..1.
import * as THREE from "three";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// a mechanical "settle": overshoots a little and springs back
const settle = (x) => { x = clamp01(x); return 1 - Math.pow(1 - x, 3) * Math.cos(x * 4.2); };
const lerp = (a, b, t) => a + (b - a) * t;

let shared = null;
function parts(paintHex) {
  if (!shared) {
    // a tapered armour feather, lying flat: span along +x, chord toward -z (trailing edge at the back)
    const blade = (len, chord) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.06); sh.lineTo(len * 0.92, 0.0); sh.lineTo(len, -chord * 0.25); sh.lineTo(len * 0.8, -chord * 0.62); sh.lineTo(0.05, -chord);
      sh.lineTo(-0.05, -chord * 0.5); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 1, curveSegments: 1 });
      g.rotateX(Math.PI / 2); // shape XY -> lying in XZ, thickness up
      return g;
    };
    const edge = (len, chord) => {
      // the glowing trailing-edge strip of a feather
      const g = new THREE.BoxGeometry(len * 0.86, 0.045, 0.07);
      g.translate(len * 0.45, 0.02, -chord * 0.72);
      g.rotateY(-0.13);
      return g;
    };
    shared = {
      feathers: [[2.5, 0.62], [2.3, 0.56], [2.1, 0.5], [1.8, 0.44], [1.5, 0.38]].map(([l, c]) => ({ blade: blade(l, c), edge: edge(l, c) })),
      armA: new THREE.BoxGeometry(1.45, 0.12, 0.2).translate(0.72, 0, 0),
      armB: new THREE.BoxGeometry(1.6, 0.1, 0.16).translate(0.8, 0, 0),
      joint: new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10),
      pod: new THREE.BoxGeometry(0.34, 0.26, 1.1).translate(0.1, 0, -0.1),
      nozzle: new THREE.CylinderGeometry(0.11, 0.15, 0.3, 10, 1, true).rotateX(Math.PI / 2),
      metal: new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.85, roughness: 0.32 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x6ff6ff }),
      fire: new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
  }
  const plate = new THREE.MeshStandardMaterial({ color: paintHex, metalness: 0.6, roughness: 0.28 });
  // each car's glowing edges and thruster fire are its own, so a wing skin can recolour them
  return { ...shared, plate, glow: shared.glow.clone(), fire: shared.fire.clone() };
}

export function addWings(model, paintHex = 0x0f8b8d, detail = 1) {
  const P = parts(paintHex), rig = new THREE.Group(); rig.visible = false;
  const sides = [];
  for (const sg of [1, -1]) {
    const pod = new THREE.Group(); pod.position.set(sg * 0.78, 0.74, -0.45); rig.add(pod);
    const podMesh = new THREE.Mesh(P.pod, P.metal); podMesh.scale.x = sg; pod.add(podMesh);
    const noz = new THREE.Mesh(P.nozzle, P.metal); noz.position.set(sg * 0.12, -0.02, -0.72); pod.add(noz);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.2, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.75), P.fire); noz.add(fire);
    const armA = new THREE.Group(); armA.position.set(sg * 0.2, 0.05, 0.2); pod.add(armA);
    const a = new THREE.Mesh(P.armA, P.metal); a.scale.x = sg; armA.add(a);
    const j = new THREE.Mesh(P.joint, P.glow); j.position.x = sg * 1.45; armA.add(j);
    const armB = new THREE.Group(); armB.position.x = sg * 1.45; armA.add(armB);
    const b = new THREE.Mesh(P.armB, P.metal); b.scale.x = sg; armB.add(b);
    const feathers = [];
    const nF = detail ? 5 : 3;
    for (let k = 0; k < nF; k++) {
      const F = P.feathers[detail ? k : k * 2], fg = new THREE.Group();
      // first two feathers ride on the inner arm, the rest on the outer arm
      const onB = k >= 2, host = onB ? armB : armA;
      fg.position.set(sg * (onB ? 0.15 + (k - 2) * 0.55 : 0.3 + k * 0.62), 0.06 - k * 0.018, 0.02);
      host.add(fg);
      const m = new THREE.Mesh(F.blade, P.plate); m.scale.x = sg; fg.add(m);
      if (detail) { const e = new THREE.Mesh(F.edge, P.glow); e.scale.x = sg; fg.add(e); }
      feathers.push(fg);
    }
    sides.push({ sg, pod, armA, armB, feathers, fire, j });
  }
  (model.body || model.group).add(rig);
  model.wings = { rig, sides, plate: P.plate, glow: P.glow, fire: P.fire, paint: paintHex };
  setWings(model, 0, 0);
}

// Wing skins (unlocked by badges): plate colour and finish, glowing edge colour, thruster fire colour.
export const WING_SKINS = [
  { id: "paint", name: "Body colour", badge: null },
  { id: "gold", name: "Gold", badge: "rings", plate: 0xd4a017, metal: 1, rough: 0.18, glow: 0xffe08a, fire: 0xffc060 },
  { id: "neon", name: "Neon", badge: "weekly10", plate: 0x111827, metal: 0.4, rough: 0.3, glow: 0xff3fd2, fire: 0xff7af0 },
  { id: "dragon", name: "Dragon", badge: "wings", plate: 0x7a1010, metal: 0.5, rough: 0.35, glow: 0xff6a1a, fire: 0xff8a2a },
  { id: "carbon", name: "Carbon", badge: "sky", plate: 0x1c1f24, metal: 0.3, rough: 0.55, glow: 0x6ff6ff, fire: 0x8fd8ff },
];
export function setWingSkin(model, id) {
  const W = model.wings; if (!W) return;
  const k = WING_SKINS.find((x) => x.id === id) || WING_SKINS[0];
  W.plate.color.setHex(k.plate ?? W.paint); W.plate.metalness = k.metal ?? 0.6; W.plate.roughness = k.rough ?? 0.28;
  W.glow.color.setHex(k.glow ?? 0x6ff6ff); W.fire.color.setHex(k.fire ?? 0x8fd8ff);
}

// w: deploy amount 0..1; t: time (s) for idle motion; steer -1..1 banks the feathers; boost lights the thrusters
export function setWings(model, w, t = 0, flying = false, steer = 0, boost = false) {
  const W = model.wings; if (!W) return;
  W.rig.visible = w > 0.004;
  if (!W.rig.visible) return;
  const s1 = smooth(w / 0.22), s2 = settle((w - 0.15) / 0.45), s3 = clamp01((w - 0.5) / 0.5);
  for (const S of W.sides) {
    const sg = S.sg;
    // 1: the pod slides out of the flank and up
    S.pod.position.x = sg * lerp(0.62, 0.98, s1); S.pod.position.y = lerp(0.6, 0.86, s1);
    S.pod.rotation.z = sg * lerp(0, 0.16, s2); // dihedral once out
    // 2: the inner arm swings from lying back along the body to straight out, the outer arm unfolds off it
    S.armA.rotation.y = sg * lerp(1.45, 0.12, s2);
    S.armB.rotation.y = sg * lerp(2.9, -0.06, settle((w - 0.32) / 0.42));
    const flap = flying ? Math.sin(t * 2.3 + sg) * 0.04 : 0;
    S.armA.rotation.x = flap - (flying ? steer * sg * 0.18 : 0);
    // 3: feathers fan out one by one from folded along the arm into a swept wing
    S.feathers.forEach((f, k) => {
      const e = settle(s3 * 1.6 - k * 0.14);
      f.rotation.y = sg * lerp(1.35, 0.28 + k * 0.17, e); // fanned: each feather sweeps further back than the last
      f.rotation.z = sg * lerp(0, -0.04 * k, e);
      f.scale.setScalar(lerp(0.55, 1, e));
    });
    S.j.scale.setScalar(0.6 + 0.4 * Math.abs(Math.sin(t * 6)) * s2 + 0.4 * s3);
    S.fire.material.opacity = flying ? (boost ? 0.9 : 0.35 + 0.15 * Math.sin(t * 30)) * s3 : 0;
    S.fire.scale.z = boost ? 1.6 + Math.sin(t * 40) * 0.2 : 0.9;
  }
}
