// Career mode: a ladder of events that unlock tracks, cars and rewards.
// type: race (finish in `target` place or better), trial (best lap under `target` s), drift (score `target` points),
// elim (last car drops out each lap: survive to the end), h2h (beat one named rival).
// Ordered from the wide, gentle Easy tracks to the Hard ones.
export const EVENTS = [
  { id: "c1", name: "Opening Laps", type: "race", track: "gp", laps: 2, target: 3, reward: { coins: 500 }, desc: "Finish in the top three." },
  { id: "c2", name: "Clock In", type: "trial", track: "oval", laps: 3, target: 24.5, reward: { coins: 400 }, desc: "Set a lap under 24.5 seconds." },
  { id: "c3", name: "Sideways 101", type: "drift", track: "oval", laps: 3, target: 800, reward: { coins: 600 }, desc: "Score 800 drift points." },
  { id: "c4", name: "Greenwood GP", type: "race", track: "forest", laps: 2, target: 3, reward: { coins: 800 }, unlock: { track: "canyon" }, desc: "Finish in the top three." },
  { id: "c5", name: "One on One", type: "h2h", track: "forest", laps: 2, rival: "Mara Voss", reward: { coins: 600, gems: 1 }, desc: "Beat Mara Voss head to head." },
  { id: "c6", name: "Canyon Run", type: "race", track: "canyon", laps: 2, target: 1, reward: { coins: 1200 }, unlock: { track: "harbour" }, desc: "Win the race." },
  { id: "c7", name: "Last Car Out", type: "elim", track: "canyon", laps: 4, reward: { coins: 1000 }, unlock: { car: "kestrel" }, desc: "Last place drops out every lap. Survive. Wins you a Kestrel GT." },
  { id: "c8", name: "Harbour Lights", type: "race", track: "harbour", laps: 2, target: 1, reward: { coins: 1500, gems: 1 }, unlock: { track: "neon" }, desc: "Win the race." },
  { id: "c9", name: "Neon Nights", type: "race", track: "neon", laps: 2, target: 3, reward: { coins: 1500 }, unlock: { track: "alpine" }, desc: "Finish in the top three." },
  { id: "c10", name: "Summit Trial", type: "trial", track: "alpine", laps: 2, target: 55, reward: { coins: 1500, gems: 1 }, desc: "Set a lap under 55 seconds." },
  { id: "c11", name: "Mountain Duel", type: "h2h", track: "alpine", laps: 2, rival: "Dev Okoro", reward: { coins: 2000 }, unlock: { car: "nimbus" }, desc: "Beat Dev Okoro. Wins you a Nimbus R." },
  { id: "c12", name: "Apex Championship", type: "race", track: "gp", laps: 3, target: 1, reward: { coins: 5000, gems: 3 }, desc: "Win the final. Become the Apex champion." },
];

export const BASE_TRACKS = ["oval", "gp", "forest"]; // the Easy tracks are open from the start

export function eventUnlocked(save, i) { return i === 0 || !!(save.career[EVENTS[i - 1].id] && save.career[EVENTS[i - 1].id].done); }

export function trackUnlocked(save, id) {
  return BASE_TRACKS.includes(id) || EVENTS.some((e) => e.unlock && e.unlock.track === id && save.career[e.id] && save.career[e.id].done);
}

// result: { place, bestLap, drift, eliminated, beatRival }
export function judge(ev, r) {
  let ok = false, stars = 0;
  if (ev.type === "race") { ok = r.place <= ev.target; stars = ok ? (r.place === 1 ? 3 : r.place <= 2 ? 2 : 1) : 0; }
  else if (ev.type === "trial") { ok = r.bestLap <= ev.target; stars = ok ? (r.bestLap <= ev.target * 0.96 ? 3 : r.bestLap <= ev.target * 0.98 ? 2 : 1) : 0; }
  else if (ev.type === "drift") { ok = r.drift >= ev.target; stars = ok ? (r.drift >= ev.target * 1.6 ? 3 : r.drift >= ev.target * 1.25 ? 2 : 1) : 0; }
  else if (ev.type === "elim") { ok = !r.eliminated; stars = ok ? (r.place === 1 ? 3 : r.place === 2 ? 2 : 1) : 0; }
  else if (ev.type === "h2h") { ok = r.beatRival; stars = ok ? (r.margin > 3 ? 3 : r.margin > 1 ? 2 : 1) : 0; }
  return { ok, stars };
}
