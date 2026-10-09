// Headless race of rule-based rivals, to tune the AI. Usage: node scripts/dev/race.mjs [trackId]
import { TrackPath } from "../../src/track.js";
import { TRACKS } from "../../src/tracks.js";
import { CARS, carSpec } from "../../src/cars.js";
import { Vehicle } from "../../src/vehicle.js";
import { Driver, RIVALS, collide } from "../../src/ai.js";
const path = new TrackPath(TRACKS.find((t) => t.id === (process.argv[2] || "gp")));
const ds = [];
for (let k = 0; k < 8; k++) {
  const v = new Vehicle(carSpec(CARS[k % CARS.length]), path); const row = Math.floor(k / 2), col = k % 2;
  v.reset(-7 - row * 9 - col * 4.5, col ? -3.3 : 3.3);
  ds.push(new Driver(v, RIVALS[k % 7], 0.95 + (k % 3) * 0.02, 99 + k));
}
const cars = ds.map((d) => d.v); let hits = 0, walls = 0, fin = [];
for (let s = 0; s < 60 * 240; s++) {
  for (const d of ds) { d.think(1 / 60, cars, 0); d.v.step(1 / 60, true); if (d.v.wallHit > 3) walls++; }
  collide(cars, (a, b, k) => { if (k > 3) hits++; });
  for (const d of ds) if (!d.fin && d.v.totalD >= 3 * path.length) { d.fin = (s / 60).toFixed(1); fin.push(d.name + " " + d.style + " " + d.fin); }
  if (fin.length === 8) break;
}
console.log(fin.join("\n")); console.log("hard hits", hits, "wall frames", walls, "respawns?");
