// Headless race simulator for tests: the same physics, AI, assists and race setup the game uses, with a
// "beginner bot" standing in for the player.
import { TRACKS } from "../src/tracks.js";
import { TrackPath } from "../src/track.js";
import { CARS, carSpec } from "../src/cars.js";
import { Vehicle } from "../src/vehicle.js";
import { Driver, RIVALS, collide } from "../src/ai.js";
import { assistSteer, cornerSpeed, lineSteer, smoothSteer } from "../src/assist.js";
import { levelOf, slot, rivalSpec, AUTO_BRAKE, AUTO_ASSIST } from "../src/race.js";
import { makeRng } from "../src/rng.js";

// A beginner: holds left or right (like touching a half of the screen), reacts ~0.3 s late, only steers once the
// car is clearly off line, looks away now and then, and never boosts.
export class BeginnerBot {
  constructor(seed) { this.rnd = makeRng(seed); this.queue = []; this.away = 0; this.hold = 0; }
  input(v, t, dt) {
    const want = lineSteer(v, t, 0.3);
    let press = Math.abs(want) > 0.25 ? Math.sign(want) : 0;
    if (this.away > 0) { this.away -= dt; press = 0; } else if (this.rnd() < dt / 12) this.away = 0.4 + this.rnd() * 0.5;
    this.queue.push(press);
    return this.queue.length > 12 ? this.queue.shift() : 0; // 12 frames = 0.2 s reaction time
  }
}

export function race(trackId, levelName, { seed = 7, aids = AUTO_ASSIST[levelName] || 0, laps = 2 } = {}) {
  const def = TRACKS.find((t) => t.id === trackId), path = new TrackPath(def), level = levelOf(levelName);
  const rnd = makeRng(seed);
  const player = new Vehicle(carSpec(CARS[0]), path);
  const ps = slot(5); player.reset(ps[0], ps[1]);
  const rivals = [];
  for (let k = 0, s = 0; k < 7; k++, s++) {
    if (s === 5) s++;
    const cdef = CARS[(k + 1) % 7], veh = new Vehicle(rivalSpec(carSpec(cdef), player.spec), path);
    const [d, lat] = slot(s); veh.reset(d, lat);
    const drv = new Driver(veh, RIVALS[k], 0.95 + rnd() * 0.05, seed * 31 + k, level);
    rivals.push({ veh, drv, name: RIVALS[k].name });
  }
  const bot = new BeginnerBot(seed + 99), L = path.length * laps, cars = [player, ...rivals.map((r) => r.veh)];
  let t = 0, finish = null; const done = new Map(); const stats = { walls: 0, off: 0, latAbs: 0 };
  for (let step = 0; step < 60 * 400 && finish == null; step++) {
    const dt = 1 / 60; t += dt;
    const input = smoothSteer(bot, bot.input(player, path, dt), player.vF, player.spec.vmax, dt);
    player.ctl.steer = assistSteer(player, path, input, aids);
    player.ctl.targetSpeed = cornerSpeed(player, path, AUTO_BRAKE[levelName] || 1, aids ? 1 : 0);
    player.ctl.boost = false; player.ctl.drift = false;
    player.step(dt, true);
    if (player.wallHit > 1) stats.walls++;
    if (player.offTrack) stats.off += dt;
    stats.latAbs += Math.abs(player.lat) * dt;
    for (const r of rivals) {
      r.drv.think(dt, cars, r.veh.totalD - player.totalD);
      r.veh.step(dt, true);
      if (!done.has(r) && r.veh.totalD >= L) done.set(r, t);
    }
    collide(cars);
    if (player.totalD >= L) finish = t;
  }
  const place = 1 + rivals.filter((r) => done.has(r) && done.get(r) < finish).length;
  return { place, time: finish, walls: stats.walls, off: +stats.off.toFixed(1), latAvg: +(stats.latAbs / finish).toFixed(1), rivalBest: Math.min(...done.values()) };
}
