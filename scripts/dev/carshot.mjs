// Screenshot dev/carview.html. Usage: node scripts/dev/carshot.mjs [carId] [doors 0..1]
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
p.on("pageerror", (e) => console.log("pageerror", e.message)); p.on("console", (m) => m.type() === "error" && console.log(m.text()));
await p.goto(`http://localhost:4174/dev/carview.html?car=${process.argv[2] || "vanta"}&doors=${process.argv[3] || 0}`);
await p.waitForFunction(() => window.done, null, { timeout: 30000 });
await p.screenshot({ path: "screenshots/dev-car.png" }); await b.close();
