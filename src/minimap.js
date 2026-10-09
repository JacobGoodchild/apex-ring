// 2D track drawings: the in-race minimap and the track preview in menus.
export function trackShape(path, size, pad = 8) {
  let mx = Infinity, Mx = -Infinity, mz = Infinity, Mz = -Infinity;
  for (let i = 0; i < path.N; i++) { mx = Math.min(mx, path.x[i]); Mx = Math.max(Mx, path.x[i]); mz = Math.min(mz, path.z[i]); Mz = Math.max(Mz, path.z[i]); }
  const s = (size - pad * 2) / Math.max(Mx - mx, Mz - mz);
  const ox = pad + (size - pad * 2 - (Mx - mx) * s) / 2, oz = pad + (size - pad * 2 - (Mz - mz) * s) / 2;
  return { map: (x, z) => [ox + (x - mx) * s, oz + (z - mz) * s], s };
}

export function drawTrack(ctx, path, size, { line = "rgba(238,242,247,.85)", width = 3, start = true, bridge = "#f2a65a" } = {}) {
  const t = trackShape(path, size);
  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = width + 3; trace(ctx, path, t, 0, path.N); ctx.stroke();
  ctx.strokeStyle = line; ctx.lineWidth = width; trace(ctx, path, t, 0, path.N); ctx.stroke();
  // draw bridges on top so crossings read clearly
  for (let i = 0; i < path.N; i++) if (path.bridge[i] && path.bridge[(i + 1) % path.N]) {
    ctx.strokeStyle = bridge; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(...t.map(path.x[i], path.z[i])); ctx.lineTo(...t.map(path.x[(i + 1) % path.N], path.z[(i + 1) % path.N])); ctx.stroke();
  }
  if (start) { const [x, y] = t.map(path.x[0], path.z[0]); ctx.fillStyle = "#fff"; ctx.fillRect(x - 3, y - 3, 6, 6); }
  return t;
}

function trace(ctx, path, t, a, b) {
  ctx.beginPath();
  for (let i = a; i <= b; i++) { const k = i % path.N; const [x, y] = t.map(path.x[k], path.z[k]); i === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
}

export class Minimap {
  constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext("2d"); this.bg = document.createElement("canvas"); }
  setTrack(path) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), css = this.c.clientWidth || 110;
    this.size = css; this.c.width = this.bg.width = css * dpr; this.c.height = this.bg.height = css * dpr;
    const g = this.bg.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.t = drawTrack(g, path, css, { width: 3 }); this.dpr = dpr;
  }
  // cars: [{x, z, color, me}]
  draw(cars) {
    if (!this.t) return;
    const g = this.ctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height);
    g.drawImage(this.bg, 0, 0); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const car of cars) {
      const [x, y] = this.t.map(car.x, car.z);
      g.beginPath(); g.arc(x, y, car.me ? 4.5 : 3.2, 0, Math.PI * 2);
      g.fillStyle = car.color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = car.me ? "#fff" : "rgba(0,0,0,.7)"; g.stroke();
    }
  }
}
