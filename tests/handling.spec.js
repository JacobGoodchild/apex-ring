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

test("no part of any road or run-off dips below the grass (banked bends used to)", () => {
  const pt = {}, low = [];
  for (const t of TRACKS) {
    const P = paths[t.id];
    for (let i = 0; i < P.N; i++) for (let f = -1; f <= 1; f += 0.25) {
      P.pointAt(i * P.ds, f * (P.width / 2 + P.runoff), pt);
      if (pt.y < -0.05) low.push(`${t.id}@${i}`);
    }
  }
  expect(low.length, low.slice(0, 5).join(" ")).toBe(0);
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

test("with no steering input the car goes straight, even with the assist on", () => {
  const path = paths.oval, v = new Vehicle(carSpec(CARS[0]), path);
  v.reset(-8, 0);
  const h0 = v.h;
  for (let k = 0; k < 60 * 6; k++) {
    v.ctl.steer = assistSteer(v, path, 0, 0.55);
    v.ctl.targetSpeed = cornerSpeed(v, path, 0.9, 1);
    v.step(1 / 60, true);
    if (v.wallHit) break;
    expect(Math.abs(Math.atan2(Math.sin(v.h - h0), Math.cos(v.h - h0))), `t=${k / 60}`).toBeLessThan(1e-6);
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

test("pro driving: no throttle means no go, throttle accelerates, brake stops, handbrake drifts", () => {
  const path = paths.gp, v = new Vehicle(carSpec(CARS[0]), path);
  v.reset(100, 0); v.ctl.pro = true; v.ctl.targetSpeed = Infinity;
  const run = (secs, ctl) => { Object.assign(v.ctl, ctl); for (let k = 0; k < secs * 60; k++) v.step(1 / 60, true); };
  run(2, { throttle: 0, brake: 0, steer: 0 });
  expect(v.vF).toBeLessThan(0.5);
  run(4, { throttle: 1 });
  expect(v.vF).toBeGreaterThan(30);
  const fast = v.vF;
  run(1, { throttle: 0, brake: 1 });
  expect(v.vF).toBeLessThan(fast - 20);
  run(3, { throttle: 1, brake: 0 });
  run(0.5, { steer: 1, handbrake: true });
  expect(v.drifting).toBe(true);
  run(0.5, { steer: 0, handbrake: false });
});

test("a ghost lap survives being shared as a code and pasted back", async () => {
  const { encodeGhost, decodeGhost } = await import("../src/ghostcode.js");
  const s = []; for (let i = 0; i < 400; i++) s.push(Math.round(Math.sin(i / 20) * 3000) / 10, 0.1 * (i % 7), Math.round(i * 37) / 10, Math.round(Math.cos(i / 9) * 314) / 100);
  const code = await encodeGhost({ t: 41.237, s }, "gp:r", "vanta", "Sam");
  expect(code.startsWith("APXG1")).toBe(true);
  expect(code.length).toBeLessThan(8000);
  const back = await decodeGhost(code);
  expect(back.track).toBe("gp:r"); expect(back.name).toBe("Sam"); expect(back.ghost.t).toBe(41.237);
  back.ghost.s.forEach((v, i) => expect(Math.abs(v - s[i])).toBeLessThan(0.051));
  await expect(decodeGhost("hello")).rejects.toThrow();
});

test("trophies pay out once", async () => {
  const { award, TROPHY_COINS, TROPHIES } = await import("../src/trophies.js");
  const save = { coins: 0 };
  expect(award(save, "win").name).toBe("First win");
  expect(award(save, "win")).toBeNull();
  expect(save.coins).toBe(TROPHY_COINS);
  expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
});

test("time-trial medal times still match the tracks", async () => {
  const { TIDY } = await import("../src/medals.js");
  const { tidyLap } = await import("../scripts/dev/medals.mjs");
  const { trackById } = await import("../src/tracks.js");
  for (const [id, t] of Object.entries(TIDY)) expect(Math.abs(tidyLap(trackById(id)) - t), id).toBeLessThan(t * 0.03);
});
