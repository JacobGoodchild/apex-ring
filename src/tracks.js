// Track definitions. Control points are [x, z, height]; the centre-line is a closed Catmull-Rom spline through them.
export const THEMES = {
  dusk: {
    sky: [0x0d1b2a, 0x35507a, 0xf2a65a], sunDir: [-0.8, 0.12, -0.55], sunColor: 0xffc49a, sunIntensity: 1.6,
    hemi: [0x9fb4e0, 0x1a2a1e, 0.6], fog: 0x41506b, fogNear: 160, fogFar: 1100, ground: 0x2a4a33,
    runoff: "#4b6b3f", embankment: 0x3d5a35, scenery: "parkland", label: "Parkland · Dusk", clouds: 0.45, cloudColor: 0xc8a8a0, groundTex: "grass", runTex: "grass",
  },
  coast: {
    sky: [0x02040c, 0x0b1630, 0x1d2f55], sunDir: [0.5, 0.35, -0.7], sunColor: 0x9fb8ff, sunIntensity: 0.55, stars: 1,
    hemi: [0x4a5f9a, 0x0b0f18, 0.55], fog: 0x0b1428, fogNear: 120, fogFar: 900, ground: 0x1a1f28, exposure: 1.15,
    runoff: "#2d323c", asphalt: "#30343c", embankment: 0x2a2f38, scenery: "city", label: "Coastal city · Night", clouds: 0.35, cloudColor: 0x1a2236, groundTex: "gravel", groundTint: 0x8a8a90, runTex: "concrete", runTint: 0x9098a8, embTex: "concrete",
    wallA: "#cfd6e4", wallB: "#c2332b", lampColor: 0xffd59a, sea: true, envIntensity: 0.4, bloom: 0.8, sign: "HARBOUR LIGHTS",
  },
  mountain: {
    sky: [0x2c6fc2, 0x7fb2e8, 0xdfeaf5], sunDir: [0.6, 0.55, 0.4], sunColor: 0xfff3e0, sunIntensity: 2.0,
    hemi: [0xbfd8ff, 0x50604a, 0.8], fog: 0xb9cde3, fogNear: 220, fogFar: 1500, ground: 0x56704a,
    runoff: "#7d7a70", embankment: 0x6b6a5c, scenery: "mountain", label: "Mountain pass · Day", rockfall: true, clouds: 0.5, groundTex: "grass", runTex: "gravel", embTex: "rock", tree: 0x24452f, sign: "ALPINE PASS",
  },
  desert: {
    sky: [0x3d6fb0, 0xd99a62, 0xffcf8a], sunDir: [-0.4, 0.3, 0.8], sunColor: 0xffc58a, sunIntensity: 2.0,
    hemi: [0xffd2a8, 0x8a4a2a, 0.7], fog: 0xe0a878, fogNear: 200, fogFar: 1300, ground: 0xc07a48,
    runoff: "#c98f5d", asphalt: "#4a4440", embankment: 0xa8643a, scenery: "desert", label: "Desert canyon · Sunset", rockfall: true, clouds: 0.18, cloudColor: 0xffd8b0, groundTex: "sand", groundTint: 0xffc49a, runTex: "sand", runTint: 0xffd0a8, embTex: "sand", asphaltTint: 0.85, sign: "RED CANYON",
  },
  neon: {
    sky: [0x05010f, 0x1c0838, 0x5a1a6e], sunDir: [0, 0.2, -1], sunColor: 0xff4fd8, sunIntensity: 0.4, stars: 0.5,
    hemi: [0x7a4dff, 0x10051c, 0.6], fog: 0x1a0830, fogNear: 100, fogFar: 750, ground: 0x0d0b14, exposure: 1.2,
    runoff: "#1b1726", asphalt: "#24222c", lines: "#7df9ff", embankment: 0x1a1426, scenery: "neon", label: "Neon city · Night", wetRoad: true, clouds: 0.25, cloudColor: 0x2a1240, groundTex: "concrete", groundTint: 0x4a4258, runTex: "concrete", runTint: 0x5a5068, embTex: "concrete", asphaltTint: 0.55,
    wallA: "#14121c", wallB: "#ff2bd6", wallGlow: 0x7a1066, lampColor: 0x7df9ff, envIntensity: 0.5, bloom: 1.0, sign: "NEON DISTRICT",
  },
  forest: {
    sky: [0x4a86c8, 0x9cc4e6, 0xe8f0e0], sunDir: [-0.5, 0.6, -0.3], sunColor: 0xfff0d0, sunIntensity: 1.8,
    hemi: [0xcfe3ff, 0x2a4020, 0.8], fog: 0xa9c4b8, fogNear: 150, fogFar: 1100, ground: 0x3f6a30,
    runoff: "#557a3c", embankment: 0x406a2c, scenery: "forest", label: "Forest circuit · Morning", clouds: 0.55, groundTex: "grass", runTex: "drygrass", tree: 0x1d4a26, sign: "GREENWOOD",
  },
  storm: {
    sky: [0x4c5560, 0x7d8790, 0xa9b1b8], sunDir: [-0.3, 0.75, 0.4], sunColor: 0xc8d0d8, sunIntensity: 0.9,
    hemi: [0xc0c8d0, 0x2a2e30, 1.1], fog: 0x8d969e, fogNear: 60, fogFar: 760, ground: 0x3a3c3e, exposure: 1.05,
    clouds: 0.95, cloudColor: 0x9aa2aa, groundTex: "gravel", groundTint: 0x5e6062, runTex: "gravel", runTint: 0x6a6c6e, embTex: "darkrock",
    asphaltTint: 0.62, wetRoad: true, rain: true, centreLine: "#d8b23a", lines: "#e2e4e6", sea: true, seaColor: 0x2f3d44, seaY: -0.8, poles: true,
    wallA: "#d8dadc", wallB: "#2b2f36", tree: 0x2a3a2e, scenery: "coastal", label: "Coastal highway · Rain", envIntensity: 0.7, bloom: 0.4, sign: "COASTAL HIGHWAY",
  },
  winter: {
    sky: [0x8fa3ba, 0xc4cfdb, 0xe4e9ef], sunDir: [-0.5, 0.35, 0.5], sunColor: 0xfff4e6, sunIntensity: 1.3,
    hemi: [0xdfe8f2, 0x8a96a4, 1.0], fog: 0xd6dde5, fogNear: 90, fogFar: 760, ground: 0xe8edf2, exposure: 0.95,
    clouds: 0.8, cloudColor: 0xe8ecf0, groundTex: "snow", groundTint: 0xf2f4f7, runTex: "snow", runTint: 0xe8ecf0, embTex: "snow",
    asphaltTint: 0.7, snowfall: true, tree: 0x4f6a5e, wallA: "#e6ebf0", wallB: "#2a6fd6", scenery: "winter", label: "Winter valley · Snow", sign: "FROSTBITE RIDGE",
  },
  xtreme: {
    sky: [0x1b1030, 0x6b3a5a, 0xff9a4a], sunDir: [0.7, 0.18, -0.6], sunColor: 0xffa860, sunIntensity: 1.7,
    hemi: [0xffc8a0, 0x3a2a30, 0.7], fog: 0x7a4a52, fogNear: 220, fogFar: 1400, ground: 0x5a4436, rock: 0x6e5a4a,
    runoff: "#7a6450", asphalt: "#3a3640", embankment: 0x6a5244, scenery: "mountain", label: "Quarry cliffs · Sunset", clouds: 0.4, cloudColor: 0xc89080, groundTex: "gravel", runTex: "gravel", embTex: "darkrock",
    wallA: "#ffcc1f", wallB: "#11141b", tree: 0x3a4a2a, sign: "XTREME",
  },
};

