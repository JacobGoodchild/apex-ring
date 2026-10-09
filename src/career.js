import { TRACKS, canReverse } from "./tracks.js";
// Career mode: a ladder of events that unlock tracks, cars and rewards.
// type: race (finish in `target` place or better), trial (best lap under `target` s), drift (score `target` points),
// elim (last car drops out each lap, or every `every` seconds: survive to the end), h2h (beat one named rival),
// attack (drift score before the clock runs out), boss (1v1 against a legend in a special car; winning unlocks it).
// Ordered from the wide, gentle Easy tracks to the Hard ones.
export const EVENTS = [
  { id: "c1", name: "Opening Laps", type: "race", track: "gp", laps: 2, target: 3, reward: { coins: 500 }, desc: "Finish in the top three." },
  { id: "c2", name: "Clock In", type: "trial", track: "oval", laps: 3, target: 24.5, reward: { coins: 400 }, desc: "Set a lap under 24.5 seconds." },
  { id: "c3", name: "Sideways 101", type: "drift", track: "oval", laps: 3, target: 800, reward: { coins: 600 }, desc: "Score 800 drift points." },
  { id: "a1", name: "Drift Attack", type: "attack", track: "oval", laps: 99, time: 60, target: 1200, reward: { coins: 700 }, desc: "60 seconds. Chain drifts for the multiplier and score 1,200 points." },
  { id: "c4", name: "Greenwood GP", type: "race", track: "forest", laps: 2, target: 3, reward: { coins: 800 }, unlock: { track: "canyon" }, desc: "Finish in the top three." },
  { id: "c5", name: "One on One", type: "h2h", track: "forest", laps: 2, rival: "Mara Voss", reward: { coins: 600, gems: 1 }, desc: "Beat Mara Voss head to head." },
  { id: "c6", name: "Canyon Run", type: "race", track: "canyon", laps: 2, target: 1, reward: { coins: 1200 }, unlock: { track: "harbour" }, desc: "Win the race." },
  { id: "c7", name: "Last Car Out", type: "elim", track: "canyon", laps: 4, reward: { coins: 1000 }, unlock: { car: "kestrel" }, desc: "Last place drops out every lap. Survive. Wins you a Kestrel GT." },
  { id: "b1", name: "Boss: The Wall", type: "boss", track: "canyon", laps: 2, rival: "Dev Okoro", car: "brute", reward: { coins: 1500, gems: 1 }, unlock: { car: "brute" }, desc: "Dev 'The Wall' Okoro blocks every move in his Ironhide 427. Beat him and it's yours." },
  { id: "c8", name: "Harbour Lights", type: "race", track: "harbour", laps: 2, target: 1, reward: { coins: 1500, gems: 1 }, unlock: { track: "neon", track2: "xtreme" }, desc: "Win the race." },
  { id: "k1", name: "Knockout", type: "elim", every: 15, track: "harbour", laps: 3, reward: { coins: 1600 }, desc: "Every 15 seconds the car in last place is knocked out. Be the last one standing." },
  { id: "c13", name: "Xtreme Jump", type: "race", track: "xtreme", laps: 2, target: 3, reward: { coins: 2000, gems: 1 }, unlock: { track: "coastal" }, desc: "Fly off the cliffs and finish in the top three." },
  { id: "c14", name: "Storm Run", type: "race", track: "coastal", laps: 2, target: 3, reward: { coins: 2200, gems: 1 }, desc: "Rain, puddles and cliffs: finish in the top three on the wet." },
  { id: "b2", name: "Boss: The Surgeon", type: "boss", track: "coastal", laps: 2, rival: "Kenji Arata", car: "razor", reward: { coins: 2500, gems: 1 }, unlock: { car: "razor" }, desc: "Kenji 'The Surgeon' Arata clips every apex in a Razor LM. Beat him on the wet to win it." },
  { id: "c9", name: "Neon Nights", type: "race", track: "neon", laps: 2, target: 3, reward: { coins: 1500 }, unlock: { track: "alpine" }, desc: "Finish in the top three." },
  { id: "a2", name: "Neon Drift Attack", type: "attack", track: "neon", laps: 99, time: 75, target: 2500, reward: { coins: 2000, gems: 1 }, desc: "75 seconds in the neon streets. Score 2,500 drift points." },
  { id: "c10", name: "Summit Trial", type: "trial", track: "alpine", laps: 2, target: 55, reward: { coins: 1500, gems: 1 }, desc: "Set a lap under 55 seconds." },
  { id: "c11", name: "Mountain Duel", type: "h2h", track: "alpine", laps: 2, rival: "Dev Okoro", reward: { coins: 2000 }, unlock: { car: "nimbus" }, desc: "Beat Dev Okoro. Wins you a Nimbus R." },
  { id: "b3", name: "Boss: Viper", type: "boss", track: "alpine", laps: 2, rival: "Mara Voss", car: "tempest", reward: { coins: 4000, gems: 2 }, unlock: { car: "tempest" }, desc: "Mara 'Viper' Voss in the Tempest X, the fastest car there is. Win and it's yours." },
  { id: "c12", name: "Apex Championship", type: "race", track: "gp", laps: 3, target: 1, reward: { coins: 5000, gems: 3 }, desc: "Win the final. Become the Apex champion." },
];

