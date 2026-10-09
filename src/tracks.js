// Track definitions. Control points are [x, z, height]; the centre-line is a closed Catmull-Rom spline through them.
export const THEMES = {
  dusk: {
    sky: [0x0d1b2a, 0x35507a, 0xf2a65a], sunDir: [-0.8, 0.12, -0.55], sunColor: 0xffc49a, sunIntensity: 1.6,
    hemi: [0x9fb4e0, 0x1a2a1e, 0.6], fog: 0x41506b, fogNear: 160, fogFar: 1100, ground: 0x2a4a33,
    runoff: "#4b6b3f", embankment: 0x3d5a35, scenery: "parkland", label: "Parkland · Dusk",
  },
  coast: {
    sky: [0x02040c, 0x0b1630, 0x1d2f55], sunDir: [0.5, 0.35, -0.7], sunColor: 0x9fb8ff, sunIntensity: 0.55, stars: 1,
    hemi: [0x4a5f9a, 0x0b0f18, 0.55], fog: 0x0b1428, fogNear: 120, fogFar: 900, ground: 0x1a1f28, exposure: 1.15,
    runoff: "#2d323c", asphalt: "#30343c", embankment: 0x2a2f38, scenery: "city", label: "Coastal city · Night",
    wallA: "#cfd6e4", wallB: "#c2332b", lampColor: 0xffd59a, sea: true, envIntensity: 0.4, bloom: 0.8, sign: "HARBOUR LIGHTS",
  },
  mountain: {
    sky: [0x2c6fc2, 0x7fb2e8, 0xdfeaf5], sunDir: [0.6, 0.55, 0.4], sunColor: 0xfff3e0, sunIntensity: 2.0,
    hemi: [0xbfd8ff, 0x50604a, 0.8], fog: 0xb9cde3, fogNear: 220, fogFar: 1500, ground: 0x56704a,
    runoff: "#7d7a70", embankment: 0x6b6a5c, scenery: "mountain", label: "Mountain pass · Day", tree: 0x24452f, sign: "ALPINE PASS",
  },
  desert: {
    sky: [0x3d6fb0, 0xd99a62, 0xffcf8a], sunDir: [-0.4, 0.3, 0.8], sunColor: 0xffc58a, sunIntensity: 2.0,
    hemi: [0xffd2a8, 0x8a4a2a, 0.7], fog: 0xe0a878, fogNear: 200, fogFar: 1300, ground: 0xc07a48,
    runoff: "#c98f5d", asphalt: "#4a4440", embankment: 0xa8643a, scenery: "desert", label: "Desert canyon · Sunset", sign: "RED CANYON",
  },
  neon: {
    sky: [0x05010f, 0x1c0838, 0x5a1a6e], sunDir: [0, 0.2, -1], sunColor: 0xff4fd8, sunIntensity: 0.4, stars: 0.5,
    hemi: [0x7a4dff, 0x10051c, 0.6], fog: 0x1a0830, fogNear: 100, fogFar: 750, ground: 0x0d0b14, exposure: 1.2,
    runoff: "#1b1726", asphalt: "#24222c", lines: "#7df9ff", embankment: 0x1a1426, scenery: "neon", label: "Neon city · Night",
    wallA: "#14121c", wallB: "#ff2bd6", wallGlow: 0x7a1066, lampColor: 0x7df9ff, envIntensity: 0.5, bloom: 1.0, sign: "NEON DISTRICT",
  },
  forest: {
    sky: [0x4a86c8, 0x9cc4e6, 0xe8f0e0], sunDir: [-0.5, 0.6, -0.3], sunColor: 0xfff0d0, sunIntensity: 1.8,
    hemi: [0xcfe3ff, 0x2a4020, 0.8], fog: 0xa9c4b8, fogNear: 150, fogFar: 1100, ground: 0x3f6a30,
    runoff: "#557a3c", embankment: 0x406a2c, scenery: "forest", label: "Forest circuit · Morning", tree: 0x1d4a26, sign: "GREENWOOD",
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
  track({ id: "oval", name: "Dusk Oval", theme: "dusk", difficulty: 1, laps: 3, width: 26, runoff: 9, banking: 0.06,
    blurb: "A wide, floodlit oval. Two long straights and two big, easy bends." },
    [[-150, -300, 140], [150, -300, 140], [150, 300, 140], [-150, 300, 140]]),
  track({ id: "gp", name: "Apex Ring GP", theme: "dusk", difficulty: 1, laps: 2, width: 26, runoff: 9, banking: 0.08,
    blurb: "The home circuit: a huge straight, sweeping bends and a flyover." },
    [[0, -450, 120, 0], [350, -450, 150, 4], [350, -150, 130, 10], [-350, -150, 120, 10], [-350, 350, 130, 3], [-150, 450, 110, 0], [0, 450, 110, 0]]),
  track({ id: "forest", name: "Greenwood Circuit", theme: "forest", difficulty: 1, laps: 2, width: 26, runoff: 9, banking: 0.1, mult: 1.1,
    blurb: "A flowing woodland lap over rolling hills. Fast, wide and friendly." },
    [[0, -400, 160, 4], [300, -500, 180, 8], [550, -250, 140, 6], [450, 50, 200, 3], [550, 350, 150, 5], [250, 500, 160, 2], [0, 400, 130, 0]]),
  track({ id: "canyon", name: "Red Canyon", theme: "desert", difficulty: 2, laps: 2, width: 22, runoff: 8, banking: 0.1, mult: 1.2,
    blurb: "Long dusty straights between the mesas, a flyover and a few tighter bends." },
    [[0, -500, 70, 0], [300, -500, 90, 4], [450, -250, 80, 10], [-300, -250, 70, 10], [-350, 100, 60, 4], [-100, 150, 70, 0], [-200, 450, 80, 0], [0, 500, 90, 0]]),
  track({ id: "harbour", name: "Harbour Lights", theme: "coast", difficulty: 2, laps: 2, width: 22, runoff: 8, banking: 0.06, mult: 1.15,
    blurb: "Night streets along the sea front: square city corners and a fast promenade." },
    [[0, -450, 60, 0], [400, -450, 70, 0], [400, -100, 55, 1], [250, -100, 55, 2], [250, 200, 60, 2], [450, 200, 70, 3], [450, 450, 80, 3], [0, 450, 70, 0]]),
  track({ id: "neon", name: "Neon District", theme: "neon", difficulty: 3, laps: 2, width: 20, runoff: 7, banking: 0.08, mult: 1.25,
    blurb: "Glowing blocks, an overpass, a tight hairpin and a quick chicane." },
    [[0, -400, 45, 0], [350, -400, 50, 3], [350, -150, 55, 10], [-300, -150, 50, 10], [-300, 120, 35, 3], [-200, 120, 35, 1], [-200, 0, 35, 0],
      [-100, 0, 40, 0], [-100, 250, 45, 0], [-60, 320, 45, 0], [-100, 390, 45, 0], [-100, 520, 50, 0], [0, 520, 50, 0]]),
  track({ id: "alpine", name: "Alpine Pass", theme: "mountain", difficulty: 3, laps: 2, width: 20, runoff: 7, banking: 0.12, mult: 1.3,
    blurb: "Switchback hairpins up the mountain, a tunnel at the top, then a long run down." },
    [[0, -350, 60, 2], [300, -450, 70, 10], [520, -420, 35, 16], [260, -280, 35, 22], [540, -160, 45, 28], [560, 200, 80, 32], [300, 420, 70, 24], [0, 420, 60, 10]],
    { tunnel: [4] }),
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