// Tracks are laid out as corner points [x, z, radius, height]: straights between them, joined by circular arcs
// of that radius. That gives real straights and smooth, predictable bends. The result is sampled into points
// for the Catmull-Rom centre-line. `tunnel` lists corner indices whose following straight is a tunnel.
export function rounded(verts, { tunnel = [] } = {}) {
  const n = verts.length, segs = [];
  const V = verts.map(([x, z, r, y = 0]) => ({ x, z, r, y }));
  for (let i = 0; i < n; i++) {
    const P = V[(i - 1 + n) % n], C = V[i], N = V[(i + 1) % n];
    let ax = C.x - P.x, az = C.z - P.z, la = Math.hypot(ax, az); ax /= la; az /= la;
    let bx = N.x - C.x, bz = N.z - C.z, lb = Math.hypot(bx, bz); bx /= lb; bz /= lb;
    const turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz); // signed turn angle
    const t = C.r * Math.tan(Math.abs(turn) / 2);
    const A = { x: C.x - ax * t, z: C.z - az * t }, B = { x: C.x + bx * t, z: C.z + bz * t };
    const sgn = Math.sign(turn) || 1, cx = A.x - az * C.r * sgn, cz = A.z + ax * C.r * sgn;
    segs.push({ A, B, cx, cz, r: C.r, turn, y: C.y, a0: Math.atan2(A.z - cz, A.x - cx) });
  }
  for (let i = 0; i < n; i++) {
    const a = segs[i], b = segs[(i + 1) % n];
    if (Math.hypot(b.A.x - a.B.x, b.A.z - a.B.z) > 0 && ((b.A.x - a.B.x) * (a.B.x - a.A.x) + (b.A.z - a.B.z) * (a.B.z - a.A.z)) < -1) console.warn("track corners overlap after corner", i);
  }
  // walk: start at the middle of the straight that leads into corner 0
  const pts = [], marks = [];
  const L = segs[n - 1].B, S0 = segs[0].A;
  const push = (x, z, y) => pts.push([x, z, y]);
  const straight = (P, Q, y0, y1, from = 0) => {
    const len = Math.hypot(Q.x - P.x, Q.z - P.z), k = Math.max(1, Math.round(len / 35));
    for (let j = from; j < k; j++) { const f = j / k; push(P.x + (Q.x - P.x) * f, P.z + (Q.z - P.z) * f, y0 + (y1 - y0) * f); }
  };
  const mid = { x: (L.x + S0.x) / 2, z: (L.z + S0.z) / 2 }, yMid = (segs[n - 1].y + segs[0].y) / 2;
  straight(mid, S0, yMid, segs[0].y);
  for (let i = 0; i < n; i++) {
    const s = segs[i], steps = Math.max(2, Math.ceil(Math.abs(s.turn) * s.r / 14));
    marks.push(pts.length);
    for (let j = 0; j < steps; j++) { const a = s.a0 + s.turn * (j / steps); push(s.cx + Math.cos(a) * s.r, s.cz + Math.sin(a) * s.r, s.y); }
    marks.push(pts.length);
    const nx = segs[(i + 1) % n];
    if (i < n - 1) straight(s.B, nx.A, s.y, nx.y); else straight(s.B, mid, s.y, yMid);
  }
  // tunnel fractions measured along the point list
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = cum[pts.length];
  const tunnels = tunnel.map((ci) => [cum[marks[ci * 2 + 1]] / total, cum[marks[(ci * 2 + 2) % marks.length] || pts.length] / total]);
  return { points: pts, tunnels };
}

