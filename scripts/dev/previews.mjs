// Renders the track photos used on the race-select screen: node scripts/dev/previews.mjs [ids] (needs serve.mjs 4174).
// Each shot freezes a race at a scenic spot and frames the car with the photo-mode camera, HUD hidden.
import { chromium } from "@playwright/test";
// fraction of the lap, camera angle relative to the car (0 = in front, PI = behind), elevation, distance
const SHOTS = {
  oval: [0.3, 0.75, 0.1, 7], gp: [0.42, 0.7, 0.1, 7], forest: [0.3, 0.75, 0.1, 7], canyon: [0.62, 0.7, 0.1, 7],
  harbour: [0.2, 2.75, 0.1, 8], neon: [0.15, 2.7, 0.1, 8], alpine: [0.62, 0.75, 0.11, 7.5], xtreme: [0.12, 0.7, 0.1, 7.5],
  coastal: [0.22, 0.65, 0.09, 7], frost: [0.4, 0.75, 0.1, 7], zeus: [0.3, 0.7, 0.12, 8],
};
const ids = (process.argv[2] || Object.keys(SHOTS).join(",")).split(",");
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const id of ids) {
  const [f, a, e, d] = SHOTS[id] || [0.2, 2.6, 0.18, 11];
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  await p.goto(`http://localhost:4174/?test=1&quality=high&autopilot=1&track=${id}&rivals=4`);
  await p.waitForFunction(() => window.__apex && window.__apex.ready);
  await p.click("#raceBtn"); await p.click("#startBtn");
  await p.waitForFunction(() => window.__apex.mode === "race" && window.__apex.player.vF > 20, null, { timeout: 60000 });
  await p.evaluate((f) => window.__apex.warp(window.__apex.trackLength * f), f);
  await p.waitForTimeout(1200);
  await p.evaluate(([a, e, d]) => window.__apex.photo(a, e, d), [a, e, d]);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `assets/previews/${id}.jpg`, type: "jpeg", quality: 74 });
  await p.close();
  console.log(id);
}
await b.close();
