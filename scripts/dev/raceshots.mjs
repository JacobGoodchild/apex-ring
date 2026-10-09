// In-race screenshots on High quality for a few tracks: node scripts/dev/raceshots.mjs <tag>. Needs: node scripts/serve.mjs 4174
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "shot", out = "screenshots/dev-";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 915, height: 412 } });
for (const t of ["xtreme", "canyon", "forest", "harbour"]) {
  await p.goto(`http://localhost:4174/?test=1&quality=high&autopilot=1&track=${t}&laps=3`);
  await p.waitForFunction(() => window.__apex && window.__apex.ready, null, { timeout: 30000 });
  await p.click("#raceBtn"); await p.click("#startBtn");
  await p.waitForFunction(() => window.__apex.mode === "race" && window.__apex.player.vF > 30, null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}${tag}-${t}.png` });
}
await b.close();
