// Counts island contacts (ticks a car is pushed off a split-path island) for the tidy autopilot and a field of rivals.
import { TRACKS, trackById, canReverse } from "../../src/tracks.js";
import { Vehicle } from "../../src/vehicle.js";
import { tidyLap } from "./medals.mjs";
import { race } from "../../tests/sim.js";
let hits = 0;
const orig = Vehicle.prototype.hitWall;
Vehicle.prototype.hitWall = function (q, push) { if (Math.abs(q.lat) < 8) hits++; return orig.call(this, q, push); };
for (const d of TRACKS.filter((t) => (t.hazards || []).some((h) => h.type === "split"))) for (const lay of ["", ":r", ":m"]) {
  if (lay === ":r" && !canReverse(d)) continue;
  const id = d.id + lay;
  hits = 0; const lap = tidyLap(trackById(id)); const a = hits;
  hits = 0; for (const lv of ["normal", "hard"]) race(d.id, lv, { seed: 3 }); const b = hits;
  console.log(id.padEnd(10), "tidy lap", lap.toFixed(1), "autopilot hits", a, "| race hits (normal+hard, base layout)", lay ? "-" : b);
}
