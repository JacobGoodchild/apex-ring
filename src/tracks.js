// Track definitions. Control points are [x, z, height]; the centre-line is a closed Catmull-Rom spline through them.
export const THEMES = {
  dusk: {
    sky: [0x0d1b2a, 0x35507a, 0xf2a65a], sunDir: [-0.8, 0.12, -0.55], sunColor: 0xffc49a, sunIntensity: 1.6,
    hemi: [0x9fb4e0, 0x1a2a1e, 0.6], fog: 0x41506b, fogNear: 160, fogFar: 1100, ground: 0x2a4a33,
    runoff: "#4b6b3f", embankment: 0x3d5a35, scenery: "parkland",
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
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
