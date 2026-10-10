// Screenshots of the time-trial medal line (race setup) and the medal on the results card.
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 412, height: 915 } });
await p.goto("http://localhost:4174/?test=1&autopilot=1&speed=8&laps=2&track=oval");
await p.waitForFunction(() => window.__apex && window.__apex.mode === "menu");
await p.click("#raceBtn"); await p.click("#modeTrial");
await p.screenshot({ path: "screenshots/dev-medal-setup.png" });
await p.click("#startBtn");
await p.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 90_000 });
await p.waitForTimeout(600);
await p.screenshot({ path: "screenshots/dev-medal-results.png" });
await b.close();
