// Screenshot the lobby at a given quality. Usage: node scripts/dev/menushot.mjs high 1400 700
import { chromium } from "@playwright/test";
const [q = "high", w = 1400, h = 700] = process.argv.slice(2);
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(`http://localhost:4174/index.html?test=1&quality=${q}`);
await p.waitForFunction(() => window.__apex && window.__apex.ready); await p.waitForTimeout(2500);
await p.screenshot({ path: "screenshots/dev-menu.png" }); await b.close();
