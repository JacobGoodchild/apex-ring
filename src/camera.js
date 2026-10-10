// Chase and bonnet cameras. The chase cam trails the car's heading with a little lag, swings slightly toward
// the direction of travel in a drift, and pulls back / widens in portrait so the road ahead stays visible.
import * as THREE from "three";

const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const pos = new THREE.Vector3(), look = new THREE.Vector3();

export class ChaseCam {
  constructor(camera) { this.cam = camera; this.yaw = 0; this.mode = "chase"; this.kick = 0; this.y = 0; this.shake = 0; this.ready = false; }

  snap(v) { this.yaw = v.h; this.y = v.y; this.ready = false; }

  update(v, dt, boostAmt = 0) {
    const cam = this.cam, portrait = cam.aspect < 1;
    // aim between the nose and the direction of travel so drifts read clearly
    const velYaw = v.speed > 3 ? Math.atan2(v.vx, v.vz) : v.h;
    const aim = v.h + wrapA(velYaw - v.h) * 0.45;
    this.yaw += wrapA(aim - this.yaw) * Math.min(1, dt * 5.5);
    this.y += (v.y - this.y) * Math.min(1, dt * 6);
    this.kick += (boostAmt - this.kick) * Math.min(1, dt * 4);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const speedF = Math.min(1, Math.max(0, v.vF) / 80);

    let fov;
    if (this.mode === "bonnet") {
      const hx = Math.sin(v.h), hz = Math.cos(v.h);
      pos.set(v.x + hx * 0.4, v.y + 1.12, v.z + hz * 0.4);
      look.set(v.x + hx * 20, v.y + 0.9, v.z + hz * 20);
      cam.position.copy(pos);
      fov = (portrait ? 78 : 62) + speedF * 8 + this.kick * 10;
    } else {
      const low = this.mode === "low"; // low chase: closer and nearer the road, like a racing-game TV cam
      const back = (low ? (portrait ? 6.2 : 5.0) : portrait ? 7.4 : 5.9) + speedF * 0.9 - this.kick * 0.6;
      const up = (low ? (portrait ? 1.85 : 1.35) : portrait ? 2.75 : 2.1) + speedF * 0.15;
      pos.set(v.x - fx * back, this.y + up, v.z - fz * back);
      if (!this.ready) { cam.position.copy(pos); this.ready = true; }
      cam.position.lerp(pos, 1 - Math.exp(-dt * 12));
      look.set(v.x + fx * 5, this.y + (low ? (portrait ? 0.9 : 0.8) : portrait ? 0.7 : 0.95), v.z + fz * 5);
      fov = (portrait ? 72 : 58) + speedF * 10 + this.kick * 12;
    }
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.25;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.25;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
    cam.lookAt(look);
    // a touch of roll into the corner
    cam.rotateZ(Math.max(-0.05, Math.min(0.05, v.latAcc * 0.0012)) * (this.mode === "bonnet" ? 1.5 : 1));
  }
}
