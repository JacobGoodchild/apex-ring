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
