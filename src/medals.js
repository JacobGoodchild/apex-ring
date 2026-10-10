// Time-trial medals. TIDY is the flying lap of a tidy autopilot in the stock Vanta S1 with no boost, per layout
// (scripts/dev/medals.mjs prints it; a test checks it still matches the tracks). Mirror layouts use the normal time.
import { baseId, layoutOf } from "./tracks.js";

export const TIDY = {"oval":22.3,"oval:r":22.3,"gp":44.8,"gp:r":44.2,"forest":36.7,"forest:r":36.8,"canyon":56.3,"canyon:r":56,"harbour":48.8,"harbour:r":49.3,"neon":62.8,"neon:r":61.2,"alpine":50.6,"alpine:r":50.4,"xtreme":51.1,"coastal":54,"coastal:r":54.5,"frost":44,"frost:r":44};
// [name, factor on the tidy lap, coins the first time you reach it]
export const MEDALS = [["gold", 1.0, 600], ["silver", 1.08, 300], ["bronze", 1.18, 150]];
export const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3 };

export function medalTimes(id) {
  const t = TIDY[layoutOf(id) === "r" ? id : baseId(id)] || TIDY[baseId(id)];
  return t ? MEDALS.map(([n, f, c]) => ({ name: n, t: Math.round(t * f * 10) / 10, coins: c })) : [];
}
// The best medal a lap earns: "gold" / "silver" / "bronze" or null
export function medalFor(id, lap) {
  const m = medalTimes(id).find((x) => lap != null && lap <= x.t);
  return m ? m.name : null;
}
