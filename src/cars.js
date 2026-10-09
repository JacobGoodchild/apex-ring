// Car line-up. All designs are original. Stats: vmax (m/s), accel (m/s^2), grip (m/s^2 lateral), boost.
export const PAINTS = [
  { name: "Racing Teal", hex: 0x0f8b8d },
  { name: "Ember Orange", hex: 0xe8590c },
  { name: "Volt Yellow", hex: 0xf5c400 },
  { name: "Glacier White", hex: 0xe9edf2 },
  { name: "Carbon Black", hex: 0x16181d },
  { name: "Rosso Fuoco", hex: 0xb3121d },
  { name: "Ultra Violet", hex: 0x5b2bbf },
  { name: "Lime Strike", hex: 0x8fd400 },
  { name: "Gunmetal", hex: 0x4a5160 },
];

// shape: proportions for the procedural body (see carmodel.js). price in coins, or gems for the rarest.
export const CARS = [
  { id: "vanta", name: "Vanta S1", doors: "scissor", price: 0, vmax: 80, accel: 15, grip: 34, boostPower: 12, boostFill: 1, response: 8, steerFalloff: 0.035,
    shape: { wing: "high" }, blurb: "Balanced mid-engine hypercar with scissor doors." },
  { id: "kestrel", name: "Kestrel GT", doors: "butterfly", price: 4500, vmax: 78, accel: 17.5, grip: 33, boostPower: 12, boostFill: 1.1, response: 8.5, steerFalloff: 0.034,
    shape: { wing: "duck", len: 4.5, nose: 0.46, hood: 0.76, deck: 0.95, tail: 0.92, cabinH: 1.22, cabinZ: 0.1 }, blurb: "Short, punchy and quick off the line. Butterfly doors." },
  { id: "nimbus", name: "Nimbus R", doors: "gullwing", price: 8000, vmax: 79, accel: 15.5, grip: 38, boostPower: 11, boostFill: 1.15, response: 9.5, steerFalloff: 0.032,
    shape: { wing: "low", nose: 0.38, hood: 0.66, deck: 0.86, tail: 0.84, cabinH: 1.12, cabinW: 0.68, fin: true }, blurb: "A lightweight track toy with gullwing doors and huge grip." },
  { id: "solace", name: "Solace V12", doors: "dihedral", price: 13000, vmax: 86, accel: 15, grip: 33, boostPower: 13, boostFill: 0.95, response: 7.5, steerFalloff: 0.037,
    shape: { wing: "none", len: 4.9, nose: 0.44, hood: 0.7, deck: 0.9, tail: 0.88, cabinZ: -0.25, cabinLen: 2.2, cabinH: 1.16 }, blurb: "A long-nosed grand tourer built for top speed. Dihedral doors." },
  { id: "razor", name: "Razor LM", doors: "scissor", price: 19000, vmax: 84, accel: 16.5, grip: 39, boostPower: 13, boostFill: 1.05, response: 9, steerFalloff: 0.033,
    shape: { wing: "high", len: 5.0, nose: 0.36, hood: 0.64, deck: 0.88, tail: 0.86, cabinH: 1.1, cabinW: 0.64, fin: true, wid: 1.04 }, blurb: "Longtail endurance racer for the road. Wing, fin, scissor doors." },
  { id: "aurora", name: "Aurora E", doors: "butterfly", price: 26000, gems: 0, vmax: 82, accel: 20, grip: 36, boostPower: 15, boostFill: 1.25, response: 9, steerFalloff: 0.034,
    shape: { wing: "duck", nose: 0.4, hood: 0.7, deck: 0.9, tail: 0.88, cabinH: 1.18, intake: false }, blurb: "Silent electric hyper with savage acceleration and the best boost." },
  { id: "tempest", name: "Tempest X", doors: "gullwing", price: 0, gems: 12, vmax: 90, accel: 18.5, grip: 40, boostPower: 15, boostFill: 1.15, response: 9.5, steerFalloff: 0.032,
    shape: { wing: "high", len: 4.85, nose: 0.34, hood: 0.62, deck: 0.86, tail: 0.84, cabinH: 1.08, cabinW: 0.64, wid: 1.05, fin: true }, blurb: "The fastest thing in Apex Ring. Bought with gems only." },
];

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

// Apply upgrade levels (0-5 each) to a car's base stats.
export function carSpec(def, up = {}) {
  const u = (k) => up[k] || 0;
  return {
    vmax: def.vmax * (1 + 0.025 * u("engine")) * (1 + 0.01 * u("weight")),
    accel: def.accel * (1 + 0.05 * u("engine")) * (1 + 0.04 * u("weight")),
    grip: def.grip * (1 + 0.035 * u("tyres")),
    response: def.response * (1 + 0.05 * u("handling")),
    steerFalloff: def.steerFalloff * (1 - 0.04 * u("handling")),
    boostPower: def.boostPower * (1 + 0.06 * u("boost")),
    boostFill: def.boostFill * (1 + 0.08 * u("boost")),
  };
}
