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
  winter: { near: 8, far: 340, ridged: true, snow: -60, rock: 0x8c949e },
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
    // canyons: a gap in the road (Zeus's Fury) is a real canyon running across the track, built as its own detailed mesh
    this.canyons = (P.gaps || []).map((g) => {
      const mid = (g.d0 + g.d1) / 2, c = P.pointAt(mid, 0, {});
      return { cx: c.x, cz: c.z, fx: Math.sin(c.h), fz: Math.cos(c.h), half: (g.d1 - g.d0) / 2, vmax: 1000 };
    });
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
    for (const C of this.canyons) { const cm = this.canyonMesh(C, mat); grp.add(cm.ground); grp.add(cm.river); }
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

  // Canyon frame for (x, z): u along the road (across the canyon), v along the canyon; its centre line meanders away
  // from the road and it narrows to nothing at the ends. Near the road (|v| < 60) the rims sit exactly at the gap ends.
  canyonAt(C, x, z) {
    const dx = x - C.cx, dz = z - C.cz, u = dx * C.fx + dz * C.fz, v = dx * C.fz - dz * C.fx, av = Math.abs(v);
    const far = smooth(60, 380, av);
    const uc = Math.sin(v / 260) * 45 * far;
    const hw = C.half * (1 + 0.22 * Math.sin(v / 190 + 1.3) * far) * smooth(C.vmax, C.vmax - 260, av) + Math.sin(v * 0.07) * 3 * smooth(30, 110, av);
    return { u, v, uc, hw, t: hw - Math.abs(u - uc) };
  }
  // depth below the rim at distance t inside it: a sheer drop, a ledge, another cliff, a ledge, the last drop to the floor
  static drop(t) {
    if (t <= 0) return 0;
    const steps = [[0, 0], [4, 85], [24, 98], [29, 168], [50, 180], [55, 250]];
    for (let k = 1; k < steps.length; k++) { const [t0, d0] = steps[k - 1], [t1, d1] = steps[k]; if (t <= t1) return d0 + (d1 - d0) * (t - t0) / (t1 - t0); }
    return 250 + Math.min(8, (t - 55) * 0.08);
  }

  heightAt(x, z, carve = true) {
    // under the canyon's own mesh (and a margin round it) the coarse terrain drops well out of sight
    if (carve) for (const C of this.canyons) { const k = this.canyonAt(C, x, z); if (k.t > -48 && Math.abs(k.v) < C.vmax + 70) return this.heightAt(x, z, false) - 340; }
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

  // The canyon: rows along it (dense near the road), and in each row samples across it at the profile's break points so
  // the cliff edges stay sharp. Walls get rough (jittered sideways), rock bands are baked into the vertex colours.
  canyonMesh(C, mat) {
    const vs = [];
    for (let v = -C.vmax - 60; v <= C.vmax + 60;) { vs.push(v); const a = Math.abs(v); v += a < 160 ? 7 : a < 600 ? 18 : 36; }
    const ts = [-46, -30, -16, -7, -2.5, -0.6, 0, 0.6, 1.6, 2.8, 3.7, 4.6, 8, 13, 18, 23, 23.8, 25, 26.6, 28.2, 29.4, 33, 40, 47, 49.6, 50.8, 52.5, 54.2, 55.4, 62];
    const pos = [], uv = [], col = [], rows = [];
    for (const v of vs) {
      const k0 = this.canyonAt(C, C.cx + C.fz * v, C.cz - C.fx * v), uc = k0.uc, hw = k0.hw, row = [];
      // across: left rim profile, the floor, right rim profile
      const us = [];
      for (const t of ts) if (t < hw) us.push(uc - hw + t);
      for (let u = uc - hw + 70; u < uc + hw - 70; u += 14) us.push(u);
      for (let i = ts.length - 1; i >= 0; i--) if (ts[i] < hw) us.push(uc + hw - ts[i]);
      us.sort((a, b) => a - b);
      for (const u of us) {
        const x0 = C.cx + C.fx * u + C.fz * v, z0 = C.cz + C.fz * u - C.fx * v;
        const k = this.canyonAt(C, x0, z0), g = this.heightAt(x0, z0, false);
        const d = Terrain.drop(k.t), wall = k.t > 0 && k.t < 60;
        // rough rock: walls pushed in and out a little, depth wobbles; nothing moves at the road's two lips
        const near = smooth(25, 70, Math.abs(v)), j = wall ? fbm(v / 9, d / 11, this.seed + 7, 3, false) * 3.2 * near : 0;
        const y = k.t > 0 ? g - d + (d > 4 ? fbm(v / 30, u / 30, this.seed + 9, 2, false) * 5 * near : 0) : g + 0.12;
        const ux = u + j * Math.sign(u - k.uc);
        const x = C.cx + C.fx * ux + C.fz * v, z = C.cz + C.fz * ux - C.fx * v;
        pos.push(x, y, z); uv.push(v / 7, (y + u * 0.35) / 7);
        // strata: warm sandstone bands down the walls, darker in the depths
        const band = 0.86 + 0.14 * Math.sin(y * 0.33 + fbm(v / 60, y / 20, this.seed + 3, 2, false) * 2.5), deep = 1 - smooth(0, 250, d) * 0.35;
        const l = (k.t > 0 ? band * deep : 0.95 + fbm(x / 90, z / 90, this.seed + 31, 3, false) * 0.2);
        col.push(l * (k.t > 0 ? 1.55 : 1), l * (k.t > 0 ? 1.3 : 1), l * (k.t > 0 ? 1.08 : 1));
        row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    }
    // stitch neighbouring rows (they can have different counts): walk both rows by position across the canyon
    const idx = [], P = pos;
    const across = (i) => { const x = P[i * 3] - C.cx, z = P[i * 3 + 2] - C.cz; return x * C.fx + z * C.fz; };
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r], B = rows[r + 1]; let a = 0, b = 0;
      while (a < A.length - 1 || b < B.length - 1) {
        const advA = b >= B.length - 1 || (a < A.length - 1 && across(A[a + 1]) <= across(B[b + 1]));
        if (advA) { idx.push(A[a], B[b], A[a + 1]); a++; } else { idx.push(A[a], B[b], B[b + 1]); b++; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    // fix winding where rows were stitched the other way round: make every normal point up-ish/out of the rock
    const nor = g.attributes.normal.array, mix = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) { const ny = nor[i * 3 + 1]; mix[i * 2] = smooth(0.8, 0.45, Math.abs(ny)); mix[i * 2 + 1] = 0; }
    g.setAttribute("tmix", new THREE.BufferAttribute(mix, 2));
    const m = new THREE.Mesh(g, mat.clone()); m.material.side = THREE.DoubleSide; m.material.customProgramCacheKey = () => "terrainDS"; m.material.onBeforeCompile = mat.onBeforeCompile;
    m.name = "canyon";
    // the river at the bottom, following the canyon's centre line
    const rp = [], ri = [];
    vs.forEach((v, i) => {
      const k = this.canyonAt(C, C.cx + C.fz * v, C.cz - C.fx * v);
      const w = Math.max(4, Math.min(16, k.hw - 56)), x0 = C.cx + C.fx * k.uc + C.fz * v, z0 = C.cz + C.fz * k.uc - C.fx * v;
      const y = this.heightAt(x0, z0, false) - Terrain.drop(k.hw) + 2.2;
      rp.push(x0 - C.fx * w, y, z0 - C.fz * w, x0 + C.fx * w, y, z0 + C.fz * w);
      if (i < vs.length - 1) { const a = i * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    const river = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x5f7f8f, roughness: 0.15, metalness: 0.3, side: THREE.DoubleSide }));
    river.name = "river";
    return { ground: m, river };
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
