// Screenshot every car (dev/lineup.html) into screenshots/dev-lineup.png. Needs `npm run serve` on 4174.
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:4174/dev/lineup.html"); await p.waitForFunction(() => window.done, null, { timeout: 60000 });
await p.screenshot({ path: "screenshots/dev-lineup.png" }); await b.close();
