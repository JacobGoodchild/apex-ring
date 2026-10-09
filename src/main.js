// Apex Ring entry point: builds the world, runs the fixed-step game loop and drives the menus.
import * as THREE from "three";
import { TEST, TIME_SCALE, AUTOPILOT, SEED } from "./env.js";
import { loadSave, writeSave, resetSave, save, carSave } from "./save.js";
import { World, autoQuality } from "./scene.js";
import { TrackPath } from "./track.js";
import { buildTrackMeshes } from "./trackmesh.js";
import { buildScenery } from "./scenery.js";
import { TRACKS, THEMES, trackById } from "./tracks.js";
import { CARS, PAINTS, carById, carSpec } from "./cars.js";
import { makeCar, setDoors, setRims, RIMS } from "./carmodel.js";
import { Showroom } from "./showroom.js";
import { EVENTS, eventUnlocked, trackUnlocked, judge } from "./career.js";
import { UPGRADES, MAX_LEVEL, upgradeCost, RIM_COST, raceRewards } from "./economy.js";
import { Vehicle } from "./vehicle.js";
import { input, bindPad, readControls, setTilt } from "./input.js";
import * as sfx from "./audio.js";
import { ChaseCam } from "./camera.js";
import { Driver, RIVALS, collide } from "./ai.js";
import { makeRng } from "./rng.js";
import { Skids, Smoke, SpeedLines, addFlames, updateFlames } from "./effects.js";
import { Minimap, drawTrack } from "./minimap.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const errors = [];

loadSave();
const world = new World($("stage"), save.settings.quality || autoQuality());
const { scene, camera } = world;
const chase = new ChaseCam(camera);
scene.add(camera);
const showroom = new Showroom(world);
showroom.bindDrag($("menu")); showroom.bindDrag($("garage"));
const skids = new Skids(scene), smoke = new Smoke(scene), speedLines = new SpeedLines(camera);
chase.mode = save.settings.camera === "bonnet" ? "bonnet" : "chase";

const QS = new URLSearchParams(location.search);
const G = {
  mode: "menu", track: null, path: null, player: null, car: null, lapsOverride: TEST && QS.get("laps") ? Number(QS.get("laps")) : 0,
  countT: 0, raceTime: 0, lapStart: 0, lapTimes: [], menuT: 0, doors: 1, paused: false, rivals: [], field: [], finishOrder: [],
  nRivals: QS.get("rivals") != null ? Number(QS.get("rivals")) : 7, gridSlot: 5,
};

// ---------- track ----------
function loadTrack(id) {
  const def = trackById(id);
  const theme = THEMES[def.theme];
  G.track = def; G.path = new TrackPath(def);
  const grp = buildTrackMeshes(G.path, theme);
  grp.add(buildScenery(G.path, theme, world.qname === "low" ? 0.45 : world.qname === "medium" ? 0.75 : 1, SEED ^ 0x1234));
  world.setTrack(grp); world.setTheme(theme);
  if (G.player) { G.player.track = G.path; gridUp(); }
  save.track = def.id;
  $("trackName").textContent = def.name; $("trackBlurb").textContent = def.blurb + " " + def.laps + " laps.";
  $("trackTheme").textContent = theme.label || "Track";
  drawTrack(previewCtx, G.path, 96, { width: 4 });
  refreshLock();
}
function refreshLock() {
  if (!G.track) return;
  const open = TEST || trackUnlocked(save, G.track.id);
  $("startBtn").disabled = !open;
  $("trackPick").classList.toggle("locked", !open);
  if (!open) $("startBtn").textContent = "Unlock it in Career";
  else $("startBtn").textContent = G.trial ? "Start time trial" : "Start race";
}
const previewCtx = $("trackPreview").getContext("2d");
const minimap = new Minimap($("minimap"));
function pickTrack(dir) {
  sfx.click();
  const i = (TRACKS.findIndex((t) => t.id === G.track.id) + dir + TRACKS.length) % TRACKS.length;
  loadTrack(TRACKS[i].id); writeSave();
}
$("trackPrev").addEventListener("click", () => pickTrack(-1));
$("trackNext").addEventListener("click", () => pickTrack(1));

// ---------- player car ----------
function buildPlayer(id = save.car) {
  const def = carById(id), cs = carSave(def.id);
  if (G.car) G.car.group.removeFromParent();
  G.car = makeCar(def, PAINTS[cs.paint % PAINTS.length].hex, cs.rims);
  addFlames(G.car);
  if (G.mode === "menu") showroom.setCar(G.car); else scene.add(G.car.group);
  if (!G.player) { G.player = new Vehicle(carSpec(def, cs.upgrades), G.path); G.player.reset(-8, 0); }
  G.player.spec = carSpec(def, cs.upgrades);
}

// Grid slots: two columns, staggered. The player starts near the back so there's a field to race through.
function slot(k) { const row = Math.floor(k / 2), col = k % 2; return [-7 - row * 9 - col * 4.5, col ? -3.3 : 3.3]; }

