// Screenshots at chosen points round a track: node scripts/dev/viewshots.mjs <track> <tag> 0.2,0.5,...  (needs serve.mjs 4174)
import { chromium } from "@playwright/test";
const [track = "gp", tag = "v", fr = "0.25,0.6"] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 915, height: 412 } });
await p.goto(`http://localhost:4174/?test=1&quality=${process.env.Q || "high"}&autopilot=1&track=${track}&rivals=${process.env.RIVALS || 3}`);
await p.waitForFunction(() => window.__apex && window.__apex.ready);
await p.click("#raceBtn"); await p.click("#startBtn");
await p.waitForFunction(() => window.__apex.mode === "race" && window.__apex.player.vF > 20);
for (const f of fr.split(",").map(Number)) {
  await p.evaluate((f) => window.__apex.warp(window.__apex.trackLength * f), f);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `screenshots/dev-${tag}-${track}-${f}.png` });
}
await b.close();
