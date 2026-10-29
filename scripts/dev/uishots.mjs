// Screenshots of the menu screens at phone portrait, phone landscape and desktop: node scripts/dev/uishots.mjs [tag] [screens]
// screens: comma list of menu,setup,garage,career,settings,online,daily (needs serve.mjs 4174)
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "ui", screens = (process.argv[3] || "menu,setup").split(",");
const ALL = { s: [360, 640], p: [412, 915], l: [915, 412], t: [820, 1180], w: [1000, 560], d: [1366, 768], b: [1920, 1080] };
const sizes = Object.fromEntries((process.env.SIZES || "s,p,l,t,w,d,b").split(",").map((k) => [k, ALL[k]])); // SIZES=p,l to pick some
const open = { setup: "#raceBtn", garage: "#garageBtn", career: "#careerBtn", settings: "#settingsBtn", online: "#onlineBtn", daily: "#dailyBtn", help: "#helpBtn" };
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [k, [w, h]] of Object.entries(sizes)) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`http://localhost:4174/?test=1&quality=medium`);
  await p.waitForFunction(() => window.__apex && window.__apex.ready);
  await p.waitForTimeout(800);
  for (const s of screens) {
    if (s !== "menu") await p.click(open[s]);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `screenshots/dev-${tag}-${s}-${k}.png` });
    if (s !== "menu") { await p.goto(`http://localhost:4174/?test=1&quality=medium`); await p.waitForFunction(() => window.__apex && window.__apex.ready); await p.waitForTimeout(500); }
  }
  await p.close();
}
await b.close();
