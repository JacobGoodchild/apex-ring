import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 412, height: 915 } });
p.on("pageerror", e => console.log("err", e.message));
for (const t of ["gp", "harbour", "neon", "forest"]) {
  for (const q of ["medium", "high"]) {
  await p.goto(`http://localhost:4174/index.html?test=1&track=${t}&quality=${q}&speed=2`);
  await p.waitForFunction(() => window.__apex && window.__apex.ready);
  await p.click("#raceBtn"); await p.click("#startBtn");
  await p.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  console.log(t, q, await p.evaluate(() => [window.__apex.drawCalls, window.__apex.triangles]));
  }
}
await b.close();