function track(def, verts, opts) { const r = rounded(verts, opts); return { ...def, points: r.points, tunnels: r.tunnels }; }

// difficulty: 1 = Easy (wide, long straights, big sweepers), 2 = Medium, 3 = Hard (hairpins, chicanes)
export const DIFFICULTY_NAMES = ["", "Easy", "Medium", "Hard"];

export const TRACKS = [
  track({ id: "oval", ramps: [{ at: 0.5, lat: -6, half: 5, h: 1.1, len: 14 }],  name: "Dusk Oval", theme: "dusk", difficulty: 1, laps: 3, width: 26, runoff: 9, banking: 0.06,
    blurb: "A wide, floodlit oval. Two long straights and two big, easy bends." },
    [[-150, -300, 140], [150, -300, 140], [150, 300, 140], [-150, 300, 140]]),
  track({ id: "gp", ramps: [{ at: 0.07, lat: -7, half: 5, h: 1.2, len: 14 }, { at: 0.48, lat: 7, half: 5, h: 1.4, len: 14 }],  name: "Apex Ring GP", theme: "dusk", difficulty: 1, laps: 2, width: 26, runoff: 9, banking: 0.08,
    blurb: "The home circuit: a huge straight, sweeping bends and a flyover." },
    [[0, -450, 120, 0], [350, -450, 150, 4], [350, -150, 130, 10], [-350, -150, 120, 10], [-350, 350, 130, 3], [-150, 450, 110, 0], [0, 450, 110, 0]]),
  track({ id: "forest", ramps: [{ at: 0.09, lat: 7, half: 5, h: 1.2, len: 14 }],  name: "Greenwood Circuit", theme: "forest", difficulty: 1, laps: 2, width: 26, runoff: 9, banking: 0.1, mult: 1.1,
    blurb: "A flowing woodland lap over rolling hills. Fast, wide and friendly." },
    [[0, -400, 160, 4], [300, -500, 180, 8], [550, -250, 140, 6], [450, 50, 200, 3], [550, 350, 150, 5], [250, 500, 160, 2], [0, 400, 130, 0]]),
  track({ id: "canyon", hazards: [{ type: "oil", at: 0.3, lat: 3, len: 12, w: 4 }, { type: "oil", at: 0.72, lat: -4, len: 10, w: 3.5 }, { type: "split", at: 0.625, lat: 0, len: 120, w: 4 }],  ramps: [{ at: 0.45, lat: -5, half: 5, h: 1.4, len: 14 }],  name: "Red Canyon", theme: "desert", difficulty: 2, laps: 2, width: 22, runoff: 8, banking: 0.1, mult: 1.2,
    blurb: "Long dusty straights between the mesas, a flyover and a few tighter bends." },
    [[0, -500, 70, 0], [300, -500, 90, 4], [450, -250, 80, 10], [-300, -250, 70, 10], [-350, 100, 60, 4], [-100, 150, 70, 0], [-200, 450, 80, 0], [0, 500, 90, 0]]),
  track({ id: "harbour", hazards: [{ type: "wet", at: 0.22, lat: -3, len: 18, w: 6 }, { type: "wet", at: 0.55, lat: 4, len: 16, w: 5 }, { type: "oil", at: 0.8, lat: 2, len: 10, w: 3.5 }],  ramps: [{ at: 0.1, lat: 5, half: 5, h: 1.2, len: 14 }],  name: "Harbour Lights", theme: "coast", difficulty: 2, laps: 2, width: 22, runoff: 8, banking: 0.06, mult: 1.15,
    blurb: "Night streets along the sea front: square city corners and a fast promenade." },
    [[0, -450, 60, 0], [400, -450, 70, 0], [400, -100, 55, 1], [250, -100, 55, 2], [250, 200, 60, 2], [450, 200, 70, 3], [450, 450, 80, 3], [0, 450, 70, 0]]),
  track({ id: "neon", hazards: [{ type: "oil", at: 0.18, lat: -3, len: 10, w: 3.5 }, { type: "oil", at: 0.64, lat: 3, len: 10, w: 3.5 }],  name: "Neon District", theme: "neon", difficulty: 3, laps: 2, width: 20, runoff: 7, banking: 0.08, mult: 1.25,
    blurb: "Glowing blocks, an overpass, a tight hairpin and a quick chicane." },
    [[0, -400, 45, 0], [350, -400, 50, 3], [350, -150, 55, 10], [-300, -150, 50, 10], [-300, 120, 35, 3], [-200, 120, 35, 1], [-200, 0, 35, 0],
      [-100, 0, 40, 0], [-100, 250, 45, 0], [-60, 320, 45, 0], [-100, 390, 45, 0], [-100, 520, 50, 0], [0, 520, 50, 0]]),
  track({ id: "alpine", hazards: [{ type: "wet", at: 0.4, lat: 0, len: 20, w: 7 }, { type: "oil", at: 0.78, lat: -3, len: 10, w: 3.5 }],  name: "Alpine Pass", theme: "mountain", difficulty: 3, laps: 2, width: 20, runoff: 7, banking: 0.12, mult: 1.3,
    blurb: "Switchback hairpins up the mountain, a tunnel at the top, then a long run down." },
    [[0, -350, 60, 2], [300, -450, 70, 10], [520, -420, 35, 16], [260, -280, 35, 22], [540, -160, 45, 28], [560, 200, 80, 32], [300, 420, 70, 24], [0, 420, 60, 10]],
    { tunnel: [4] }),
  track({ id: "xtreme", hazards: [{ type: "oil", at: 0.5, lat: 4, len: 12, w: 4 }, { type: "split", at: 0.3, lat: 0, len: 130, w: 4 }],  name: "Xtreme", theme: "xtreme", difficulty: 2, laps: 2, width: 24, runoff: 8, banking: 0.08, mult: 1.3,
    blurb: "A quarry built for stunts: big ramps, and cliffs where the road drops away and you fly down to the next level.",
    heights: [[0, 0], [0.15, 0], [0.34, 22], [0.4, 22], [0.4, 10], [0.62, 8], [0.74, 18], [0.76, 18], [0.76, 4], [0.85, 0], [1, 0]],
    ramps: [{ at: 0.09, h: 2.2, len: 18 }, { at: 0.255, h: 1.8, len: 16 }, { at: 0.93, lat: 6, half: 5, h: 1.4, len: 14 }] },
    [[0, -500, 90], [420, -500, 100], [420, 20, 90], [180, 140, 80], [420, 300, 90], [420, 600, 90], [0, 600, 90]]),
  track({ id: "coastal", name: "Coastal Highway", theme: "storm", difficulty: 2, laps: 2, width: 22, runoff: 8, banking: 0.08, mult: 1.25, wet: true,
    hazards: [{ type: "wet", at: 0.33, lat: 0, len: 26, w: 10 }, { type: "wet", at: 0.81, lat: -2, len: 22, w: 9 }],
    blurb: "A rain-soaked road between black-sand beaches and towering cliffs. Wet tarmac, puddles, less grip." },
    [[0, -700, 90, 2], [180, -760, 110, 4], [270, -540, 110, 6], [200, -300, 140, 8], [260, -60, 120, 6], [210, 240, 130, 4], [280, 520, 110, 2], [150, 760, 100, 0], [-60, 720, 120, 6], [-120, 450, 140, 12], [-60, 200, 130, 16], [-140, -60, 120, 18], [-80, -330, 140, 14], [-150, -560, 110, 8]]),
  track({ id: "frost", name: "Frostbite Ridge", theme: "winter", difficulty: 2, laps: 2, width: 22, runoff: 8, banking: 0.08, mult: 1.25,
    hazards: [{ type: "ice", at: 0.18, lat: 2, len: 22, w: 8 }, { type: "ice", at: 0.52, lat: -3, len: 18, w: 7 }, { type: "ice", at: 0.83, lat: 0, len: 20, w: 9 }, { type: "split", at: 0.44, lat: 0, len: 120, w: 4 }],
    blurb: "A snowy valley loop under white peaks. Falling snow, and glassy ice patches with almost no grip." },
    [[0, -450, 90, 0], [300, -520, 110, 4], [480, -300, 90, 10], [350, -50, 80, 14], [480, 200, 100, 12], [300, 420, 90, 8], [0, 480, 100, 4], [-250, 350, 90, 6], [-300, 50, 110, 10], [-200, -250, 100, 4]]),
];

