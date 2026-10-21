// Bakes the tree impostor atlas (assets/trees/atlas.webp + src/treeatlas.js) from Poly Haven CC0 tree models in
// devassets/models (downloaded separately, not shipped). node scripts/dev/impostors.mjs  (needs serve.mjs 4174)
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
// [key, model, which variants (null = all), max variants]
// (variants [-1] = the whole file is a single tree split into parts)
const TREES = [["pine", "fir_tree_01", null, 3], ["fir", "fir_sapling_medium", null, 3], ["broad", "island_tree_01", [-1], 1], ["broad", "island_tree_02", [-1], 1],
  ["quiver", "quiver_tree_01", [-1], 1], ["grass", "grass_medium_01", [0, 6], 2], ["grass", "grass_medium_02", [1], 1], ["bush", "shrub_02", [0], 1], ["bush", "shrub_03", [1], 1]];
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--js-flags=--max-old-space-size=6000"] });
const p = await b.newPage({ viewport: { width: 512, height: 1024 } });
p.on("console", (m) => console.log("page:", m.text()));
await p.goto("http://localhost:4174/dev/impostor.html"); await p.waitForFunction(() => window.ready);
const out = [];
for (const [key, model, pick, max] of TREES) {
  const url = `../devassets/models/${model}/${model}.gltf`, n = await p.evaluate((u) => window.variants(u), url);
  const idx = (pick || [...Array(n).keys()]).slice(0, max);
  for (const i of idx) { const r = await p.evaluate(([u, i]) => window.bake(u, i), [url, i]); out.push({ key, ...r }); console.log(key, model, i, "/", n, r.height.toFixed(1), r.base.toFixed(3)); }
}
// atlas: one 256x512 cell per tree, side by side, drawn in the page so it can be saved as webp with alpha
const atlas = await p.evaluate(async (cells) => {
  const cw = 256, ch = 512, cols = 8, c = document.createElement("canvas"); c.width = cw * cols; c.height = ch * Math.ceil(cells.length / cols);
  const g = c.getContext("2d");
  for (let i = 0; i < cells.length; i++) { const im = new Image(); im.src = cells[i]; await im.decode(); g.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); }
  return c.toDataURL("image/webp", 0.86);
}, out.map((o) => o.url));
mkdirSync("assets/trees", { recursive: true });
writeFileSync("assets/trees/atlas.webp", Buffer.from(atlas.split(",")[1], "base64"));
const meta = out.map((o, i) => `  { key: "${o.key}", cell: ${i}, base: ${o.base.toFixed(3)}, extent: ${o.extent.toFixed(2)}, height: ${o.height.toFixed(2)} },`).join("\n");
writeFileSync("src/treeatlas.js", `// Tree impostors baked by scripts/dev/impostors.mjs from Poly Haven CC0 models (see CREDITS.md).\n// Cells of 256x512 (8 per row) in assets/trees/atlas.webp; base = where the ground sits (fraction up from the cell bottom);\n// extent = how many metres tall the cell is, height = the tree's real height.\nexport const TREE_COLS = 8, TREE_ROWS = ${Math.ceil(out.length / 8)};\nexport const TREE_CELLS = [\n${meta}\n];\n`);
await b.close();
