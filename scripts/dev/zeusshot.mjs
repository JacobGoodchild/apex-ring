// Screenshots of the chasm flight on Zeus's Fury: node scripts/dev/zeusshot.mjs [tag] (needs serve.mjs 4174)
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "zeus";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 915, height: 412 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });
await p.goto(`http://localhost:4174/?test=1&quality=${process.env.Q || "medium"}&autopilot=1&track=zeus&rivals=3&speed=1`);
await p.waitForFunction(() => window.__apex && window.__apex.ready);
await p.click("#raceBtn"); await p.click("#startBtn");
await p.waitForFunction(() => window.__apex.mode === "race" && window.__apex.player.vF > 20, null, { timeout: 60000 });
await p.evaluate(() => window.__apex.warp(window.__apex.gapD() - 330));
await p.waitForFunction(() => window.__apex.flight.flying, null, { timeout: 60000 });
await p.screenshot({ path: `screenshots/dev-${tag}-1.png` });
await p.waitForTimeout(500); await p.screenshot({ path: `screenshots/dev-${tag}-2.png` });
// a still from the side, looking along the canyon
await p.evaluate(() => window.__apex.photo(1.75, 0.18, 34)); await p.waitForTimeout(700);
await p.screenshot({ path: `screenshots/dev-${tag}-3.png` });
await p.evaluate(() => window.__apex.photo(2.6, 0.35, 60)); await p.waitForTimeout(700);
await p.screenshot({ path: `screenshots/dev-${tag}-4.png` });
await b.close();
