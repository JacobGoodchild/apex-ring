import { TrackPath } from "../../src/track.js";
import { TRACKS } from "../../src/tracks.js";
import { chromium } from "@playwright/test";
const ids = process.argv.slice(2);
let html = "<body style='margin:0;background:#111;display:flex;flex-wrap:wrap'>";
for (const id of ids) {
  const def = TRACKS.find(t => t.id === id); const p = new TrackPath(def);
  const xs=[...p.x], zs=[...p.z]; const mx=Math.min(...xs)-20, Mx=Math.max(...xs)+20, mz=Math.min(...zs)-20, Mz=Math.max(...zs)+20;
  const s = 480/Math.max(Mx-mx, Mz-mz);
  let svg = `<svg width=500 height=520 style='background:#223'><text x=5 y=15 fill=white font-size=12>${id} L=${p.length.toFixed(0)} minV=${Math.min(...p.speedProfile(34)).toFixed(0)} maxY=${Math.max(...p.y).toFixed(0)}</text>`;
  for (let i=0;i<p.N;i++){ const j=(i+1)%p.N; const c = p.bridge[i]?"#f0f":p.tunnel[i]?"#0ff":`hsl(${120-p.y[i]*4},80%,50%)`;
    svg += `<line x1=${(p.x[i]-mx)*s+10} y1=${(p.z[i]-mz)*s+30} x2=${(p.x[j]-mx)*s+10} y2=${(p.z[j]-mz)*s+30} stroke='${c}' stroke-width=${Math.max(2,p.width*s)} />`; }
  for (let k=0;k<def.points.length;k++){ const q=def.points[k]; svg+=`<text x=${(q[0]-mx)*s+12} y=${(q[1]-mz)*s+28} fill=white font-size=9>${k}</text>`; }
  svg += `<circle cx=${(p.x[0]-mx)*s+10} cy=${(p.z[0]-mz)*s+30} r=5 fill=white />`;
  html += svg + "</svg>";
}
const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1000,height:1040}});
await pg.setContent(html); await pg.screenshot({path:"screenshots/dev-plot.png"}); await b.close();
