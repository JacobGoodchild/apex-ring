// Car line-up. All designs are original. Stats: vmax (m/s), accel (m/s^2), grip (m/s^2 lateral), boost.
export const PAINTS = [
  { name: "Racing Teal", hex: 0x0f8b8d },
  { name: "Ember Orange", hex: 0xe8590c },
  { name: "Volt Yellow", hex: 0xf5c400 },
  { name: "Glacier White", hex: 0xe9edf2 },
  { name: "Carbon Black", hex: 0x16181d },
];

export const CARS = [
  { id: "vanta", name: "Vanta S1", doors: "scissor", price: 0, vmax: 80, accel: 15, grip: 24, boostPower: 12, boostFill: 1, response: 8, steerFalloff: 0.035,
    blurb: "Balanced mid-engine hypercar with scissor doors." },
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
