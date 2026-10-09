// Canvas-drawn textures, so the game ships no image files.
import * as THREE from "three";

export function canvasTex(w, h, draw, { repeat = null, aniso = 4, srgb = true } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

export function noiseTex(base, spread, size, rep) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * spread; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }, { repeat: [rep, rep] });
}

// soft round sprite used for smoke and glows
export function softDot(color = "255,255,255") {
  return canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, `rgba(${color},1)`); r.addColorStop(0.4, `rgba(${color},.5)`); r.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

// Tileable wave normal map (sum of sines in a few directions), drawn once on a canvas. Used for water.
export function waveNormals(size = 256) {
  const H = new Float32Array(size * size);
  const waves = [[1, 0, 3, 1], [0, 1, 4, 0.8], [1, 1, 5, 0.5], [-1, 2, 7, 0.35], [3, -1, 11, 0.25], [2, 3, 17, 0.15]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0; for (const [a, b, f, amp] of waves) h += Math.sin(((a * x + b * y) / size) * Math.PI * 2 * f / Math.hypot(a, b) + a * 1.7) * amp;
    H[y * size + x] = h;
  }
  return canvasTex(size, size, (g) => {
    const img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = H[y * size + ((x + 1) % size)] - H[y * size + ((x - 1 + size) % size)], dy = H[((y + 1) % size) * size + x] - H[((y - 1 + size) % size) * size + x];
      const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * size + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}
