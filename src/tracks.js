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

function circle(r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([Math.cos(a) * r, -Math.sin(a) * r, 0]); }
  return pts;
}

export const TRACKS = [
  { id: "oval", name: "Dusk Oval", theme: "dusk", laps: 3, width: 16, runoff: 4, banking: 0.05, points: circle(120, 16),
    blurb: "A floodlit oval. Flat out all the way round." },
  { id: "gp", name: "Apex Ring GP", theme: "dusk", laps: 3, width: 15, runoff: 4, banking: 0.1,
    blurb: "The home circuit: a long straight, a flyover, a tight hairpin and a quick chicane.",
    points: [
      [0, 200, 0], [0, 0, 0], [0, -200, 0], [25, -285, 1], [100, -325, 2], [190, -300, 3], [235, -235, 5], [225, -150, 8],
      [160, -100, 10], [60, -95, 11], [-60, -105, 11], [-170, -120, 9], [-255, -70, 6], [-260, 40, 3], [-240, 140, 1],
      [-200, 175, 0], [-160, 145, 0], [-150, 60, 0], [-110, 25, 0], [-70, 60, 0], [-80, 150, 0], [-55, 195, 0], [-75, 250, 0],
      [-55, 320, 0], [-15, 330, 0], [5, 290, 0],
    ] },
  { id: "harbour", name: "Harbour Lights", theme: "coast", laps: 3, width: 14, runoff: 3.5, banking: 0.06, mult: 1.15,
    blurb: "Night streets along the sea front. Tight 90s, a fast promenade and a seafront chicane.",
    points: [
      [0, 0, 0], [0, -220, 0], [10, -300, 0], [80, -310, 0], [160, -300, 0], [175, -230, 0], [170, -160, 2], [230, -120, 4],
      [320, -110, 4], [345, -40, 3], [320, 40, 1], [250, 50, 0], [200, 90, 0], [220, 170, 0], [180, 240, 0], [100, 250, 0],
      [70, 200, 0], [40, 230, 0], [10, 180, 0],
    ] },
  { id: "alpine", name: "Alpine Pass", theme: "mountain", laps: 2, width: 13, runoff: 3, banking: 0.12, mult: 1.3,
    blurb: "Climb through switchback hairpins and a tunnel, then plunge back down the valley.",
    tunnels: [[0.36, 0.45]],
    points: [
      [0, 0, 0], [0, -200, 3], [40, -330, 8], [130, -380, 12], [200, -330, 15], [170, -250, 18], [90, -230, 21], [80, -160, 24],
      [170, -120, 27], [260, -160, 30], [360, -150, 32], [440, -80, 32], [450, 40, 28], [390, 140, 22], [290, 180, 16],
      [200, 140, 11], [130, 200, 7], [60, 210, 3], [0, 140, 0],
    ] },
  { id: "canyon", name: "Red Canyon", theme: "desert", laps: 3, width: 15, runoff: 4, banking: 0.1, mult: 1.2,
    blurb: "Sweeping desert bends between the mesas, with a flyover and a long dusty straight.",
    points: [
      [0, 0, 0], [0, -260, 0], [40, -360, 2], [140, -390, 5], [240, -340, 8], [260, -240, 10], [200, -170, 11], [80, -160, 11],
      [-60, -170, 9], [-160, -120, 6], [-180, -20, 3], [-120, 60, 0], [-40, 120, 0], [-40, 220, 0], [-110, 300, 0], [-60, 380, 0],
      [30, 360, 0], [40, 250, 0], [0, 150, 0],
    ] },
  { id: "neon", name: "Neon District", theme: "neon", laps: 3, width: 14, runoff: 3, banking: 0.08, mult: 1.25,
    blurb: "Glowing city blocks, a figure-of-eight overpass and a brutal last-corner hairpin.",
    points: [
      [0, 0, 0], [0, -180, 0], [30, -250, 1], [110, -260, 3], [180, -200, 6], [180, -110, 9], [110, -80, 10], [0, -70, 10],
      [-120, -60, 9], [-200, 30, 7], [-210, 120, 4], [-150, 190, 1], [-60, 190, 0], [-20, 230, 0], [-60, 290, 0], [-10, 310, 0], [20, 230, 0],
    ] },
  { id: "forest", name: "Greenwood Circuit", theme: "forest", laps: 3, width: 14, runoff: 4, banking: 0.1, mult: 1.1,
    blurb: "A flowing woodland lap: rolling hills, fast esses and a tight hairpin by the lake.",
    points: [
      [0, 0, 0], [0, -180, 2], [-30, -280, 6], [-110, -320, 9], [-200, -280, 8], [-230, -190, 5], [-180, -110, 3], [-230, -30, 4],
      [-300, 30, 7], [-290, 130, 9], [-200, 170, 7], [-120, 120, 4], [-80, 190, 2], [-20, 240, 1], [40, 200, 0], [20, 120, 0],
    ] },
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
