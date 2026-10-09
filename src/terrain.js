// Terrain around a track: one heightfield that sits just under the road near the track and rolls away into
// hills or mountains, textured with photos (ground, rock on steep slopes, snow up high).
// The grid is denser near the track than out at the horizon so it stays cheap on phones.
import * as THREE from "three";
import { photo } from "./photo.js";

// Per scenery kind: hill size near the track, mountain size far away, ridged peaks, snow line (m), rock tint.
const STYLE = {
  parkland: { near: 3, far: 70, ridged: false, snow: 1e9, rock: 0x9a9a90 },
  forest: { near: 7, far: 110, ridged: false, snow: 1e9, rock: 0x8a8a80 },
  mountain: { near: 9, far: 420, ridged: true, snow: 150, rock: 0xa8a8ac },
  desert: { near: 3, far: 110, ridged: true, snow: 1e9, rock: 0xd88a60 },
  // the sea on the east (+x) side, cliffs and mountains rising steeply inland to the west
  coastal: { near: 7, far: 360, ridged: true, snow: 1e9, rock: 0x7a7e84, coast: true },
};
export const hasTerrain = (theme) => !!STYLE[theme.scenery];

function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, s, oct, ridged) {
  let f = 0, amp = 0.5, fr = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    let n = vnoise(x * fr, y * fr, s + o * 17);
    if (ridged) { n = 1 - Math.abs(n); n = n * n * 2 - 1; }
    f += n * amp; norm += amp; amp *= 0.5; fr *= 2.03;
  }
  return f / norm;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Terrain {
  constructor(path, theme, quality = "medium", seed = 1) {
    this.path = path; this.style = STYLE[theme.scenery]; this.seed = seed;
    const P = path, N = P.N;
    const minX = Math.min(...P.x), maxX = Math.max(...P.x), minZ = Math.min(...P.z), maxZ = Math.max(...P.z);
    this.cx = (minX + maxX) / 2; this.cz = (minZ + maxZ) / 2; this.minX = minX; this.maxX = maxX;
    this.inner = Math.max(maxX - minX, maxZ - minZ) / 2 + 260; // dense part covers the track plus a margin
    this.outer = this.inner + 1500;
    this.edge = P.width / 2 + P.runoff;
    // spatial hash of non-bridge centre-line samples, plus the lowest point of the road cross-section at each
    this.cell = 40; this.hashMap = new Map(); this.base = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.base[i] = P.y[i] - this.edge * Math.abs(Math.sin(P.bank[i])) - 0.35;
      if (P.bridge[i]) continue;
      const k = this.key(Math.floor(P.x[i] / this.cell), Math.floor(P.z[i] / this.cell));
      if (!this.hashMap.has(k)) this.hashMap.set(k, []); this.hashMap.get(k).push(i);
    }
    this.res = { low: 100, medium: 140, high: 180 }[quality] || 140;
    this.spacing = (this.inner * 2) / (this.res * 0.7);
    this.geometry = this.buildGeometry();
    this.theme = theme;
  }

  // 4x4 tiles so the ones behind the camera are culled
  get mesh() {
    if (this._mesh) return this._mesh;
    const grp = new THREE.Group(), mat = this.material(this.theme), n = this.res, T = 4, g = this.geometry;
    const P = g.attributes.position.array, U = g.attributes.uv.array, Nn = g.attributes.normal.array, M = g.attributes.tmix.array, C = g.attributes.color.array;
    for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
      const i0 = Math.floor((tx * n) / T), i1 = Math.floor(((tx + 1) * n) / T), j0 = Math.floor((ty * n) / T), j1 = Math.floor(((ty + 1) * n) / T);
      const w = i1 - i0 + 1, h = j1 - j0 + 1, pos = new Float32Array(w * h * 3), nor = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2), mix = new Float32Array(w * h * 2), col = new Float32Array(w * h * 3);
      let k = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++, k++) {
        const s = j * (n + 1) + i;
        pos.set(P.subarray(s * 3, s * 3 + 3), k * 3); nor.set(Nn.subarray(s * 3, s * 3 + 3), k * 3); col.set(C.subarray(s * 3, s * 3 + 3), k * 3);
        uv.set(U.subarray(s * 2, s * 2 + 2), k * 2); mix.set(M.subarray(s * 2, s * 2 + 2), k * 2);
      }
      const idx = []; for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); cg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      cg.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); cg.setAttribute("tmix", new THREE.BufferAttribute(mix, 2)); cg.setAttribute("color", new THREE.BufferAttribute(col, 3)); cg.setIndex(idx);
      cg.computeBoundingSphere();
      const m = new THREE.Mesh(cg, mat); grp.add(m); // no shadows on the hills: only the road gets car shadows
    }
    grp.name = "terrain"; this._mesh = grp;
    return grp;
  }

  key(a, b) { return (a + 4096) * 8192 + (b + 4096); }

  // natural ground height before the track is cut in
  natural(x, z) {
    const S = this.style, dx = x - this.cx, dz = z - this.cz, r = Math.sqrt(dx * dx + dz * dz);
    if (S.coast) {
      const sea = this.maxX + 45;
      if (x > sea) return Math.max(-10, -(x - sea) / 12) + fbm(x / 40, z / 40, this.seed + 3, 2, false) * 0.4; // beach into the sea
      const inland = smooth(this.minX - 20, this.minX - 420, x), ends = smooth(this.inner - 300, this.inner + 300, Math.abs(dz));
      const cliffs = (fbm(x / 240, z / 300, this.seed + 5, 5, true) * 0.5 + 0.5) * S.far * Math.max(inland, ends * 0.5);
      return fbm(x / 170, z / 170, this.seed, 3, false) * S.near * (1 - smooth(sea - 60, sea, x)) + cliffs;
    }
    const far = smooth(this.inner - 200, this.inner + 900, r);
    const hills = fbm(x / 260, z / 260, this.seed, 3, false) * S.near;
    const mount = (fbm(x / 520, z / 520, this.seed + 5, 5, S.ridged) * 0.5 + 0.5) * S.far * far;
    return hills + mount;
  }

  heightAt(x, z) {
    const P = this.path, T = this.natural(x, z), flat = this.edge + this.spacing + 2;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell), R = 6;
    let best = 1e18, bi = -1, low = 1e9;
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const l = this.hashMap.get(this.key(cx + a, cz + b)); if (!l) continue;
      for (const i of l) {
        const ddx = x - P.x[i], ddz = z - P.z[i], d2 = ddx * ddx + ddz * ddz;
        if (d2 < best) { best = d2; bi = i; }
        if (d2 < flat * flat && this.base[i] < low) low = this.base[i];
      }
    }
    if (bi < 0) return T;
    const d = Math.sqrt(best), base = this.base[bi];
    const t = smooth(flat, flat + 30 + Math.abs(T - base) * 1.6, d);
    return Math.min(low, base + (T - base) * t);
  }

  buildGeometry() {
    const n = this.res, inner = this.inner, outer = this.outer;
    // warp: 70% of the vertices cover the inner square, the rest stretch out to the horizon
    const warp = (u) => { const a = Math.abs(u), s = Math.sign(u); return s * (a < 0.7 ? (a / 0.7) * inner : inner + ((a - 0.7) / 0.3) * (outer - inner)); };
    const cnt = (n + 1) * (n + 1), pos = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2), mix = new Float32Array(cnt * 2);
    let k = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = this.cx + warp((i / n) * 2 - 1), z = this.cz + warp((j / n) * 2 - 1);
      const y = this.heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7; k++;
    }
    const idx = new Uint32Array(n * n * 6); let q = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const nor = g.attributes.normal.array;
    for (let v = 0; v < cnt; v++) {
      const ny = nor[v * 3 + 1], y = pos[v * 3 + 1];
      mix[v * 2] = smooth(0.86, 0.62, ny); // rock on steep slopes
      mix[v * 2 + 1] = smooth(this.style.snow - 25, this.style.snow + 40, y) * smooth(0.5, 0.75, ny);
    }
    g.setAttribute("tmix", new THREE.BufferAttribute(mix, 2));
    // large-scale colour variation baked per vertex (cheaper than extra texture lookups, and hides tiling)
    const col = new Float32Array(cnt * 3);
    for (let v = 0; v < cnt; v++) {
      const x = pos[v * 3], z = pos[v * 3 + 2], a = fbm(x / 90, z / 90, this.seed + 31, 3, false), b = fbm(x / 23, z / 23, this.seed + 41, 2, false);
      const l = 0.9 + a * 0.22 + b * 0.08;
      col[v * 3] = l * (1 + a * 0.06); col[v * 3 + 1] = l; col[v * 3 + 2] = l * (1 - a * 0.08);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }

  material(theme) {
    const mat = new THREE.MeshStandardMaterial({ map: photo(theme.groundTex || "grass"), roughness: 1, vertexColors: true });
    mat.color.set(theme.groundTint || 0xd8d8d8);
    const rock = photo(theme.scenery === "desert" ? "rock" : "rock"), snow = photo("snow");
    const rockTint = new THREE.Color(this.style.rock);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rockMap = { value: rock }; sh.uniforms.snowMap = { value: snow }; sh.uniforms.rockTint = { value: rockTint };
      sh.vertexShader = "attribute vec2 tmix; varying vec2 vMix;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n vMix = tmix;");
      sh.fragmentShader = "uniform sampler2D rockMap; uniform sampler2D snowMap; uniform vec3 rockTint; varying vec2 vMix;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
        vec4 c = texture2D(map, vMapUv);
        if (vMix.x > 0.01) {
          vec4 r = texture2D(rockMap, vMapUv * 0.18);
          r.rgb *= rockTint / max(diffuse, vec3(0.05));
          c = mix(c, r, vMix.x);
        }
        if (vMix.y > 0.01) {
          vec4 s = texture2D(snowMap, vMapUv * 0.4);
          s.rgb *= 1.0 / max(diffuse, vec3(0.05));
          c = mix(c, s, vMix.y);
        }
        diffuseColor *= c;`);
    };
    mat.customProgramCacheKey = () => "terrain";
    return mat;
  }
}
