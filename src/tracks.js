// Track definitions. Control points are [x, z, height]; the centre-line is a closed Catmull-Rom spline through them.
export const THEMES = {
  dusk: {
    sky: [0x0d1b2a, 0x35507a, 0xf2a65a], sunDir: [-0.8, 0.12, -0.55], sunColor: 0xffc49a, sunIntensity: 1.6,
    hemi: [0x9fb4e0, 0x1a2a1e, 0.6], fog: 0x41506b, fogNear: 160, fogFar: 1100, ground: 0x2a4a33,
    runoff: "#4b6b3f", embankment: 0x3d5a35, scenery: "parkland", label: "Parkland · Dusk",
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
];

export const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