export const BASE_TRACKS = ["oval", "gp", "forest"]; // the Easy tracks are open from the start

// open when the one before is done (or this one was already done, so new events added later never lock old progress)
const done = (save, ev) => !!(save.career[ev.id] && save.career[ev.id].done);
export function eventUnlocked(save, i) { return i === 0 || done(save, EVENTS[i - 1]) || done(save, EVENTS[i]); }

export function trackUnlocked(save, id) {
  return BASE_TRACKS.includes(id) || EVENTS.some((e) => e.unlock && (e.unlock.track === id || e.unlock.track2 === id) && save.career[e.id] && save.career[e.id].done);
}

// result: { place, bestLap, drift, eliminated, beatRival }
export function judge(ev, r) {
  let ok = false, stars = 0;
  if (ev.type === "race") { ok = r.place <= ev.target; stars = ok ? (r.place === 1 ? 3 : r.place <= 2 ? 2 : 1) : 0; }
  else if (ev.type === "trial") { ok = r.bestLap <= ev.target; stars = ok ? (r.bestLap <= ev.target * 0.96 ? 3 : r.bestLap <= ev.target * 0.98 ? 2 : 1) : 0; }
  else if (ev.type === "drift" || ev.type === "attack") { ok = r.drift >= ev.target; stars = ok ? (r.drift >= ev.target * 1.6 ? 3 : r.drift >= ev.target * 1.25 ? 2 : 1) : 0; }
  else if (ev.type === "elim") { ok = !r.eliminated; stars = ok ? (r.place === 1 ? 3 : r.place === 2 ? 2 : 1) : 0; }
  else if (ev.type === "h2h" || ev.type === "boss") { ok = r.beatRival; stars = ok ? (r.margin > 3 ? 3 : r.margin > 1 ? 2 : 1) : 0; }
  return { ok, stars };
}

// Daily challenge: a fresh event every day, built from the date (same for everyone, no server needed).
// Reward once per day. Types rotate between a race, a drift attack and a knockout; layout and weather vary.
export function dailyEvent(date = new Date()) {
  const key = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  let h = Math.imul(key, 2654435761) >>> 0; const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  rnd(); rnd();
  const t = TRACKS[Math.floor(rnd() * TRACKS.length)];
  const lays = ["", "m", ...(canReverse(t) ? ["r"] : [])], lay = lays[Math.floor(rnd() * lays.length)];
  const type = ["race", "attack", "elim"][Math.floor(rnd() * 3)];
  const weather = t.theme === "storm" || rnd() < 0.3 ? "rain" : "dry";
  const base = { id: "daily-" + key, daily: true, name: "Daily Challenge", track: t.id + (lay ? ":" + lay : ""), weather, reward: { coins: 900, gems: 1 } };
  const where = `${t.name}${lay === "r" ? " Reverse" : lay === "m" ? " Mirror" : ""}${weather === "rain" ? " in the rain" : ""}`;
  if (type === "race") return { ...base, type, laps: 2, target: 3, desc: `Podium finish on ${where}.` };
  if (type === "attack") { const target = 900 + t.difficulty * 500; return { ...base, type, laps: 99, time: 60, target, desc: `60-second drift attack on ${where}: score ${target.toLocaleString("en-GB")}.` }; }
  return { ...base, type: "elim", every: 15, laps: 3, desc: `Knockout on ${where}: last car out every 15 seconds.` };
}
