// Procedural car meshes. Returns a group with handles for doors, wheels and lights so the game can animate them.
import * as THREE from "three";

function extrudeSide(points, width, bevel) {
  const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 3, curveSegments: 8 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2, 0, 0); g.computeVertexNormals(); return g;
}

export function makeCar(def, paintHex) {
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: paintHex, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.3, roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1726, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.88 });
  const prof = [[2.38, 0.24], [2.42, 0.42], [2.2, 0.56], [1.4, 0.74], [0.85, 0.86], [0.0, 0.92], [-1.0, 0.95], [-1.9, 0.98], [-2.3, 0.92], [-2.42, 0.62], [-2.35, 0.26], [-1.8, 0.2], [1.8, 0.2]];
  const shell = new THREE.Mesh(extrudeSide(prof, 1.8, 0.12), paint); shell.castShadow = true; body.add(shell);
  const can = [[1.05, 0.86], [0.25, 1.17], [-0.55, 1.2], [-1.5, 1.06], [-1.95, 0.97], [0.6, 0.9]];
  body.add(new THREE.Mesh(extrudeSide(can, 1.5, 0.1), glass));
  body.add(new THREE.Mesh(extrudeSide([[0.3, 1.2], [-0.55, 1.25], [-1.5, 1.1], [-1.5, 1.06], [-0.55, 1.2], [0.25, 1.17]], 0.5, 0.04), paint));
  const split = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.06, 0.5), carbon); split.position.set(0, 0.2, 2.25); body.add(split);
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.4), carbon); diff.position.set(0, 0.32, -2.3); diff.rotation.x = 0.4; body.add(diff);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.5), carbon); wing.position.set(0, 1.32, -2.05); wing.rotation.x = -0.12; body.add(wing);
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.6), carbon); ep.position.set(s * 1.05, 1.28, -2.05); body.add(ep);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.12), carbon); st.position.set(s * 0.45, 1.1, -2.0); body.add(st);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.5 });
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.12), headMat); h.position.set(s * 0.62, 0.56, 2.22); h.rotation.set(-0.25, s * 0.25, 0); body.add(h); }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.2 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.06), tailMat); tail.position.set(0, 0.86, -2.42); body.add(tail);
  const doors = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(s * 1.02, 0.78, 0.95); body.add(hinge);
    const panel = new THREE.Mesh(extrudeSide([[0.95, 0.86], [0.25, 1.12], [-0.55, 1.15], [-0.75, 0.9], [-0.7, 0.42], [0.55, 0.4], [0.9, 0.6]], 0.06, 0), paint);
    panel.position.set(0, -0.78, -0.95); hinge.add(panel);
    const win = new THREE.Mesh(extrudeSide([[0.78, 0.88], [0.22, 1.07], [-0.5, 1.1], [-0.62, 0.9]], 0.08, 0), glass); win.position.set(0, -0.78, -0.95); hinge.add(win);
    doors.push(hinge);
  }
  const tyre = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8a919c, metalness: 0.9, roughness: 0.25 });
  const caliper = new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.4 });
  const wheels = [], steerers = [];
  [[1, 1.45], [-1, 1.45], [1, -1.45], [-1, -1.45]].forEach(([s, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.98, 0.36, z); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 24), tyre); t.rotation.z = Math.PI / 2; t.castShadow = true; spin.add(t);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.36, 10), rimMat); rim.rotation.z = Math.PI / 2; spin.add(rim);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.05, 0.42), rimMat); sp.rotation.x = k * Math.PI / 5; spin.add(sp); }
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.22), caliper); cal.position.set(s * -0.08, 0.13, 0.1); pivot.add(cal);
    wheels.push(spin); if (i < 2) steerers.push(pivot);
  });
  return { group: car, body, doors, doorType: def.doors, wheels, steerers, paint, tailMat, exhaust: [new THREE.Vector3(-0.35, 0.4, -2.45), new THREE.Vector3(0.35, 0.4, -2.45)] };
}

export function setDoors(car, open) {
  for (const d of car.doors) d.rotation.x = open * 1.2;
}
