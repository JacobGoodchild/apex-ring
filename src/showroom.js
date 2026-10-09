// The lobby / garage showroom: a separate little scene with a turntable, studio lights and a glossy floor.
import * as THREE from "three";
import { canvasTex } from "./textures.js";

export class Showroom {
  constructor(world) {
    const s = (this.scene = new THREE.Scene());
    s.environment = world.envMap; s.environmentIntensity = 0.7;
    s.background = new THREE.Color(0x0a0f1a);
    s.fog = new THREE.Fog(0x0a0f1a, 18, 46);

    const floorTex = canvasTex(512, 512, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      r.addColorStop(0, "#2a3346"); r.addColorStop(0.5, "#151b28"); r.addColorStop(1, "#0a0f1a");
      g.fillStyle = r; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(242,166,90,.10)"; g.lineWidth = 2;
      for (let k = 1; k < 8; k++) { g.beginPath(); g.arc(w / 2, h / 2, k * 34, 0, Math.PI * 2); g.stroke(); }
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ map: floorTex, metalness: 0.5, roughness: 0.32 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);

    this.table = new THREE.Group(); s.add(this.table);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.4, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x1b2232, metalness: 0.7, roughness: 0.3 }));
    disc.position.y = 0.06; disc.receiveShadow = true; this.table.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.36, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: 0xf2a65a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; s.add(ring);
    this.carHolder = new THREE.Group(); this.carHolder.position.y = 0.12; this.table.add(this.carHolder);

    // light bars overhead and a curved backdrop
    const bar = new THREE.MeshBasicMaterial({ color: 0xb8c0d0 });
    for (let k = -2; k <= 2; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 7), bar); m.position.set(k * 1.6, 7.5, 0); s.add(m); }
    const back = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 14, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x111827, side: THREE.BackSide, roughness: 0.9 }));
    back.position.y = 7; s.add(back);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf2a65a });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6, 0.08), stripeMat); m.position.set(Math.cos(a) * 21.8, 4, Math.sin(a) * 21.8); s.add(m); }

    s.add(new THREE.HemisphereLight(0xbfd2ff, 0x202430, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 9, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); const c = key.shadow.camera; c.left = c.bottom = -5; c.right = c.top = 5; c.near = 1; c.far = 30; key.shadow.bias = -0.0005;
    s.add(key);
    const rim = new THREE.DirectionalLight(0xf2a65a, 0.9); rim.position.set(-6, 3, -6); s.add(rim);
    const fill = new THREE.DirectionalLight(0x4cc9f0, 0.6); fill.position.set(-6, 2, 6); s.add(fill);

    this.angle = 0.6; this.spin = 0.25; this.drag = null; this.zoom = 1;
  }

  setCar(model) {
    this.carHolder.clear();
    if (model) { model.group.position.set(0, 0, 0); model.group.rotation.set(0, 0, 0); model.body.rotation.set(0, 0, 0); this.carHolder.add(model.group); }
  }

  // drag horizontally to turn the car
  bindDrag(el) {
    el.addEventListener("pointerdown", (e) => { if (e.target !== el) return; this.drag = { x: e.clientX, a: this.table.rotation.y }; });
    addEventListener("pointermove", (e) => { if (this.drag) this.table.rotation.y = this.drag.a + (e.clientX - this.drag.x) * 0.01; });
    addEventListener("pointerup", () => { this.drag = null; });
  }

  update(dt, camera, focus = "car") {
    if (!this.drag) this.table.rotation.y += dt * this.spin;
    const portrait = camera.aspect < 1;
    const dist = (portrait ? 11.5 : 8.2) * this.zoom;
    const a = this.angle;
    camera.position.set(Math.sin(a) * dist, portrait ? 3.4 : 2.4, Math.cos(a) * dist);
    camera.fov = portrait ? 52 : 40;
    camera.updateProjectionMatrix();
    // frame the car above the menu card in portrait, and to the right of it in landscape
    const look = new THREE.Vector3(0, portrait ? -1.3 : 0.55, 0);
    if (!portrait) { const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)); look.addScaledVector(right, -2.4); }
    camera.lookAt(look);
  }
}
