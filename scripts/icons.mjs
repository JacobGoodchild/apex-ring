// Renders icons/icon.svg to the PNG sizes the web app manifest needs. Run: node scripts/icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const svg = readFileSync("icons/icon.svg", "utf8");
const b = await chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await p.screenshot({ path: `icons/icon-${size}.png` });
}
await b.close();