function buildRivals() {
  for (const r of G.rivals) scene.remove(r.model.group);
  G.rivals = [];
  const rnd = makeRng(SEED ^ 0x77);
  for (let k = 0; k < G.nRivals; k++) {
    const prof = RIVALS[k % RIVALS.length], def = CARS[(k + 1) % CARS.length];
    const veh = new Vehicle(carSpec(def, {}), G.path);
    const model = makeCar(def, prof.color);
    addFlames(model);
    setDoors(model, 0);
    scene.add(model.group);
    G.rivals.push({ carId: def.id, veh, model, driver: new Driver(veh, prof, 0.95 + rnd() * 0.05, (SEED + k * 977) >>> 0), name: prof.name, color: prof.color });
  }
}

function gridUp() {
  G.player.spec = carSpec(carById(save.car), carSave(save.car).upgrades);
  G.player.track = G.path; G.player.boost = 0.25;
  const ps = slot(Math.min(G.gridSlot, G.rivals.length)); G.player.reset(ps[0], ps[1]);
  let k = 0;
  const ps2 = G.player.spec;
  for (const r of G.rivals) r.out = false;
  for (const r of G.field) {
    // rivals drive their own cars, but tuned halfway toward yours so races stay close
    const base = carSpec(carById(r.carId), {});
    r.veh.spec = Object.fromEntries(Object.keys(base).map((key) => [key, base[key] * 0.45 + ps2[key] * 0.55]));
    if (k === Math.min(G.gridSlot, G.rivals.length)) k++;
    const [d, lat] = slot(G.field.length === 1 ? 0 : k++); r.veh.track = G.path; r.veh.boost = 0.25; r.veh.reset(d, lat); r.finished = null;
  }
  G.raceTime = 0; G.lapStart = 0; G.lapTimes = []; G.finishOrder = []; G.playerFinish = null;
  skids.clear(); G.driftPts = 0; G.driftShow = 0; G.totalDrift = 0; G.cleanLaps = 0; G.lapWall = 0; G.newRecord = false;
}

// Everyone in the race, ordered by position.
function standings() {
  const L = G.path.length, n = laps();
  const all = [{ veh: G.player, name: "You", me: true, finished: G.playerFinish, color: 0xf2a65a }, ...G.field];
  return all.sort((a, b) => {
    if (a.finished != null && b.finished != null) return a.finished - b.finished;
    if (a.finished != null) return -1; if (b.finished != null) return 1;
    return Math.min(b.veh.totalD, n * L) - Math.min(a.veh.totalD, n * L);
  });
}
const ordinal = (n) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

const laps = () => G.lapsOverride || (G.event ? G.event.laps : G.track.laps);