// Layouts: every circuit can also be raced Reversed (the other way round) or Mirrored (flipped left-right).
// A layout id is the base id plus ":r" or ":m". Tracks with cliff drops can't be reversed (you'd meet a wall).
export const LAYOUTS = [["", "Normal"], ["r", "Reverse"], ["m", "Mirror"]];
export const baseId = (id) => String(id).split(":")[0];
export const layoutOf = (id) => String(id).split(":")[1] || "";
export const canReverse = (t) => !(t.heights && t.heights.some((h, i) => i && h[0] === t.heights[i - 1][0]));
const variants = new Map();
function variant(base, lay) {
  const key = base.id + ":" + lay;
  if (variants.has(key)) return variants.get(key);
  const v = { ...base, id: key, layout: lay, name: base.name + (lay === "r" ? " Reverse" : " Mirror") };
  if (lay === "m") {
    v.points = base.points.map(([x, z, y]) => [-x, z, y]);
    v.ramps = (base.ramps || []).map((r) => ({ ...r, lat: -(r.lat || 0) }));
  } else {
    v.points = base.points.slice().reverse();
    v.tunnels = (base.tunnels || []).map(([a, b]) => [1 - b, 1 - a]);
    v.heights = base.heights && base.heights.map(([f, h]) => [1 - f, h]).reverse();
    v.reversed = true; // TrackPath puts each ramp back in the same place, facing the new direction
  }
  variants.set(key, v);
  return v;
}
export const trackById = (id) => {
  const base = TRACKS.find((t) => t.id === baseId(id)) || TRACKS[0], lay = layoutOf(id);
  if (!lay || (lay === "r" && !canReverse(base))) return base;
  return variant(base, lay);
};

