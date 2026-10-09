// Trophies: one-off achievements that pay a few coins. Checked from main.js when things happen.
export const TROPHIES = [
  { id: "win", name: "First win", desc: "Win a race." },
  { id: "podium10", name: "Regular", desc: "Finish on the podium 10 times." },
  { id: "drift1k", name: "Drift king", desc: "Bank a single drift worth 1,000 points." },
  { id: "combo5", name: "Chain gang", desc: "Reach a x5 drift combo." },
  { id: "air2", name: "Frequent flyer", desc: "Stay in the air for 2 seconds." },
  { id: "sling", name: "Slingshot", desc: "Fill the slipstream meter and slingshot past." },
  { id: "boss", name: "Boss slayer", desc: "Beat a career boss." },
  { id: "bosses", name: "Legend", desc: "Beat all three bosses." },
  { id: "rainwin", name: "Rain master", desc: "Win a race in the rain." },
  { id: "mirror", name: "Through the looking glass", desc: "Finish a race on a mirrored layout." },
  { id: "clean", name: "Clean sweep", desc: "Finish a race without touching a wall." },
  { id: "garage", name: "Full house", desc: "Own every car." },
  { id: "daily3", name: "Daily driver", desc: "Complete 3 daily challenges." },
  { id: "champ", name: "Apex champion", desc: "Win the career final." },
  { id: "cup", name: "Silverware", desc: "Win a cup." },
];
export const TROPHY_COINS = 300;

// Awards a trophy once; returns it if it's new (so the caller can show a toast and pay out), else null.
export function award(save, id) {
  save.trophies = save.trophies || {};
  if (save.trophies[id]) return null;
  const t = TROPHIES.find((x) => x.id === id); if (!t) return null;
  save.trophies[id] = Date.now(); save.coins += TROPHY_COINS;
  return t;
}
