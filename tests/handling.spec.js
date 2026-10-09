import { test, expect } from "@playwright/test";
import { TRACKS } from "../src/tracks.js";
import { TrackPath } from "../src/track.js";
import { EVENTS } from "../src/career.js";
import { CARS, carSpec } from "../src/cars.js";
import { Vehicle } from "../src/vehicle.js";
import { assistSteer, cornerSpeed } from "../src/assist.js";

// Pure logic tests (no browser): track layout rules, walls and the steering assist.
const paths = Object.fromEntries(TRACKS.map((t) => [t.id, new TrackPath(t)]));

test("tracks are wide, rated, and Easy tracks have no tight corners", () => {
  for (const t of TRACKS) {
    expect(t.width).toBeGreaterThanOrEqual(20);
    expect([1, 2, 3]).toContain(t.difficulty);
    const minR = 1 / Math.max(...[...paths[t.id].cs].map(Math.abs));
    if (t.difficulty === 1) expect(minR).toBeGreaterThan(90);
    if (t.difficulty === 2) expect(minR).toBeGreaterThan(45);
  }
});

test("career starts on Easy tracks and gets harder", () => {
  const diff = EVENTS.map((e) => TRACKS.find((t) => t.id === e.track).difficulty);
  expect(diff.slice(0, 5).every((d) => d === 1)).toBe(true);
  for (let i = 1; i < diff.length - 1; i++) expect(diff[i]).toBeGreaterThanOrEqual(diff[i - 1]);
});

test("hitting a wall glances off and keeps most of the speed", () => {
  const path = paths.gp, v = new Vehicle(carSpec(CARS[0]), path);
  v.reset(200, 0);
  // aim 20 degrees toward the right-hand wall at 60 m/s
  v.h -= 0.35; v.vx = Math.sin(v.h) * 60; v.vz = Math.cos(v.h) * 60;
  let hit = 0, before = 0;
  for (let k = 0; k < 120 && !hit; k++) { before = v.speed; v.ctl.steer = 0; v.step(1 / 60, true); if (v.wallHit) hit = v.speed; }
  expect(hit).toBeGreaterThan(0);
  expect(hit / before).toBeGreaterThan(0.8);
});

test("steering assist alone gets round every Easy track without touching a wall", () => {
  for (const t of TRACKS.filter((t) => t.difficulty === 1)) {
    const path = paths[t.id], v = new Vehicle(carSpec(CARS[0]), path);
    v.reset(-8, 0);
    let walls = 0;
    for (let k = 0; k < 60 * 120 && v.totalD < path.length; k++) {
      v.ctl.steer = assistSteer(v, path, 0, 0.55);
      v.ctl.targetSpeed = cornerSpeed(v, path);
      v.step(1 / 60, true);
      if (v.wallHit > 1) walls++;
    }
    expect(v.totalD, t.id).toBeGreaterThanOrEqual(path.length);
    expect(walls, t.id).toBe(0);
  }
});

// Tilt: build the sensor reading a phone would give when held at screen orientation `a`, tipped back `back` degrees,
// and turned like a steering wheel by `phi` degrees clockwise. The game should read back phi.
import { tiltRoll, tiltSteer } from "../src/tilt.js";
function sensorFor(a, back, phi) {
  const D = Math.PI / 180, c = Math.cos(back * D);
  const sx = -Math.sin(phi * D) * c, sy = Math.cos(phi * D) * c, uz = Math.sin(back * D);
  const ux = sx * Math.cos(-a * D) - sy * Math.sin(-a * D), uy = sx * Math.sin(-a * D) + sy * Math.cos(-a * D);
  return { beta: Math.asin(uy) / D, gamma: Math.atan2(-ux, uz) / D };
}
test("tilt reads the steering-wheel angle in portrait and both landscape directions", () => {
  for (const a of [0, 90, 270, -90]) for (const back of [10, 35]) for (const phi of [-20, 0, 15]) {
    const s = sensorFor(a, back, phi);
    expect(tiltRoll(s.beta, s.gamma, a), `a=${a} back=${back} phi=${phi}`).toBeCloseTo(phi, 0);
  }
  const cfg = { zero: 5, sens: 1, dead: 3 };
  expect(tiltSteer(6, cfg)).toBe(0); // inside the dead zone
  expect(tiltSteer(25, cfg)).toBeGreaterThan(0.5); // tilt right = steer right
  expect(tiltSteer(-25, cfg)).toBeLessThan(-0.5);
  expect(tiltSteer(80, cfg)).toBe(1);
});