// Weather: turn any theme rainy. Skies and fog drift toward grey, the light softens, the road gets wet and shiny.
const mixHex = (a, b, t) => { const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255; return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t); };
export function rainy(theme) {
  if (theme.rain) return theme;
  const night = !!theme.stars, grey = night ? 0x1c222c : 0x8a939c;
  return { ...theme, rain: true, wetRoad: true, stars: 0, clouds: 0.95, cloudColor: night ? 0x262c36 : 0x9aa2aa,
    sky: theme.sky.map((c) => mixHex(c, grey, night ? 0.35 : 0.7)), fog: mixHex(theme.fog, grey, 0.7), fogNear: (theme.fogNear || 160) * 0.5, fogFar: (theme.fogFar || 1100) * 0.7,
    sunIntensity: theme.sunIntensity * 0.55, sunColor: mixHex(theme.sunColor, 0xd0d6dc, 0.6), hemi: [mixHex(theme.hemi[0], 0xc0c8d0, 0.5), theme.hemi[1], theme.hemi[2] * 1.05],
    asphaltTint: (theme.asphaltTint || 0.8) * 0.78, label: (theme.label || "").split(" · ")[0] + (night ? " · Night rain" : " · Rain") };
}

// Time of day: turn a daytime theme into night (dark sky with stars, a cool moon, lamps and headlights do the work).
export function nightly(theme) {
  if (theme.stars) return theme;
  return { ...theme, stars: 1, sky: [0x02040c, 0x0a1428, 0x1a2a48], sunDir: [0.4, 0.45, -0.6], sunColor: 0x9fb8ff, sunIntensity: 0.45,
    hemi: [0x4a5f9a, mixHex(theme.hemi[1], 0x05070c, 0.7), 0.5], fog: 0x0a1222, fogNear: (theme.fogNear || 160) * 0.8, fogFar: (theme.fogFar || 1100) * 0.85,
    exposure: 1.15, clouds: (theme.clouds ?? 0.4) * 0.6, cloudColor: 0x1e2636, groundTint: mixHex(theme.groundTint || 0xd8d8d8, 0x404858, 0.4),
    envIntensity: 0.4, bloom: 0.8, label: (theme.label || "").split(" · ")[0] + " · Night" };
}