// ---------- UI ----------
function toast(msg, ms = 3200) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
const fmt = (t) => { if (t == null || !isFinite(t)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
function setRaceUI(on) { ["hud", "speedo", "pads", "topbtns", "minimap"].forEach((id) => ($(id).hidden = !on)); if (!on) { $("drift").hidden = true; $("driftPop").hidden = true; $("eventTag").hidden = true; } }

const SCREENS = ["menu", "setup", "garage", "settings", "career"];
function show(id) {
  sfx.click();
  SCREENS.forEach((s) => ($(s).hidden = s !== id));
  $("topbar").hidden = !SCREENS.includes(id);
  G.screen = id;
  if (id === "garage") { G.garageCar = save.car; refreshGarage(); }
  if (id === "menu") { if (G.garageCar && G.garageCar !== save.car) buildPlayer(); refreshLobby(); }
  if (id === "settings") refreshSettings();
  if (id === "career") buildCareer();
  if (id === "setup") { G.event = null; if (G.track.id !== (save.track || G.track.id)) loadTrack(save.track); refreshLock(); }
}
function refreshLobby() {
  $("lobbyCar").textContent = carById(save.car).name;
  $("coinsV").textContent = save.coins.toLocaleString("en-GB"); $("gemsV").textContent = save.gems;
}

// ---------- garage ----------
const STAT_KEYS = [["Top speed", (s) => s.vmax / 95], ["Acceleration", (s) => s.accel / 20], ["Handling", (s) => (s.grip / 42) * 0.6 + (s.response / 11) * 0.4], ["Boost", (s) => (s.boostPower / 16) * 0.6 + s.boostFill * 0.3]];
function statsHTML(def, up) {
  const base = carSpec(def, {}), cur = carSpec(def, up || {});
  return STAT_KEYS.map(([n, f]) => `<span>${n}</span><span class="sbar"><b style="width:${Math.min(100, f(cur) * 100)}%"></b><i style="width:${Math.min(100, f(base) * 100)}%"></i></span>`).join("");
}
function refreshGarage() {
  const def = carById(G.garageCar), cs = carSave(def.id), owned = save.owned.includes(def.id);
  if (!G.car || G.car.def !== def.id) { buildPlayer(def.id); G.car.def = def.id; }
  $("carName").textContent = def.name;
  $("carBlurb").textContent = def.blurb;
  $("stats").innerHTML = statsHTML(def, cs.upgrades);
  const act = $("carAction");
  if (!owned) {
    const gems = def.gems || 0, cost = gems ? gems + " gems" : def.price.toLocaleString("en-GB") + " coins";
    act.textContent = "Buy · " + cost; act.disabled = gems ? save.gems < gems : save.coins < def.price;
  } else if (save.car === def.id) { act.textContent = "Selected"; act.disabled = true; }
  else { act.textContent = "Select this car"; act.disabled = false; }
  $("tabUp").disabled = !owned;
  buildPaints(); buildRims(); buildUpgrades();
  refreshLobby();
}
function buildUpgrades() {
  const def = carById(G.garageCar), cs = carSave(def.id), owned = save.owned.includes(def.id), el = $("upgrades");
  el.innerHTML = "";
  for (const u of UPGRADES) {
    const lv = cs.upgrades[u.key] || 0, cost = upgradeCost(lv, def.price);
    const row = document.createElement("div"); row.className = "uprow";
    row.innerHTML = `<div class="upn"><b>${u.name}</b><span>${u.desc}</span></div><div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</div>`;
    const b = document.createElement("button"); b.type = "button"; b.className = "chipbtn buy"; b.id = "up-" + u.key;
    b.textContent = lv >= MAX_LEVEL ? "Max" : cost.toLocaleString("en-GB");
    b.disabled = !owned || lv >= MAX_LEVEL || save.coins < cost;
    b.addEventListener("click", () => {
      if (save.coins < cost || lv >= MAX_LEVEL) return;
      save.coins -= cost; cs.upgrades[u.key] = lv + 1; writeSave(); sfx.chime();
      if (G.player && save.car === def.id) G.player.spec = carSpec(def, cs.upgrades);
      refreshGarage();
    });
    row.appendChild(b); el.appendChild(row);
  }
}
function cycleCar(dir) {
  const i = (CARS.findIndex((c) => c.id === G.garageCar) + dir + CARS.length) % CARS.length;
  G.garageCar = CARS[i].id; sfx.click(); refreshGarage();
}
$("carPrev").addEventListener("click", () => cycleCar(-1));
$("carNext").addEventListener("click", () => cycleCar(1));
$("carAction").addEventListener("click", () => {
  const def = carById(G.garageCar);
  if (!save.owned.includes(def.id)) {
    if (def.gems) { if (save.gems < def.gems) return; save.gems -= def.gems; }
    else { if (save.coins < def.price) return; save.coins -= def.price; }
    save.owned.push(def.id); toast(def.name + " is yours!");
  }
  save.car = def.id; writeSave(); sfx.chime(); refreshGarage();
});
function tabs(ids, panels) {
  ids.forEach((id, i) => $(id).addEventListener("click", () => {
    sfx.click(); ids.forEach((o, j) => { $(o).setAttribute("aria-pressed", String(i === j)); $(panels[j]).hidden = i !== j; });
  }));
}
tabs(["tabPaint", "tabRims", "tabUp"], ["panelPaint", "panelRims", "panelUp"]);
function buildRims() {
  const el = $("rims"); el.innerHTML = ""; const cs = carSave(G.garageCar);
  RIMS.forEach((r, i) => {
    cs.rimsOwned = cs.rimsOwned || [0];
    const have = cs.rimsOwned.includes(i);
    const b = document.createElement("button"); b.type = "button"; b.className = "chipbtn"; b.textContent = have ? r.name : `${r.name} · ${RIM_COST}`; b.setAttribute("aria-pressed", String(i === (cs.rims || 0)));
    b.disabled = !have && save.coins < RIM_COST;
    b.addEventListener("click", () => {
      if (!have) { if (save.coins < RIM_COST) return; save.coins -= RIM_COST; cs.rimsOwned.push(i); }
      sfx.click(); cs.rims = i; setRims(G.car, i); writeSave(); buildRims(); refreshLobby();
    });
    el.appendChild(b);
  });
}

function buildPaints() {
  const el = $("paints"); el.innerHTML = "";
  const cs = carSave(G.garageCar || save.car);
  PAINTS.forEach((p, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "paint"; b.id = "paint" + i;
    b.style.background = "#" + p.hex.toString(16).padStart(6, "0"); b.setAttribute("aria-label", p.name);
    b.setAttribute("aria-pressed", String(i === cs.paint));
    b.addEventListener("click", () => {
      sfx.click(); cs.paint = i; G.car.paint.color.setHex(p.hex);
      [...el.children].forEach((c, j) => c.setAttribute("aria-pressed", String(j === i)));
      $("paintName").textContent = p.name; writeSave();
    });
    el.appendChild(b);
  });
  $("paintName").textContent = PAINTS[cs.paint % PAINTS.length].name;
}

function startRace() {
  sfx.startAudio(); sfx.click();
  if (G.car.def && G.car.def !== save.car) buildPlayer();
  G.mode = "countdown";
  scene.add(G.car.group); setDoors(G.car, 0); G.doors = 0;
  const ev = G.event, solo = ev ? ev.type === "trial" || ev.type === "drift" : G.trial;
  G.field = solo ? [] : ev && ev.type === "h2h" ? G.rivals.filter((r) => r.name === ev.rival) : G.rivals;
  for (const r of G.rivals) r.model.group.visible = G.field.includes(r);
  G.elimDone = 0; G.eliminated = false;
  $("eventTag").hidden = !ev;
  if (ev) $("eventTag").textContent = ev.name + " · " + ev.desc;
  gridUp();
  [...SCREENS, "finish", "pause", "topbar"].forEach((id) => ($(id).hidden = true));
  setRaceUI(true); G.paused = false; minimap.setTrack(G.path);
  $("count").hidden = false; G.countT = 0; G.lastBeep = -1;
}

function toMenu() {
  G.mode = "menu"; G.paused = false;
  ["finish", "pause", "count"].forEach((id) => ($(id).hidden = true));
  setRaceUI(false); showroom.setCar(G.car);
  show("menu");
  gridUp();
}

function finishRace() {
  G.mode = "done";
  G.playerFinish = G.raceTime;
  const order = standings(), place = order.findIndex((e) => e.me) + 1;
  sfx.fanfare(place <= 3 && !G.eliminated);
  G.place = place;
  const fastest = Math.min(...G.lapTimes);
  let html = `<div class="place">${ordinal(place)}<small> of ${order.length}</small></div><ol class="standings">`;
  const L = G.path.length;
  order.forEach((e, i) => {
    const gap = e.finished != null ? fmt(e.finished) : "~" + fmt(G.raceTime + Math.max(0.5, (laps() * L - e.veh.totalD) / Math.max(25, e.veh.vF || 40)));
    html += `<li class="${e.me ? "me" : ""}"><span class="pos">${i + 1}</span><span class="sw" style="background:#${e.color.toString(16).padStart(6, "0")}"></span><span class="nm">${e.name}</span><span class="tm">${gap}</span></li>`;
  });
  html += `</ol><div class="laps">Best lap <b>${fmt(fastest)}</b> · Record <b>${fmt(save.best[G.track.id])}</b></div>`;
  if (G.event) html = eventResult(place, fastest) + html;
  const rw = raceRewards({ place, field: order.length, drift: G.totalDrift, cleanLaps: G.cleanLaps, record: G.newRecord, trial: G.trial, mult: G.track.mult || 1 });
  save.coins += rw.coins; save.gems += rw.gems; G.lastReward = rw;
  html += `<div class="reward">${rw.lines.map(([n, c]) => `<span>${n}</span><b>+${c}</b>`).join("")}<span class="tot">Total</span><b class="tot coin">+${rw.coins}</b>${rw.gems ? `<span>Gems</span><b class="gem">+${rw.gems}</b>` : ""}</div>`;
  $("results").innerHTML = html;
  writeSave();
  setTimeout(() => { if (G.mode === "done") { setRaceUI(false); $("finish").hidden = false; } }, TEST ? 200 : 1400);
}

function eventResult(place, fastest) {
  const ev = G.event, rival = ev.type === "h2h" ? G.field[0] : null;
  const r = { place, bestLap: fastest, drift: G.totalDrift, eliminated: G.eliminated,
    beatRival: rival ? rival.finished == null || G.playerFinish < rival.finished : false,
    margin: rival ? (rival.finished == null ? 5 : rival.finished - G.playerFinish) : 0 };
  const res = judge(ev, r), prev = save.career[ev.id] || {};
  let extra = "";
  if (res.ok) {
    if (!prev.done) {
      save.coins += ev.reward.coins || 0; save.gems += ev.reward.gems || 0;
      extra = `<div class="evreward">Event reward <b>+${ev.reward.coins || 0}</b>${ev.reward.gems ? ` <b class="gem">+${ev.reward.gems} gems</b>` : ""}</div>`;
      if (ev.unlock && ev.unlock.track) extra += `<div class="evunlock">Unlocked track: <b>${trackById(ev.unlock.track).name}</b></div>`;
      if (ev.unlock && ev.unlock.car && !save.owned.includes(ev.unlock.car)) { save.owned.push(ev.unlock.car); extra += `<div class="evunlock">New car: <b>${carById(ev.unlock.car).name}</b></div>`; }
    }
    save.career[ev.id] = { done: true, stars: Math.max(res.stars, prev.stars || 0) };
  }
  G.eventOk = res.ok;
  const detail = ev.type === "drift" ? `Drift score ${Math.round(G.totalDrift)} / ${ev.target}` : ev.type === "trial" ? `Best lap ${fmt(fastest)} / target ${fmt(ev.target)}` : ev.desc;
  return `<div class="evhead ${res.ok ? "ok" : "fail"}"><div class="evname">${ev.name}</div><div class="evstate">${res.ok ? "Complete " + "★".repeat(res.stars) + "☆".repeat(3 - res.stars) : G.eliminated ? "Eliminated" : "Not this time"}</div><div class="hint">${detail}</div>${extra}</div>`;
}

function pause(on) {
  if (G.mode !== "race" && G.mode !== "countdown") return;
  G.paused = on; $("pause").hidden = !on;
}

$("startBtn").addEventListener("click", startRace);
$("raceBtn").addEventListener("click", () => show("setup"));
$("garageBtn").addEventListener("click", () => show("garage"));
$("settingsBtn").addEventListener("click", () => show("settings"));
$("careerBtn").addEventListener("click", () => show("career"));
$("careerBack").addEventListener("click", () => show("menu"));
const TYPE_LABEL = { race: "Race", trial: "Time trial", drift: "Drift", elim: "Elimination", h2h: "Head to head" };
function buildCareer() {
  const el = $("events"); el.innerHTML = "";
  let total = 0;
  EVENTS.forEach((ev, i) => {
    const st = save.career[ev.id], open = TEST || eventUnlocked(save, i); total += st ? st.stars : 0;
    const b = document.createElement("button"); b.type = "button"; b.className = "event" + (st && st.done ? " done" : "") + (open ? "" : " lockd"); b.id = "ev-" + ev.id;
    b.disabled = !open;
    b.innerHTML = `<span class="evn">${i + 1}</span><span class="evb"><b>${ev.name}</b><small>${TYPE_LABEL[ev.type]} · ${trackById(ev.track).name} · ${ev.laps} laps</small><small>${ev.desc}</small></span><span class="evs">${open ? (st ? "★".repeat(st.stars) + "☆".repeat(3 - st.stars) : "+" + (ev.reward.coins || 0)) : "🔒"}</span>`;
    b.addEventListener("click", () => startEvent(ev));
    el.appendChild(b);
  });
  $("careerStars").textContent = total + " / " + EVENTS.length * 3 + " ★";
}
function startEvent(ev) {
  G.event = ev;
  if (G.track.id !== ev.track) { const keep = save.track; loadTrack(ev.track); save.track = keep; }
  startRace();
}
["setupBack", "garageBack", "settingsBack"].forEach((id) => $(id).addEventListener("click", () => show("menu")));
function setMode(trial) { G.trial = trial; $("modeRace").setAttribute("aria-pressed", String(!trial)); $("modeTrial").setAttribute("aria-pressed", String(trial)); refreshLock(); }
$("modeRace").addEventListener("click", () => { sfx.click(); setMode(false); });
$("modeTrial").addEventListener("click", () => { sfx.click(); setMode(true); });

// ---------- settings ----------
function refreshSettings() {
  document.querySelectorAll("#qualityTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === world.qname)));
  document.querySelectorAll("#camTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === chase.mode)));
  document.querySelectorAll("#soundTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.s === "1") === save.settings.sound)));
}
document.querySelectorAll("#qualityTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.quality = b.dataset.q; world.applyQuality(b.dataset.q); writeSave(); refreshSettings(); }));
document.querySelectorAll("#camTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); if (chase.mode !== b.dataset.c) $("camBtn").click(); refreshSettings(); }));
document.querySelectorAll("#soundTabs .tab").forEach((b) => b.addEventListener("click", () => { if ((b.dataset.s === "1") !== save.settings.sound) $("muteBtn").click(); sfx.click(); refreshSettings(); }));
$("resetBtn").addEventListener("click", () => {
  if (!TEST && !confirm("Reset all progress? Coins, cars, upgrades and records will be wiped.")) return;
  resetSave(); G.garageCar = null; buildPlayer(); sfx.setMuted(false); $("muteBtn").textContent = "♪ On"; toast("Progress reset."); show("menu");
});
$("againBtn").addEventListener("click", startRace);
$("menuBtn").addEventListener("click", () => { const ev = G.event; toMenu(); if (ev) show("career"); });
$("pauseBtn").addEventListener("click", () => pause(true));
$("resumeBtn").addEventListener("click", () => { sfx.click(); pause(false); });
$("restartBtn").addEventListener("click", startRace);
$("quitBtn").addEventListener("click", toMenu);
$("muteBtn").addEventListener("click", () => {
  save.settings.sound = !save.settings.sound; sfx.setMuted(!save.settings.sound); writeSave();
  $("muteBtn").textContent = save.settings.sound ? "♪ On" : "♪ Off";
});
$("tiltBtn").addEventListener("click", async () => {
  const on = await setTilt(!input.tiltOn, toast);
  $("tiltBtn").textContent = on ? "Tilt ✓" : "Tilt"; $("tiltBtn").classList.toggle("on", on);
});
bindPad($("padL"), "left"); bindPad($("padR"), "right"); bindPad($("padBoost"), "boost"); bindPad($("padDrift"), "drift");
$("camBtn").addEventListener("click", () => {
  chase.mode = chase.mode === "chase" ? "bonnet" : "chase"; save.settings.camera = chase.mode; writeSave();
  $("camBtn").textContent = chase.mode === "chase" ? "Cam 1" : "Cam 2"; chase.ready = false;
});
$("camBtn").textContent = chase.mode === "chase" ? "Cam 1" : "Cam 2";
input.onKey = (k) => {
  if (k === "Escape" || k === "p" || k === "P") pause(!G.paused);
  else if ((k === "r" || k === "R") && G.mode === "race") G.player.respawn();
  else if (k === "m" || k === "M") $("muteBtn").click();
  else if (k === "c" || k === "C") $("camBtn").click();
};
sfx.setMuted(!save.settings.sound);
$("muteBtn").textContent = save.settings.sound ? "♪ On" : "♪ Off";

// ---------- autopilot (tests and attract mode) ----------
function autopilot(v) {
  const t = G.path, look = Math.max(10, v.vF * 0.55);
  const i = Math.floor(t.wrapD(v.p.d + look) / t.ds) % t.N;
  const tp = t.pointAt(v.p.d + look, t.line[i] * 0.8, {});
  const want = Math.atan2(tp.x - v.x, tp.z - v.z);
  const prof = t.speedProfile(v.spec.grip);
  let vt = Infinity; for (let k = 0; k < 40; k += 3) vt = Math.min(vt, prof[(v.p.i + k) % t.N]);
  return { steer: clamp(wrapA(v.h - want) * 2.2, -1, 1), targetSpeed: vt * 0.98 };
}

// Auto-brake: lift and brake for tight corners a little later than a careful driver would.
function assistSpeed(v) {
  if (v.drifting) return Infinity;
  const t = G.path, prof = t.speedProfile(v.spec.grip * 1.1);
  let vt = Infinity; for (let k = 2; k < 30; k += 3) vt = Math.min(vt, prof[(v.p.i + k) % t.N]);
  return vt * 1.06;
}

function stepRivals(dt) {
  const cars = [G.player, ...G.field.map((r) => r.veh)], L = G.path.length;
  for (const r of G.field) {
    const done = r.finished != null;
    r.driver.think(dt, cars, r.veh.totalD - G.player.totalD);
    if (done) r.veh.ctl.targetSpeed = Math.min(r.veh.ctl.targetSpeed, 30);
    r.veh.step(dt, true);
    if (!done && r.veh.totalD >= laps() * L) r.finished = G.raceTime;
  }
}

function popDrift(n) {
  const el = $("driftPop"); el.textContent = "DRIFT +" + n; el.hidden = false; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  clearTimeout(popDrift._t); popDrift._t = setTimeout(() => (el.hidden = true), 1200);
}

// ---------- simulation ----------
const lookAt = new THREE.Vector3(), camPos = new THREE.Vector3();

function step(dt) {
  if (G.paused) return;

  if (G.mode === "countdown") {
    G.countT += dt;
    const c = G.countT;
    [$("l1"), $("l2"), $("l3")].forEach((l, i) => { l.className = "lamp" + (c >= 4 ? " green" : c >= 1 + i ? " red" : ""); });
    $("countV").textContent = c < 1 ? "" : c < 4 ? String(3 - Math.floor(c - 1)) : "GO";
    const b = Math.floor(c); if (b !== G.lastBeep && b >= 1 && b <= 4) { G.lastBeep = b; sfx.beep(b === 4); }
    if (c >= 4) G.mode = "race";
  }
  if (G.mode === "race" && G.countT < 5) { G.countT += dt; if (G.countT >= 5) $("count").hidden = true; }

  const v = G.player, racing = G.mode === "race";
  const ctl = readControls();
  const ap = AUTOPILOT && racing ? autopilot(v) : null;
  v.ctl.steer = ap ? ap.steer : ctl.steer;
  v.ctl.boost = ctl.boost; v.ctl.drift = ctl.drift; v.ctl.brake = ctl.brake;
  v.ctl.targetSpeed = ap ? ap.targetSpeed : assistSpeed(v);
  if (G.mode === "race" || G.mode === "done") {
    v.step(dt, racing);
    stepRivals(dt);
    collide([v, ...G.field.map((r) => r.veh)], (a, b, k) => { if (k > 3 && (a === v || b === v)) { chase.shake = Math.min(0.6, k * 0.04); sfx.thud(k); } });
    v.draft = 1;
    for (const r of G.field) { const dd = r.veh.totalD - v.totalD; if (dd > 6 && dd < 35 && Math.abs(r.veh.lat - v.lat) < 2.4) v.draft = 1.045; }
  }

  if (racing) {
    // drift points: build while sliding, banked when the slide ends
    if (v.driftTime > 0.25) { G.driftPts += dt * v.vF * Math.abs(v.driftAngle) * 6; G.driftShow = 1.5; }
    else if (G.driftPts > 0 && v.driftTime === 0) { if (G.driftPts > 20) { G.totalDrift += Math.round(G.driftPts); popDrift(Math.round(G.driftPts)); sfx.chime(); } G.driftPts = 0; }
    if (v.boosting && !G.wasBoosting) sfx.whoosh();
    G.wasBoosting = v.boosting;
    G.raceTime += dt;
    const L = G.path.length, done = G.lapTimes.length;
    if (v.totalD >= (done + 1) * L) {
      const lap = G.raceTime - G.lapStart; G.lapTimes.push(lap); G.lapStart = G.raceTime;
      const best = save.best[G.track.id];
      if (G.lapWall === 0) G.cleanLaps++;
      G.lapWall = 0;
      if (best == null || lap < best) { if (best != null) G.newRecord = true; save.best[G.track.id] = lap; writeSave(); if (G.lapTimes.length < laps()) toast("New best lap · " + fmt(lap), 1800); }
      if (G.lapTimes.length >= laps()) finishRace(); else sfx.lapChime();
    }
    if (G.event && G.event.type === "elim" && G.mode === "race") eliminate();
  }
  if (v.wallHit > 2) G.lapWall++;
  if (v.wallHit > 4) { chase.shake = Math.min(1, v.wallHit * 0.05); sfx.thud(v.wallHit); }
}

// Elimination: every time the leader starts a new lap, whoever is last drops out.
function eliminate() {
  const L = G.path.length;
  const lead = Math.max(G.player.totalD, ...G.field.map((r) => r.veh.totalD));
  const lapsDone = Math.floor(lead / L);
  if (lapsDone <= G.elimDone || lapsDone >= laps()) return;
  G.elimDone = lapsDone;
  const order = standings(), last = order[order.length - 1];
  if (last.me) { G.eliminated = true; toast("You're out! Last place drops out each lap.", 2500); finishRace(); return; }
  last.out = true; last.model.group.visible = false; last.veh.reset(-2000, 0);
  G.field = G.field.filter((r) => r !== last);
  toast(last.name + " is out!", 1800); sfx.thud(4);
}

const wp = new THREE.Vector3();
// Smoke + skid marks from the rear wheels when a car slides or brakes hard.
function tyreFx(key, m, v, dt) {
  const slide = Math.abs(v.driftAngle) > 0.12 && v.vF > 12 ? Math.min(1, (Math.abs(v.driftAngle) - 0.08) * 4) : 0;
  const lock = v.lonAcc < -18 && v.vF > 15 ? 0.6 : 0;
  const k = Math.max(slide, lock);
  for (let w = 2; w < 4; w++) {
    m.wheels[w].parent.getWorldPosition(wp);
    skids.mark(key + w, wp.x, v.y, wp.z, v.h, k);
    if (k > 0.2 && Math.random() < k * dt * 40) smoke.emit(wp.x, v.y, wp.z, v.vx, v.vz, k);
  }
}

function poseCar(m, v, dt) {
  updateFlames(m, v.boosting, performance.now() / 1000);
  m.group.position.set(v.x, v.y, v.z); m.group.rotation.set(0, v.h, 0);
  m.body.rotation.z = clamp(-v.latAcc * 0.0035, -0.06, 0.06); m.body.rotation.x = clamp(-v.lonAcc * 0.002, -0.03, 0.03);
  m.wheels.forEach((w) => (w.rotation.x += v.vF * dt / 0.36)); m.steerers.forEach((p) => (p.rotation.y = -v.steer * 0.4));
}

function render(dt) {
  const v = G.player, car = G.car;
  car.group.position.set(v.x, v.y, v.z);
  car.group.rotation.set(0, v.h, 0);
  car.body.rotation.z = clamp(-v.latAcc * 0.0035, -0.06, 0.06);
  car.body.rotation.x = clamp(-v.lonAcc * 0.002, -0.03, 0.03);
  car.wheels.forEach((w) => (w.rotation.x += v.vF * dt / 0.36));
  car.steerers.forEach((p) => (p.rotation.y = -v.steer * 0.4));
  for (const r of G.field) poseCar(r.model, r.veh, dt);
  updateFlames(car, v.boosting, performance.now() / 1000);
  if (G.mode === "race" || G.mode === "done") {
    tyreFx("p", car, v, dt);
    G.field.forEach((r, i) => tyreFx("r" + i, r.model, r.veh, dt));
  }
  smoke.update(dt, world.renderer.domElement.clientHeight || innerHeight);
  speedLines.update(dt, v.vF, G.mode === "race" ? (v.boosting ? 1 : Math.max(0, (v.vF / v.spec.vmax - 0.8) * 3)) : 0);

  car.group.position.y += Math.sin(G.bob = (G.bob || 0) + dt * v.vF * 0.9) * 0.006 * Math.min(1, v.vF / 30);
  const portrait = camera.aspect < 1;
  if (G.mode === "menu") {
    G.menuT += dt;
    // doors swing open and shut every few seconds in the lobby; held open in the garage
    const want = G.screen === "garage" ? 1 : (G.menuT % 9) < 5 ? 1 : 0;
    G.doors += (want - G.doors) * Math.min(1, dt * 2.2); setDoors(G.car, G.doors);
    car.group.position.set(0, 0, 0); car.group.rotation.set(0, 0, 0); car.body.rotation.set(0, 0, 0);
    showroom.update(dt, camera);
    chase.snap(v);
  } else chase.update(v, dt, v.boosting ? 1 : 0);
  car.body.visible = chase.mode !== "bonnet" || G.mode === "menu";
  world.follow(v.x, v.y, v.z);

  if (G.mode !== "menu") {
    $("lapV").textContent = Math.min(G.lapTimes.length + 1, laps()) + "/" + laps();
    $("timeV").textContent = fmt(G.mode === "race" ? G.raceTime - G.lapStart : G.lapTimes[G.lapTimes.length - 1] || 0);
    if ((G.hudTick = (G.hudTick || 0) + 1) % 6 === 0) { const o = standings(); $("posV").textContent = ordinal(o.findIndex((e) => e.me) + 1) + "/" + o.length; }
    $("boostFill").style.width = Math.round(v.boost * 100) + "%";
    $("padBoost").classList.toggle("ready", v.boost > 0.15);
    $("drift").hidden = !(G.driftPts > 5);
    if (G.driftPts > 5) $("driftV").textContent = "+" + Math.round(G.driftPts);
    $("spdV").textContent = Math.round(Math.max(0, v.vF) * 3.6);
    $("spdBar").style.width = Math.min(100, (v.vF / v.spec.vmax) * 100) + "%";
    $("offtrack").hidden = !(v.offTrack && G.mode === "race");
    minimap.draw([...G.field.map((r) => ({ x: r.veh.x, z: r.veh.z, color: "#" + r.color.toString(16).padStart(6, "0") })), { x: v.x, z: v.z, color: "#f2a65a", me: true }]);
  }
  sfx.updateAudio(v.vF, v.spec.vmax, G.mode === "race" || G.mode === "countdown", Math.min(1, Math.abs(v.driftAngle) * 3), v.boosting);
}

// ---------- boot ----------
loadTrack(QS.get("track") || save.track || "gp");
buildPlayer();
buildRivals();
G.field = G.rivals;
gridUp();
showroom.setCar(G.car);
show("menu");
camera.position.set(G.player.x + 8, 3, G.player.z + 7);
addEventListener("resize", () => world.resize());
// pause when the app goes to the background (phone lock, tab switch)
document.addEventListener("visibilitychange", () => { sfx.suspend(document.hidden); if (document.hidden && G.mode === "race") pause(true); });
world.resize();

let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const real = Math.min(TEST ? 0.25 : 0.1, (now - last) / 1000); last = now;
  acc += real * TIME_SCALE;
  let n = 0;
  while (acc >= STEP && n++ < 240) { step(STEP); acc -= STEP; }
  render(real);
  world.render(G.mode === "menu" ? showroom.scene : null);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- test hook ----------
addEventListener("error", (e) => errors.push(String(e.message)));
if (TEST) {
  window.__apex = {
    get mode() { return G.mode; },
    get player() { const v = G.player; return { x: v.x, z: v.z, h: v.h, vF: v.vF, totalD: v.totalD, boost: v.boost, boosting: v.boosting, drifting: v.drifting, driftAngle: v.driftAngle, lat: v.lat }; },
    get skidCount() { return skids.n; },
    setBoost(b) { G.player.boost = b; },
    get laps() { return G.lapTimes.slice(); },
    get place() { return G.place; },
    get eventOk() { return G.eventOk; },
    get fieldSize() { return G.field.length; },
    get reward() { return G.lastReward; },
    addCoins(n, g = 0) { save.coins += n; save.gems += g; writeSave(); refreshLobby(); },
    get rivals() { return G.rivals.map((r) => ({ totalD: r.veh.totalD, vF: r.veh.vF, lat: r.veh.lat, finished: r.finished })); },
    get trackLength() { return G.path.length; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get track() { return G.track.id; },
    // jump the player to a distance along the track (used for screenshots of specific corners)
    warp(d) { const keep = G.player.totalD; G.player.reset(d, 0); G.player.totalD = keep; G.player.vF = 40; G.player.vx = Math.sin(G.player.h) * 40; G.player.vz = Math.cos(G.player.h) * 40; chase.ready = false; },
    bridgeD() { const i = G.path.bridge.findIndex((b) => b); return i < 0 ? -1 : (i - 30) * G.path.ds; },
    errors,
    ready: true,
  };
}
