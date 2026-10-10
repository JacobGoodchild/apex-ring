// Prints the "tidy autopilot" flying-lap time per track (base Vanta S1, line steer + auto-brake, no boost).
// src/medals.js holds these numbers; rerun after changing a track's shape.
import { TRACKS, trackById, canReverse } from "../../src/tracks.js";
import { TrackPath } from "../../src/track.js";
import { CARS, carSpec } from "../../src/cars.js";
import { Vehicle } from "../../src/vehicle.js";
import { lineSteer, cornerSpeed } from "../../src/assist.js";

export function tidyLap(def) {
  const path = new TrackPath(def), v = new Vehicle(carSpec(CARS[0]), path);
  v.reset(0, 0);
  const dt = 1 / 60, L = path.length;
  let t = 0, lapStart = null;
  for (let step = 0; step < 60 * 600; step++) {
    v.ctl.steer = lineSteer(v, path); v.ctl.targetSpeed = cornerSpeed(v, path, 1.06, 1); v.ctl.boost = false; v.ctl.drift = false;
    v.step(dt, true); t += dt;
    if (lapStart == null && v.totalD >= L) lapStart = t;
    else if (lapStart != null && v.totalD >= 2 * L) return t - lapStart;
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = {};
  for (const d of TRACKS) {
    out[d.id] = +tidyLap(d).toFixed(1);
    if (canReverse(d)) out[d.id + ":r"] = +tidyLap(trackById(d.id + ":r")).toFixed(1);
  }
  console.log(JSON.stringify(out));
}
