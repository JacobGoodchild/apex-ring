// node scripts/dev/wingshot.mjs -> screenshots/dev-wings.png (needs serve.mjs 4174)
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1200, height: 600 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:4174/dev/wings.html"); await p.waitForFunction(() => window.done, null, { timeout: 30000 });
await p.screenshot({ path: "screenshots/dev-wings.png" }); await b.close();
