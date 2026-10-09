// Coins, gems, upgrade prices and race rewards. No real money anywhere.
export const UPGRADES = [
  { key: "engine", name: "Engine", desc: "Top speed and acceleration" },
  { key: "tyres", name: "Tyres", desc: "More grip in corners and slides" },
  { key: "handling", name: "ECU", desc: "Sharper response, better drift grip" },
  { key: "boost", name: "Turbo", desc: "Stronger, longer boost that fills faster" },
  { key: "weight", name: "Weight reduction", desc: "Lighter: quicker off the line" },
];
export const MAX_LEVEL = 5;

// Price of the next level (level = current level, 0..4)
export const upgradeCost = (level, carPrice = 0) => Math.round((250 + carPrice * 0.04) * Math.pow(level + 1, 1.45) / 50) * 50;

export const RIM_COST = 300;

const PLACE_COINS = [600, 450, 350, 260, 190, 140, 110, 90];

// Rewards for a finished race. stats: { place, field, drift, cleanLaps, record, trial, mult }
export function raceRewards(s) {
  const lines = [];
  const mult = s.mult || 1;
  if (s.trial) lines.push(["Time trial", Math.round(180 * mult)]);
  else lines.push([`${s.place}${s.place === 1 ? "st" : s.place === 2 ? "nd" : s.place === 3 ? "rd" : "th"} place`, Math.round((PLACE_COINS[s.place - 1] ?? 60) * mult * (s.field / 8 * 0.5 + 0.5))]);
  if (s.drift > 0) lines.push(["Drift points", Math.round(s.drift / 8)]);
  if (s.cleanLaps > 0) lines.push([`Clean laps ×${s.cleanLaps}`, s.cleanLaps * 60]);
  if (s.record) lines.push(["Track record", 150]);
  const coins = lines.reduce((a, l) => a + l[1], 0);
  const gems = (!s.trial && s.place === 1 ? 1 : 0) + (s.record ? 1 : 0);
  return { lines, coins, gems };
}
