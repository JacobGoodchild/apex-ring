// Lists anything solid sitting within car height above the road on every track (uses __apex.roadCover). Needs: node scripts/serve.mjs 4174
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 412, height: 915 } });
for (const t of ["oval","gp","forest","canyon","harbour","neon","alpine","xtreme"]) {
  await p.goto(`http://localhost:4174/?test=1&track=${t}`);
  await p.waitForFunction(() => window.__apex && window.__apex.track, null, { timeout: 30000 }).catch(()=>{});
  const r = await p.evaluate(() => window.__apex.roadCover());
  const groups = {}; for (const h of r) { const k = h.col + " " + h.name; (groups[k] ||= []).push(h.i + "/" + h.lat + "@" + h.dist); }
  console.log(t, r.length, JSON.stringify(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length + " e.g. " + v.slice(0, 4).join(" ")]))));
}
await b.close();
