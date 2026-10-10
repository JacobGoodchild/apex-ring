// Apex Ring entry point: builds the world, runs the fixed-step game loop and drives the menus.
import * as THREE from "three";
import { TEST, TIME_SCALE, AUTOPILOT, SEED, FPS_CAP, STOP_TICK } from "./env.js";
import { loadSave, writeSave, resetSave, save, carSave } from "./save.js";
import { World, autoQuality } from "./scene.js";
import { TrackPath } from "./track.js";
import { buildTrackMeshes } from "./trackmesh.js";
import { buildScenery } from "./scenery.js";
import { hasTerrain } from "./terrain.js";
import { TRACKS, THEMES, trackById, DIFFICULTY_NAMES, LAYOUTS, baseId, layoutOf, canReverse, rainy, nightly } from "./tracks.js";
import { CARS, PAINTS, carById, carSpec, GARAGE_ORDER } from "./cars.js";
import { makeCar, setDoors, setRims, setDecal, setFinish, wheelBlur, RIMS, DECALS, FINISHES, LIVERY } from "./carmodel.js";
import { Showroom } from "./showroom.js";
import { Ghost } from "./ghost.js";
import { encodeGhost, decodeGhost } from "./ghostcode.js";
import { VERSION, BUILD } from "./version.js";
import { assistSteer, cornerSpeed, smoothSteer } from "./assist.js";
import { levelOf, slot, rivalSpec, AUTO_BRAKE, AUTO_ASSIST } from "./race.js";
import { EVENTS, eventUnlocked, trackUnlocked, judge, dailyEvent, CUPS, CUP_POINTS } from "./career.js";
import { UPGRADES, MAX_LEVEL, upgradeCost, RIM_COST, raceRewards } from "./economy.js";
import { TROPHIES, TROPHY_COINS, award } from "./trophies.js";
import { Vehicle } from "./vehicle.js";
import { input, bindZones, bindPads, readControls, readControls2, setTilt, calibrateTilt, tiltCfg } from "./input.js";
import * as sfx from "./audio.js";
import { setMusicMode, setMusicVolume, songName, SONGS } from "./music.js";
import { ChaseCam } from "./camera.js";
import { Driver, RIVALS, collide, STYLE_NAMES } from "./ai.js";
import { makeRng } from "./rng.js";
import { Skids, Smoke, SpeedLines, Rain, addFlames, updateFlames, addBeams, setTrail, TRAILS, addContactShadow, updateContactShadow } from "./effects.js";
import { Minimap, drawTrack } from "./minimap.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const errors = [];

loadSave();
const world = new World($("stage"), save.settings.quality || autoQuality());
const { scene, camera } = world;
const chase = new ChaseCam(camera);
// real headlights for the player's car on night tracks (one spotlight; the rivals keep their cheap fake beams)
const headLight = new THREE.SpotLight(0xfff0d8, 0, 110, 0.5, 0.6, 1.1);
headLight.visible = false; scene.add(headLight, headLight.target);
// split-screen: a second camera and chase cam for player 2
const camera2 = new THREE.PerspectiveCamera(60, 1, 0.1, 2600), chase2 = new ChaseCam(camera2);
scene.add(camera);
const showroom = new Showroom(world);
showroom.bindDrag($("menu")); showroom.bindDrag($("garage"));
const skids = new Skids(scene), smoke = new Smoke(scene), speedLines = new SpeedLines(camera);
const CAMS = ["chase", "low", "bonnet"];
chase.mode = CAMS.includes(save.settings.camera) ? save.settings.camera : "chase";

const QS = new URLSearchParams(location.search);
const G = {
  mode: "menu", track: null, path: null, player: null, car: null, lapsOverride: TEST && QS.get("laps") ? Number(QS.get("laps")) : 0,
  countT: 0, raceTime: 0, lapStart: 0, lapTimes: [], menuT: 0, doors: 1, paused: false, rivals: [], field: [], finishOrder: [],
  nRivals: QS.get("rivals") != null ? Number(QS.get("rivals")) : 7, gridSlot: 5,
};

// ---------- track ----------
// weather: "dry" or "rain" (the Coastal Highway is always wet)
function loadTrack(id, weather = G.wantWeather || "dry") {
  const base = trackById(id), wet = weather === "rain" || !!THEMES[base.theme].rain;
  const def = wet && !base.wet ? { ...base, wet: true } : base;
  const night = (G.wantTime || "day") === "night";
  let theme = THEMES[def.theme];
  if (night) theme = nightly(theme);
  if (wet) theme = rainy(theme);
  G.weather = wet ? "rain" : "dry";
  G.track = def; G.path = new TrackPath(def);
  const grp = buildTrackMeshes(G.path, theme, { embankments: !hasTerrain(theme) });
  grp.add(buildScenery(G.path, theme, world.qname === "low" ? 0.45 : world.qname === "medium" ? 0.75 : 1, SEED ^ 0x1234));
  world.setTrack(grp); world.setTheme(theme);
  world.ground.visible = !hasTerrain(theme); // the terrain replaces the flat ground plane
  G.night = night || !!THEMES[def.theme].stars; G.wet = !!theme.rain;
  headLight.visible = G.night;
  const sea = grp.getObjectByName("sea"); G.water = sea ? sea.material.normalMap : null;
  if (theme.rain && !G.rain) G.rain = new Rain(scene);
  if (G.rain) G.rain.lines.visible = !!theme.rain;
  if (G.car && G.car.beams) G.car.beams.visible = G.night;
  for (const r of G.rivals || []) if (r.model.beams) r.model.beams.visible = G.night;
  if (G.player) { G.player.track = G.path; gridUp(); }
  save.track = def.id;
  $("trackName").textContent = def.name; $("trackBlurb").textContent = def.blurb + " " + def.laps + " laps.";
  $("trackTheme").textContent = DIFFICULTY_NAMES[def.difficulty || 1] + " · " + (theme.label || "Track");
  $("trackTheme").dataset.diff = def.difficulty || 1;
  applyAids();
  drawTrack(previewCtx, G.path, 96, { width: 4 });
  refreshLock();
}
function refreshLock() {
  if (!G.track) return;
  const open = G.cupMode ? cupOpen(CUPS[G.cupIdx]) : TEST || trackUnlocked(save, baseId(G.track.id));
  // layout tabs (Normal / Reverse / Mirror); Reverse is hidden on tracks with cliff drops
  const lay = layoutOf(G.track.id), base = TRACKS.find((t) => t.id === baseId(G.track.id));
  document.querySelectorAll("#layoutTabs .tab").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.l === lay)); b.hidden = b.dataset.l === "r" && !canReverse(base); });
  $("startBtn").disabled = !open;
  $("trackPick").classList.toggle("locked", !open);
  if (!open) $("startBtn").textContent = "Unlock it in Career";
  else $("startBtn").textContent = G.cupMode ? "Start cup" : G.trial ? "Start time trial" : "Start race";
  refreshBoard();
}
// ---------- local leaderboard + ghost codes ----------
// Every lap you finish is logged per track layout; the board shows your best this week, this month or ever.
function logLap(id, t) {
  const all = (save.laps = save.laps || {}), list = (all[id] = all[id] || []);
  list.push({ t: Math.round(t * 1000) / 1000, d: Date.now(), c: save.car });
  list.sort((a, b) => a.t - b.t);
  const cut = Date.now() - 35 * 864e5;
  all[id] = list.filter((e, i) => i < 10 || e.d > cut).slice(0, 60);
}
function refreshBoard() {
  const p = G.boardPeriod || "week", now = Date.now(), from = p === "week" ? now - 7 * 864e5 : p === "month" ? now - 31 * 864e5 : 0;
  document.querySelectorAll("#boardTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === p)));
  const list = ((save.laps || {})[G.track.id] || []).filter((e) => e.d >= from).slice(0, 5);
  $("boardList").innerHTML = list.length ? list.map((e) => `<li><b>${fmt(e.t)}</b><span>${carById(e.c).name} · ${new Date(e.d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></li>`).join("") : `<li class="empty">No laps here yet${p !== "all" ? " this " + p : ""}.</li>`;
  $("ghostBar").hidden = !G.trial; if (!G.trial) $("ghostPanel").hidden = true;
  $("playersTabs").hidden = !!G.trial || !canSplit(); applyPlayers(); applyWeather();
}
document.querySelectorAll("#boardTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); G.boardPeriod = b.dataset.p; refreshBoard(); }));
$("ghostShare").addEventListener("click", async () => {
  const g = (save.ghosts || {})[G.track.id];
  $("ghostPanel").hidden = false;
  if (!g) { $("ghostCode").value = ""; $("ghostMsg").textContent = "Set a lap in Time trial first."; return; }
  $("ghostCode").value = await encodeGhost(g, G.track.id, save.car, "Apex driver");
  $("ghostMsg").textContent = `Your ${fmt(g.t)} lap. Send this code to a friend.`;
});
// Replay: watch your best time-trial lap from the chase camera (your car follows the recorded ghost line).
$("replayBtn").addEventListener("click", () => {
  const g = (save.ghosts || {})[G.track.id];
  if (!g) { $("ghostPanel").hidden = false; $("ghostMsg").textContent = "Set a lap in Time trial first."; return; }
  sfx.startAudio(); sfx.click();
  G.replay = g; G.replayT = 0; G.mode = "replay";
  SCREENS.forEach((s) => ($(s).hidden = true)); $("topbar").hidden = true;
  if (G.car.def && G.car.def !== save.car) buildPlayer();
  scene.add(G.car.group); setDoors(G.car, 0);
  for (const r of G.rivals) r.model.group.visible = false;
  if (G.boss) { G.boss.model.group.removeFromParent(); G.boss = null; }
  if (G.p2) { G.p2.model.group.removeFromParent(); G.p2 = null; }
  G.splitRace = false; input.split = false;
  G.field = []; setMusicMode("race", 1);
  $("replayTag").hidden = false; chase.snap(G.player); chase.ready = false;
  setTimeout(() => { G.replayArmed = true; }, 400);
});
function endReplay() { if (G.mode !== "replay") return; G.replayArmed = false; $("replayTag").hidden = true; G.mode = "menu"; showroom.setCar(G.car); show("setup"); }
addEventListener("pointerdown", () => { if (G.mode === "replay" && G.replayArmed) endReplay(); });
addEventListener("keydown", () => { if (G.mode === "replay" && G.replayArmed) endReplay(); });
// sample the ghost recording (10 per second) at time t: position, heading and velocity
function replayPose(g, t) {
  const s = g.s, n = s.length / 4, f = Math.max(0, Math.min(n - 1.001, t * 10)), i = Math.floor(f), k = f - i, a = i * 4, b = Math.min(n - 1, i + 1) * 4;
  let dh = s[b + 3] - s[a + 3]; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
  return { x: s[a] + (s[b] - s[a]) * k, y: s[a + 1] + (s[b + 1] - s[a + 1]) * k, z: s[a + 2] + (s[b + 2] - s[a + 2]) * k, h: s[a + 3] + dh * k, vx: (s[b] - s[a]) * 10, vz: (s[b + 2] - s[a + 2]) * 10 };
}
$("ghostImport").addEventListener("click", () => { $("ghostPanel").hidden = false; $("ghostCode").value = ""; $("ghostCode").focus(); $("ghostMsg").textContent = "Paste a code, then Load."; });
$("ghostCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("ghostCode").value); $("ghostMsg").textContent = "Copied!"; } catch (_) { $("ghostCode").select(); $("ghostMsg").textContent = "Select and copy the code."; } });
$("ghostLoad").addEventListener("click", async () => {
  try {
    const r = await decodeGhost($("ghostCode").value);
    save.friendGhosts = save.friendGhosts || {}; save.friendGhosts[r.track] = { ...r.ghost, n: r.name };
    writeSave(); sfx.chime();
    $("ghostMsg").textContent = `Loaded a ${fmt(r.ghost.t)} ghost for ${trackById(r.track).name}.`;
    if (r.track !== G.track.id) loadTrack(r.track);
    setMode(true);
  } catch (_) { $("ghostMsg").textContent = "That code doesn't look right."; }
});
const previewCtx = $("trackPreview").getContext("2d");
const minimap = new Minimap($("minimap"));
function pickTrack(dir) {
  sfx.click();
  const i = (TRACKS.findIndex((t) => t.id === baseId(G.track.id)) + dir + TRACKS.length) % TRACKS.length;
  loadTrack(TRACKS[i].id); writeSave();
}
function applyWeather() {
  document.querySelectorAll("#timeTabs .tab").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.t === (G.night ? "night" : "day"))); b.disabled = !!THEMES[G.track.theme].stars && b.dataset.t === "day"; });
  const always = !!THEMES[G.track.theme].rain;
  document.querySelectorAll("#weatherTabs .tab").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.w === G.weather)); b.disabled = always && b.dataset.w === "dry"; });
}
document.querySelectorAll("#timeTabs .tab").forEach((b) => b.addEventListener("click", () => { if (b.dataset.t === (G.night ? "night" : "day")) return; sfx.click(); G.wantTime = b.dataset.t; loadTrack(G.track.id); writeSave(); }));
document.querySelectorAll("#weatherTabs .tab").forEach((b) => b.addEventListener("click", () => { if (b.dataset.w === G.weather) return; sfx.click(); G.wantWeather = b.dataset.w; loadTrack(G.track.id); writeSave(); }));
// split-screen needs two sets of controls: a keyboard, or two gamepads (a phone alone has only one touch screen)
const canSplit = () => TEST || !matchMedia("(pointer: coarse)").matches || [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean).length >= 2;
function applyPlayers() {
  if (!canSplit()) G.split = false;
  document.querySelectorAll("#playersTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.n === "2") === !!G.split)));
  $("playersHint").hidden = !G.split;
}
document.querySelectorAll("#playersTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); G.split = b.dataset.n === "2"; applyPlayers(); }));
document.querySelectorAll("#layoutTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); loadTrack(baseId(G.track.id) + (b.dataset.l ? ":" + b.dataset.l : "")); writeSave(); }));
$("trackPrev").addEventListener("click", () => pickTrack(-1));
$("trackNext").addEventListener("click", () => pickTrack(1));

// ---------- player car ----------
function buildPlayer(id = save.car) {
  const def = carById(id), cs = carSave(def.id);
  if (G.car) G.car.group.removeFromParent();
  G.car = makeCar(def, PAINTS[cs.paint % PAINTS.length].hex, cs.rims, cs.decal || 0);
  sfx.setEngine(def.engine);
  addFlames(G.car); addBeams(G.car); addContactShadow(G.car); G.car.beams.visible = !!G.night;
  setFinish(G.car, cs.finish || 0, PAINTS[cs.paint % PAINTS.length].hex); setTrail(G.car, cs.trail || 0);
  if (cs.livery) setDecal(G.car, cs.decal || 0, PAINTS[cs.paint % PAINTS.length].hex, cs.livery);
  if (G.mode === "menu") showroom.setCar(G.car); else scene.add(G.car.group);
  if (!G.player) { G.player = new Vehicle(carSpec(def, cs.upgrades), G.path); G.player.reset(-8, 0); }
  G.player.spec = carSpec(def, cs.upgrades);
}


// Player 2 for split-screen: your car in a different paint, driven from readControls2().
function makeP2() {
  const def = carById(save.car), cs = carSave(def.id), paint = PAINTS[(cs.paint + 4) % PAINTS.length].hex;
  const veh = new Vehicle(carSpec(def, cs.upgrades), G.path);
  const model = makeCar(def, paint, cs.rims, cs.decal || 0);
  addFlames(model); addBeams(model); addContactShadow(model); model.beams.visible = !!G.night; setFinish(model, cs.finish || 0, paint); setDoors(model, 0);
  scene.add(model.group);
  return { carId: def.id, veh, model, name: "Player 2", color: 0x4cc9f0, human: true, touch: {} };
}

// Boss: a legend in their own special car, driving a level above your difficulty setting.
function makeBoss(ev) {
  const prof = RIVALS.find((r) => r.name === ev.rival) || RIVALS[0], def = carById(ev.car);
  const veh = new Vehicle(carSpec(def, {}), G.path);
  const model = makeCar(def, prof.color, 2, 4);
  model.group.traverse((o) => { if (o.isMesh) o.castShadow = false; }); model.body.children[0].castShadow = true;
  addFlames(model); addBeams(model); addContactShadow(model); model.beams.visible = !!G.night; setFinish(model, 2, prof.color); setTrail(model, 3); setDoors(model, 0);
  scene.add(model.group);
  const up = { easy: "normal", normal: "hard", hard: "hard" }[save.settings.difficulty || "easy"];
  const driver = new Driver(veh, prof, save.settings.difficulty === "hard" ? 1.02 : 1, (SEED + 4242) >>> 0, levelOf(up));
  return { carId: def.id, veh, model, driver, baseSkill: driver.skill, name: prof.name, color: prof.color, boss: true, level: levelOf(up) };
}

function buildRivals() {
  for (const r of G.rivals) scene.remove(r.model.group);
  G.rivals = [];
  const rnd = makeRng(SEED ^ 0x77);
  for (let k = 0; k < G.nRivals; k++) {
    const prof = RIVALS[k % RIVALS.length], def = CARS[(k + 1) % 7]; // the original seven hypercars
    const veh = new Vehicle(carSpec(def, {}), G.path);
    const model = makeCar(def, prof.color, k % 4, [1, 4, 2, 3, 0, 4, 1][k % 7]);
    model.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    model.body.children[0].castShadow = true;
    addFlames(model); addBeams(model); addContactShadow(model); model.beams.visible = !!G.night;
    setFinish(model, [0, 2, 0, 3, 1, 2, 0][k % 7], prof.color); setTrail(model, [0, 1, 0, 4, 2, 1, 3][k % 7]);
    setDoors(model, 0);
    scene.add(model.group);
    G.rivals.push({ carId: def.id, veh, model, driver: new Driver(veh, prof, 0.95 + rnd() * 0.05, (SEED + k * 977) >>> 0), baseSkill: 0.95 + rnd() * 0.05, name: prof.name, color: prof.color });
  }
}

function gridUp() {
  G.player.spec = carSpec(carById(save.car), carSave(save.car).upgrades);
  G.player.track = G.path; G.player.boost = 0.25;
  const ps = slot(Math.min(G.gridSlot, G.rivals.length)); G.player.reset(ps[0], ps[1]);
  let k = 0;
  const ps2 = G.player.spec;
  const level = levelOf(save.settings.difficulty);
  const band = { off: 0, low: 0.5, normal: 1, high: 1.8 }[save.settings.catchup || "normal"] ?? 1;
  for (const r of G.rivals) { r.out = false; r.driver.skill = r.baseSkill; r.driver.level = level; r.driver.band = band; }
  for (const r of G.field) {
    // rivals drive their own cars, but tuned halfway toward yours so races stay close; a boss brings a tuned car
    const base = carSpec(carById(r.carId), {});
    r.veh.spec = r.human ? carSpec(carById(r.carId), carSave(r.carId).upgrades) : r.boss ? carSpec(carById(r.carId), { engine: 2, tyres: 2, handling: 2, boost: 2, weight: 1 }) : rivalSpec(base, ps2);
    if (r.boss) { r.driver.level = r.level; r.driver.band = band * 0.5; }
    if (k === Math.min(G.gridSlot, G.rivals.length)) k++;
    const [d, lat] = slot(G.field.length === 1 ? 0 : k++); r.veh.track = G.path; r.veh.boost = 0.25; r.veh.reset(d, lat); r.finished = null;
  }
  G.raceTime = 0; G.lapStart = 0; G.lapTimes = []; G.finishOrder = []; G.playerFinish = null;
  skids.clear(); G.driftPts = 0; G.airPops = 0; G.mult = 1; G.lastBank = -9; G.draftM = 0; G.topSpeed = 0; G.bestDrift = 0;
  if (G.rocks && G.path) G.path.hazards = G.path.hazards.filter((h) => h.type !== "rock"); G.rocks = []; G.nextRock = 18; G.rockRnd = makeRng((SEED ^ 0x5eed) >>> 0); G.driftShow = 0; G.totalDrift = 0; G.cleanLaps = 0; G.lapWall = 0; G.newRecord = false;
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

const trialMode = () => (G.event ? G.event.type === "trial" : !!G.trial);
const laps = () => G.lapsOverride || (G.event ? G.event.laps : G.track.laps);

// ---------- UI ----------
function toast(msg, ms = 3200) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
const fmt = (t) => { if (t == null || !isFinite(t)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
function setRaceUI(on) {
  ["hud", "speedo", "pads", "topbtns", "minimap"].forEach((id) => ($(id).hidden = !on));
  $("splitHud").hidden = !(on && G.splitRace);
  $("hud").classList.toggle("split", !!(on && G.splitRace));
  if (on && G.splitRace) { ["speedo", "minimap", "pads"].forEach((id) => ($(id).hidden = true)); }
  const pro = save.settings.drive === "pro" && matchMedia("(pointer: coarse)").matches;
  $("proPads").hidden = !(on && pro); if (on && pro) $("pads").hidden = true; $("proSteer").hidden = input.tiltOn; $("tags").hidden = !on; if (!on) { $("drift").hidden = true; $("driftPop").hidden = true; $("eventTag").hidden = true; $("gapV").hidden = true; } }

const SCREENS = ["menu", "setup", "garage", "settings", "career", "help"];
function show(id) {
  sfx.click();
  SCREENS.forEach((s) => ($(s).hidden = s !== id));
  setMusicMode("menu"); if (G.photo) endPhoto();
  $("topbar").hidden = !SCREENS.includes(id);
  G.screen = id;
  if (id === "garage") { G.garageCar = save.car; refreshGarage(); }
  if (id === "menu") { if (G.garageCar && G.garageCar !== save.car) buildPlayer(); refreshLobby(); }
  if (id === "settings") refreshSettings();
  if (id === "career") buildCareer();
  if (id === "setup") {
    G.event = null;
    const base = THEMES[G.track.theme], wantNight = (G.wantTime || "day") === "night" || !!base.stars;
    if (G.track.id !== (save.track || G.track.id) || G.weather !== (base.rain ? "rain" : G.wantWeather || "dry") || G.night !== wantNight) loadTrack(save.track || G.track.id);
    refreshLock();
  }
}
function refreshLobby() {
  $("lobbyCar").textContent = carById(save.car).name;
  $("coinsV").textContent = save.coins.toLocaleString("en-GB"); $("gemsV").textContent = save.gems;
}

// ---------- garage ----------
const STAT_KEYS = [["Top speed", (s) => s.vmax / 95], ["Acceleration", (s) => s.accel / 21], ["Handling", (s) => (s.grip / 42) * 0.6 + (s.response / 11) * 0.4],
  ["Drift grip", (s) => (s.driftGrip - 0.75) / 0.5], ["Boost duration", (s) => s.boostDur / 1.5]];
// real-feeling numbers for the garage: top speed and 0-100 km/h from the same acceleration and drag formula the
// physics uses (accel x (1 - (v/vmax)^2) minus air drag), integrated on a flat straight
function perfNumbers(def, up) {
  const s = carSpec(def, up || {});
  let v = 0, t = 0, t100 = 0;
  for (let k = 0; k < 60 * 60; k++) { const a = s.accel * Math.max(0, 1 - (v / s.vmax) ** 2) - 0.0009 * v * v; v += a / 60; t += 1 / 60; if (!t100 && v >= 100 / 3.6) t100 = t; }
  return { top: Math.round(v * 3.6), t100 };
}
function statsHTML(def, up) {
  const base = carSpec(def, {}), cur = carSpec(def, up || {});
  return STAT_KEYS.map(([n, f]) => `<span>${n}</span><span class="sbar"><b style="width:${Math.min(100, f(cur) * 100)}%"></b><i style="width:${Math.min(100, f(base) * 100)}%"></i></span>`).join("");
}
function refreshGarage() {
  const def = carById(G.garageCar), cs = carSave(def.id), owned = save.owned.includes(def.id);
  if (!G.car || G.car.def !== def.id) { buildPlayer(def.id); G.car.def = def.id; }
  $("carName").innerHTML = `${def.name} <span class="cls cls-${def.cls.toLowerCase()}">${def.cls}</span>`;
  const prize = EVENTS.find((e) => e.unlock && e.unlock.car === def.id);
  $("carBlurb").textContent = def.blurb + (prize && !owned ? ` Or win it free in Career: ${prize.name}.` : "");
  $("stats").innerHTML = statsHTML(def, cs.upgrades);
  const pn = perfNumbers(def, cs.upgrades);
  $("perfLine").textContent = `Top speed ${pn.top} km/h · 0-100 km/h ${pn.t100.toFixed(1)} s · ${def.engine === "electric" ? "electric" : def.engine.toUpperCase().replace("FLAT6", "flat-6")}`;
  const act = $("carAction");
  if (!owned) {
    const gems = def.gems || 0, cost = gems ? gems + " gems" : def.price.toLocaleString("en-GB") + " coins";
    act.textContent = "Buy · " + cost; act.disabled = gems ? save.gems < gems : save.coins < def.price;
  } else if (save.car === def.id) { act.textContent = "Selected"; act.disabled = true; }
  else { act.textContent = "Select this car"; act.disabled = false; }
  $("tabUp").disabled = !owned;
  buildPaints(); buildRims(); buildDecals(); buildUpgrades();
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
  const order = GARAGE_ORDER(), i = (order.findIndex((c) => c.id === G.garageCar) + dir + order.length) % order.length;
  G.garageCar = order[i].id; sfx.click(); refreshGarage();
}
$("carPrev").addEventListener("click", () => cycleCar(-1));
$("carNext").addEventListener("click", () => cycleCar(1));
$("carAction").addEventListener("click", () => {
  const def = carById(G.garageCar);
  if (!save.owned.includes(def.id)) {
    if (def.gems) { if (save.gems < def.gems) return; save.gems -= def.gems; }
    else { if (save.coins < def.price) return; save.coins -= def.price; }
    save.owned.push(def.id); toast(def.name + " is yours!");
    if (CARS.every((c) => save.owned.includes(c.id))) trophy("garage");
  }
  save.car = def.id; writeSave(); sfx.chime(); refreshGarage();
});
function tabs(ids, panels) {
  ids.forEach((id, i) => $(id).addEventListener("click", () => {
    sfx.click(); ids.forEach((o, j) => { $(o).setAttribute("aria-pressed", String(i === j)); $(panels[j]).hidden = i !== j; });
  }));
}
tabs(["tabPaint", "tabRims", "tabDecal", "tabUp"], ["panelPaint", "panelRims", "panelDecal", "panelUp"]);
const DECAL_COST = 400;
function buildDecals() {
  const el = $("decals"); el.innerHTML = ""; const cs = carSave(G.garageCar);
  cs.decalsOwned = cs.decalsOwned || [0];
  DECALS.forEach((d, i) => {
    const have = cs.decalsOwned.includes(i);
    const b = document.createElement("button"); b.type = "button"; b.className = "chipbtn"; b.id = "decal" + i;
    b.textContent = have ? d.name : `${d.name} · ${DECAL_COST}`; b.setAttribute("aria-pressed", String(i === (cs.decal || 0)));
    b.disabled = !have && save.coins < DECAL_COST;
    b.addEventListener("click", () => {
      if (!have) { if (save.coins < DECAL_COST) return; save.coins -= DECAL_COST; cs.decalsOwned.push(i); }
      sfx.click(); cs.decal = i; setDecal(G.car, i, PAINTS[cs.paint % PAINTS.length].hex); writeSave(); buildDecals(); refreshLobby();
    });
    el.appendChild(b);
  });
  // livery colour for the stripes / number (free)
  const lv = $("liveries"); lv.innerHTML = "";
  LIVERY.forEach((l, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chipbtn"; b.id = "livery" + i; b.textContent = l.name;
    if (l.hex != null) b.style.borderColor = "#" + l.hex.toString(16).padStart(6, "0");
    b.setAttribute("aria-pressed", String(i === (cs.livery || 0)));
    b.addEventListener("click", () => { sfx.click(); cs.livery = i; setDecal(G.car, cs.decal || 0, PAINTS[cs.paint % PAINTS.length].hex, i); writeSave(); buildDecals(); });
    lv.appendChild(b);
  });
}
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
      sfx.click(); cs.paint = i; G.car.paint.color.setHex(p.hex); setDecal(G.car, cs.decal || 0, p.hex); setFinish(G.car, cs.finish || 0, p.hex);
      [...el.children].forEach((c, j) => c.setAttribute("aria-pressed", String(j === i)));
      $("paintName").textContent = p.name; writeSave();
    });
    el.appendChild(b);
  });
  $("paintName").textContent = PAINTS[cs.paint % PAINTS.length].name;
  // finishes and boost flame colours: the first of each is free, the rest are bought once per car
  const chips = (elId, list, ownedKey, curKey, cost, apply) => {
    const box = $(elId); box.innerHTML = ""; cs[ownedKey] = cs[ownedKey] || [0];
    list.forEach((f, i) => {
      const have = cs[ownedKey].includes(i), b = document.createElement("button"); b.type = "button"; b.className = "chipbtn"; b.id = elId + i;
      b.textContent = have ? f.name : `${f.name} · ${cost}`; b.setAttribute("aria-pressed", String(i === (cs[curKey] || 0))); b.disabled = !have && save.coins < cost;
      if (f.hex) b.style.borderColor = "#" + f.hex.toString(16).padStart(6, "0");
      b.addEventListener("click", () => {
        if (!have) { if (save.coins < cost) return; save.coins -= cost; cs[ownedKey].push(i); }
        sfx.click(); cs[curKey] = i; apply(i); writeSave(); buildPaints(); refreshLobby();
      });
      box.appendChild(b);
    });
  };
  chips("finishes", FINISHES, "finishOwned", "finish", 600, (i) => setFinish(G.car, i, PAINTS[cs.paint % PAINTS.length].hex));
  chips("trails", TRAILS, "trailOwned", "trail", 500, (i) => { setTrail(G.car, i); G.trailShow = 2.5; });
}

function startRace() {
  sfx.startAudio(); sfx.click(); if (G.photo) endPhoto();
  if (G.car.def && G.car.def !== save.car) buildPlayer();
  G.mode = "countdown";
  scene.add(G.car.group); setDoors(G.car, 0); G.doors = 0;
  const ev = G.event, solo = ev ? ev.type === "trial" || ev.type === "drift" || ev.type === "attack" : G.trial;
  if (G.boss) { G.boss.model.group.removeFromParent(); G.boss = null; }
  if (G.p2) { G.p2.model.group.removeFromParent(); G.p2 = null; }
  G.splitRace = !!G.split && !ev && !G.trial && canSplit(); input.split = G.splitRace;
  G.field = solo ? [] : ev && ev.type === "h2h" ? G.rivals.filter((r) => r.name === ev.rival) : ev && ev.type === "boss" ? [(G.boss = makeBoss(ev))] : G.splitRace ? [(G.p2 = makeP2()), ...G.rivals.slice(0, 5)] : G.rivals;
  G.realRace = !trialMode() && G.field.length > 0;
  for (const r of G.rivals) r.model.group.visible = G.field.includes(r);
  G.elimDone = 0; G.eliminated = false; G.attackShown = -1;
  if (ev && ev.type === "boss") setTimeout(() => toast("BOSS BATTLE · " + ev.desc.split(".")[0], 3200), 300);
  if (!G.ghost) { G.ghost = new Ghost(makeCar(CARS[0], 0xffffff)); scene.add(G.ghost.model.group); }
  save.ghosts = save.ghosts || {};
  G.ghost.load(trialMode() ? save.ghosts[G.track.id] : null); G.ghost.startLap();
  // a friend's ghost (pasted as a code) races too, in orange
  if (!G.friend) { G.friend = new Ghost(makeCar(CARS[0], 0xffffff), 0xffa24c); scene.add(G.friend.model.group); }
  const fg = (save.friendGhosts || {})[G.track.id];
  G.friend.load(trialMode() && fg ? fg : null);
  if (trialMode() && fg) setTimeout(() => toast(`Racing ${fg.n}'s ghost · ${fmt(fg.t)}`, 2200), 600);
  $("eventTag").hidden = !ev;
  if (ev) $("eventTag").textContent = ev.name + " · " + ev.desc;
  gridUp(); if (G.p2) chase2.snap(G.p2.veh);
  [...SCREENS, "finish", "pause", "topbar"].forEach((id) => ($(id).hidden = true));
  setRaceUI(true); G.paused = false; minimap.setTrack(G.path);
  // each track has its own song; the menu plays a calmer version
  G.song = (TRACKS.findIndex((t) => t.id === baseId(G.track.id)) + (G.raceCount = (G.raceCount || 0) + 1)) % SONGS.length;
  setMusicMode("race", G.song); if (save.settings.sound && save.settings.music > 0) toast("♪ " + songName(), 1800);
  $("count").hidden = false; G.countT = 0; G.lastBeep = -1; G.launch = null; G.bog = 0;
  const f = $("fade"); f.classList.remove("out"); void f.offsetWidth; f.classList.add("out");
  G.tips = !save.tipsSeen && !TEST ? [[5, "Hold the left or right half of the screen to steer (or ← →). The car speeds up and brakes by itself."], [14, "Steer hard into a fast corner and the car drifts. Drifting fills the blue BOOST bar."]] : [];
}

function toMenu() {
  G.mode = "menu"; G.paused = false;
  // leave no special racers or split-screen behind (replays and the next race start clean)
  if (G.boss) { G.boss.model.group.removeFromParent(); G.boss = null; }
  if (G.p2) { G.p2.model.group.removeFromParent(); G.p2 = null; }
  G.splitRace = false; input.split = false; G.field = G.rivals;
  ["finish", "pause", "count"].forEach((id) => ($(id).hidden = true));
  setRaceUI(false); showroom.setCar(G.car);
  show("menu");
  gridUp();
}

function finishRace() {
  G.mode = "done";
  if (G.rocks && G.rocks.length) { G.path.hazards = G.path.hazards.filter((h) => h.type !== "rock"); G.rocks = []; }
  G.playerFinish = G.raceTime;
  const order = standings(), place = order.findIndex((e) => e.me) + 1;
  sfx.fanfare(place <= 3 && !G.eliminated);
  G.place = place;
  raceTrophies(place);
  const fastest = Math.min(...G.lapTimes);
  let html = `<div class="place">${ordinal(place)}<small> of ${order.length}</small></div>`;
  if (order.length >= 3) {
    const pod = [order[1], order[0], order[2]], hx = (c) => "#" + c.toString(16).padStart(6, "0");
    html += `<div class="podium">${pod.map((e, i) => `<div class="step s${[2, 1, 3][i]}${e.me ? " me" : ""}"><span class="who" style="--c:${hx(e.color)}">${e.name}</span><span class="blk">${[2, 1, 3][i]}</span></div>`).join("")}</div>`;
  }
  html += `<ol class="standings">`;
  const L = G.path.length;
  let prevT = 0;
  order.forEach((e, i) => {
    // cars still racing get an estimate from their average speed so far, kept in finishing order
    let t = e.finished;
    if (t == null) t = Math.max(prevT + 0.1, G.raceTime + Math.max(0.5, (laps() * L - e.veh.totalD) / Math.max(25, e.veh.totalD / Math.max(1, G.raceTime))));
    prevT = Math.max(prevT, t);
    const gap = (e.finished != null ? "" : "~") + fmt(t);
    html += `<li class="${e.me ? "me" : ""}"><span class="pos">${i + 1}</span><span class="sw" style="background:#${e.color.toString(16).padStart(6, "0")}"></span><span class="nm">${e.name}${e.boss ? ' <small class="sty boss">Boss</small>' : e.driver ? ` <small class="sty">${STYLE_NAMES[e.driver.style] || ""}</small>` : ""}</span><span class="tm">${gap}</span></li>`;
  });
  html += `</ol><div class="laps">Best lap <b>${fmt(fastest)}</b> · Record <b>${fmt(save.best[G.track.id])}</b></div>`;
  if (G.event) html = eventResult(place, fastest) + html;
  if (G.cup) html = cupResult(order) + html;
  const rw = raceRewards({ place, field: order.length, drift: G.totalDrift, cleanLaps: G.cleanLaps, record: G.newRecord, trial: G.trial, mult: G.track.mult || 1 });
  save.coins += rw.coins; save.gems += rw.gems; G.lastReward = rw;
  html += `<div class="reward">${rw.lines.map(([n, c]) => `<span>${n}</span><b>+${c}</b>`).join("")}<span class="tot">Total</span><b class="tot coin">+${rw.coins}</b>${rw.gems ? `<span>Gems</span><b class="gem">+${rw.gems}</b>` : ""}</div>`;
  $("results").innerHTML = html;
  writeSave();
  const ni = G.event && !G.event.daily ? EVENTS.indexOf(G.event) + 1 : -1, next = G.event && G.eventOk && ni > 0 ? EVENTS[ni] : null;
  const cupNext = G.cup && G.cup.i < G.cup.def.tracks.length - 1;
  $("nextBtn").hidden = !next && !cupNext;
  if (next) $("nextBtn").textContent = "Next: " + next.name;
  if (cupNext) $("nextBtn").textContent = "Next race: " + trackById(G.cup.def.tracks[G.cup.i + 1]).name;
  $("againBtn").hidden = !!G.cup;
  $("againBtn").textContent = G.event ? (G.eventOk ? "Replay event" : "Try again") : "Race again";
  $("againBtn").classList.toggle("ghost", !!next);
  if (G.event && G.eventOk && ni === EVENTS.length) setTimeout(() => toast("Career complete. You're the Apex champion!", 5000), 1600);
  setTimeout(() => { if (G.mode === "done") { setRaceUI(false); $("finish").hidden = false; } }, TEST ? 200 : 1400);
}

function eventResult(place, fastest) {
  const ev = G.event, rival = ev.type === "h2h" || ev.type === "boss" ? G.field[0] || G.boss : null;
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
      if (ev.type === "boss") { trophy("boss"); if (["b1", "b2", "b3"].every((id) => id === ev.id || (save.career[id] && save.career[id].done))) trophy("bosses"); }
      if (ev.daily) { save.dailyDone = (save.dailyDone || 0) + 1; if (save.dailyDone >= 3) trophy("daily3"); }
      if (ev.id === "c12") trophy("champ");
      if (ev.unlock && ev.unlock.car && !save.owned.includes(ev.unlock.car)) { save.owned.push(ev.unlock.car); extra += `<div class="evunlock">New car: <b>${carById(ev.unlock.car).name}</b></div>`; if (CARS.every((c) => save.owned.includes(c.id))) trophy("garage"); }
    }
    save.career[ev.id] = { done: true, stars: Math.max(res.stars, prev.stars || 0) };
  }
  G.eventOk = res.ok;
  const detail = ev.type === "drift" ? `Drift score ${Math.round(G.totalDrift)} / ${ev.target}` : ev.type === "trial" ? `Best lap ${fmt(fastest)} / target ${fmt(ev.target)}` : ev.desc;
  return `<div class="evhead ${res.ok ? "ok" : "fail"}"><div class="evname">${ev.name}</div><div class="evstate">${res.ok ? "Complete " + "★".repeat(res.stars) + "☆".repeat(3 - res.stars) : G.eliminated ? "Eliminated" : "Not this time"}</div><div class="hint">${detail}</div>${extra}</div>`;
}

function pause(on) {
  if (G.mode !== "race" && G.mode !== "countdown") return;
  if (!on && G.photo) endPhoto();
  G.paused = on; $("pause").hidden = !on;
}

// Photo mode (from pause): hide the HUD, orbit the camera around your car, save the picture to your device.
function startPhoto() {
  G.photo = { a: G.player.h + Math.PI + 0.6, e: 0.22, d: 7.5 };
  document.body.classList.add("photo"); $("pause").hidden = true; $("photoBar").hidden = false; sfx.click();
}
function endPhoto() { G.photo = null; document.body.classList.remove("photo"); $("photoBar").hidden = true; if (G.paused) $("pause").hidden = false; chase.ready = false; }
$("photoBtn").addEventListener("click", startPhoto);
$("photoDone").addEventListener("click", () => { sfx.click(); endPhoto(); });
$("photoSave").addEventListener("click", () => {
  world.render(null); // draw now so the canvas has the picture when we copy it
  world.renderer.domElement.toBlob((blob) => {
    if (!blob) { toast("Couldn't save the photo on this device.", 2000); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `apex-ring-${G.track.id.replace(":", "-")}.png`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("Photo saved", 1500); sfx.chime();
  }, "image/png");
});
{
  let drag = null, pinch = 0;
  const pts = new Map();
  addEventListener("pointerdown", (e) => { if (!G.photo || e.target.closest("#photoBar")) return; pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; });
  addEventListener("pointermove", (e) => {
    if (!G.photo || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (pinch) G.photo.d = Math.max(3, Math.min(25, G.photo.d * pinch / d)); pinch = d; return; }
    if (drag) { G.photo.a -= (e.clientX - drag[0]) * 0.008; G.photo.e = Math.max(0.02, Math.min(1.3, G.photo.e + (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; }
  });
  addEventListener("pointerup", (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) drag = null; });
  addEventListener("wheel", (e) => { if (G.photo) G.photo.d = Math.max(3, Math.min(25, G.photo.d * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: true });
}

$("startBtn").addEventListener("click", () => {
  if (G.cupMode) { if (!cupOpen(CUPS[G.cupIdx])) return; G.cup = { def: CUPS[G.cupIdx], i: 0, pts: {} }; startCupRace(); }
  else { G.cup = null; startRace(); }
});
$("raceBtn").addEventListener("click", () => show("setup"));
$("garageBtn").addEventListener("click", () => show("garage"));
$("helpBtn").addEventListener("click", () => show("help"));
$("helpBack").addEventListener("click", () => show("menu"));
$("settingsBtn").addEventListener("click", () => show("settings"));
$("careerBtn").addEventListener("click", () => show("career"));
$("careerBack").addEventListener("click", () => show("menu"));
const TYPE_LABEL = { race: "Race", trial: "Time trial", drift: "Drift", elim: "Elimination", h2h: "Head to head", attack: "Drift attack", boss: "Boss battle" };
// Career map: chapters by track difficulty, events as connected nodes; tap a node for details, then Start.
const TYPE_TAG = { race: "RACE", trial: "TIME", drift: "DRIFT", elim: "KO", h2h: "1v1", attack: "ATTACK", boss: "BOSS" };
function buildCareer() {
  const el = $("events"); el.innerHTML = "";
  let total = 0, chapter = null, row = null, next = null;
  // today's challenge sits above the chapters
  const daily = dailyEvent(), dst = save.career[daily.id];
  const dsec = document.createElement("div"); dsec.className = "chapter daily";
  dsec.innerHTML = `<div class="chh">Today</div>`;
  const db = document.createElement("button"); db.type = "button"; db.id = "ev-daily"; db.className = "event node daily t-" + daily.type + (dst && dst.done ? " done" : "");
  db.innerHTML = `<span class="nd">DAILY</span><span class="nn">${TYPE_LABEL[daily.type]}</span><span class="ns">${dst && dst.done ? "★".repeat(dst.stars) + "☆".repeat(3 - dst.stars) : "+900 · 1 gem"}</span>`;
  db.addEventListener("click", () => selectEvent(daily));
  dsec.appendChild(db); el.appendChild(dsec);
  EVENTS.forEach((ev, i) => {
    const st = save.career[ev.id], open = TEST || eventUnlocked(save, i); total += st ? st.stars : 0;
    if (open && !(st && st.done) && !next) next = ev;
    const ch = i === EVENTS.length - 1 ? "Final" : DIFFICULTY_NAMES[trackById(ev.track).difficulty || 1];
    if (ch !== chapter) {
      chapter = ch; const sec = document.createElement("div"); sec.className = "chapter";
      sec.innerHTML = `<div class="chh">${ch === "Final" ? "The Final" : "Chapter · " + ch}</div>`; row = document.createElement("div"); row.className = "nodes"; sec.appendChild(row); el.appendChild(sec);
    }
    const b = document.createElement("button"); b.type = "button"; b.id = "ev-" + ev.id;
    b.className = "event node t-" + ev.type + (st && st.done ? " done" : "") + (open ? "" : " lockd");
    b.disabled = !open;
    b.innerHTML = `<span class="nd">${open ? TYPE_TAG[ev.type] : "🔒"}</span><span class="nn">${ev.name.replace("Boss: ", "")}</span><span class="ns">${st ? "★".repeat(st.stars) + "☆".repeat(3 - st.stars) : open ? "☆☆☆" : ""}</span>`;
    b.addEventListener("click", () => selectEvent(ev));
    row.appendChild(b);
  });
  $("careerStars").textContent = total + " / " + EVENTS.length * 3 + " ★";
  // trophies at the bottom of the map
  const got = save.trophies || {}, tsec = document.createElement("div"); tsec.className = "chapter trophies";
  tsec.innerHTML = `<div class="chh">Trophies · ${TROPHIES.filter((t) => got[t.id]).length} / ${TROPHIES.length}</div><ul class="tlist">${TROPHIES.map((t) => `<li class="${got[t.id] ? "got" : ""}"><b>${got[t.id] ? "🏆" : "·"} ${t.name}</b><span>${t.desc}</span></li>`).join("")}</ul>`;
  el.appendChild(tsec);
  const st = save.stats || { races: 0, wins: 0, podiums: 0, km: 0, top: 0, drift: 0 }, ssec = document.createElement("div"); ssec.className = "chapter stats";
  ssec.innerHTML = `<div class="chh">Your stats</div><div class="statgrid">${[["Races", st.races], ["Wins", st.wins], ["Podiums", st.podiums], ["Distance", st.km.toFixed(1) + " km"], ["Top speed", Math.round(st.top) + " km/h"], ["Best drift", Math.round(st.drift).toLocaleString("en-GB")]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")}</div>`;
  el.appendChild(ssec);
  selectEvent(G.selEvent && (G.selEvent.daily || TEST || eventUnlocked(save, EVENTS.indexOf(G.selEvent))) ? G.selEvent : next || EVENTS[0], true);
}
function selectEvent(ev, quiet) {
  if (!quiet) sfx.click();
  G.selEvent = ev;
  document.querySelectorAll("#events .node").forEach((n) => n.classList.toggle("sel", n.id === "ev-" + (ev.daily ? "daily" : ev.id)));
  $("evDetail").hidden = false;
  $("evDName").textContent = ev.name;
  $("evDDesc").textContent = ev.daily ? `${ev.desc} New challenge every day.` : `${TYPE_LABEL[ev.type]} · ${trackById(ev.track).name}${ev.type === "attack" ? ` · ${ev.time} s` : ` · ${ev.laps} laps`}. ${ev.desc}`;
  const st = save.career[ev.id], r = ev.reward;
  $("evDReward").innerHTML = st && st.done ? `Best: <b>${"★".repeat(st.stars)}${"☆".repeat(3 - st.stars)}</b>` : `Reward <b>+${(r.coins || 0).toLocaleString("en-GB")}</b>${r.gems ? ` <b class="gem">+${r.gems} gems</b>` : ""}${ev.unlock && ev.unlock.car ? ` · wins the <b>${carById(ev.unlock.car).name}</b>` : ""}`;
  $("evGo").textContent = st && st.done ? "Replay event" : "Start event";
}
$("evGo").addEventListener("click", () => { if (G.selEvent) startEvent(G.selEvent); });
function startEvent(ev) {
  G.event = ev;
  // events set their own weather and time of day (dry daytime unless they say otherwise)
  const base = THEMES[trackById(ev.track).theme], evWeather = base.rain ? "rain" : ev.weather || "dry", evNight = ev.time === "night" || !!base.stars;
  if (G.track.id !== ev.track || G.weather !== evWeather || G.night !== evNight) {
    const keep = save.track, wt = G.wantTime; G.wantTime = ev.time || "day"; loadTrack(ev.track, evWeather); G.wantTime = wt; save.track = keep;
  }
  startRace();
}
["setupBack", "garageBack", "settingsBack"].forEach((id) => $(id).addEventListener("click", () => show("menu")));
function setMode(trial, cup = false) {
  G.trial = trial; G.cupMode = cup;
  $("modeRace").setAttribute("aria-pressed", String(!trial && !cup)); $("modeTrial").setAttribute("aria-pressed", String(trial)); $("modeCup").setAttribute("aria-pressed", String(cup));
  $("cupPick").hidden = !cup; $("trackPick").hidden = cup; ["layoutTabs", "board"].forEach((id) => ($(id).hidden = cup));
  if (cup) refreshCup();
  refreshLock();
}
// ---------- cups ----------
G.cupIdx = 0;
const cupOpen = (c) => TEST || c.tracks.every((t) => trackUnlocked(save, baseId(t)));
function refreshCup() {
  const c = CUPS[G.cupIdx], best = (save.cups || {})[c.id];
  $("cupName").textContent = c.name + (best ? ` · best ${ordinal(best)}` : "");
  $("cupTracks").textContent = c.tracks.map((t) => trackById(t).name).join(" → ") + ` · prize ${c.reward.coins.toLocaleString("en-GB")} coins` + (cupOpen(c) ? "" : " · unlock its tracks in Career");
}
$("modeCup").addEventListener("click", () => { sfx.click(); setMode(false, true); });
$("cupPrev").addEventListener("click", () => { sfx.click(); G.cupIdx = (G.cupIdx + CUPS.length - 1) % CUPS.length; refreshCup(); refreshLock(); });
$("cupNext").addEventListener("click", () => { sfx.click(); G.cupIdx = (G.cupIdx + 1) % CUPS.length; refreshCup(); refreshLock(); });
function startCupRace() {
  const c = G.cup.def, id = c.tracks[G.cup.i];
  const keep = save.track, wt = G.wantTime; G.wantTime = "day"; loadTrack(id, "dry"); G.wantTime = wt; save.track = keep;
  startRace();
}
// points after each cup race; returns the standings table HTML (and pays the prize after the last race)
function cupResult(order) {
  const C = G.cup;
  order.forEach((e, i) => { C.pts[e.name] = (C.pts[e.name] || 0) + (CUP_POINTS[i] || 0); });
  const table = Object.entries(C.pts).sort((a, b) => b[1] - a[1]);
  const last = C.i >= C.def.tracks.length - 1, myPos = table.findIndex(([n]) => n === "You") + 1;
  let html = `<div class="cuphead">${C.def.name} · race ${C.i + 1} of ${C.def.tracks.length}</div><table class="cuptable">${table.map(([n, p], i) => `<tr class="${n === "You" ? "me" : ""}"><td>${i + 1}</td><td>${n}</td><td>${p}</td></tr>`).join("")}</table>`;
  if (last) {
    const r = C.def.reward, k = myPos === 1 ? 1 : myPos <= 3 ? 0.5 : 0;
    save.cups = save.cups || {}; save.cups[C.def.id] = Math.min(save.cups[C.def.id] || 99, myPos);
    if (k) { save.coins += Math.round(r.coins * k); if (myPos === 1) save.gems += r.gems; }
    html += `<div class="evhead ${myPos <= 3 ? "ok" : "fail"}"><div class="evname">${myPos === 1 ? "Cup winner!" : "Cup finished " + ordinal(myPos)}</div>${k ? `<div class="evreward">Cup prize <b>+${Math.round(r.coins * k).toLocaleString("en-GB")}</b>${myPos === 1 ? ` <b class="gem">+${r.gems} gems</b>` : ""}</div>` : ""}</div>`;
    if (myPos === 1) trophy("cup");
  }
  return html;
}
$("modeRace").addEventListener("click", () => { sfx.click(); setMode(false); });
$("modeTrial").addEventListener("click", () => { sfx.click(); setMode(true); });

// ---------- settings ----------
function refreshSettings() {
  $("versionV").textContent = `Apex Ring v${VERSION} · ${BUILD.replace("·", " · ")}`;
  document.querySelectorAll("#qualityTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === world.qname)));
  document.querySelectorAll("#camTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === chase.mode)));
  document.querySelectorAll("#soundTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.s === "1") === save.settings.sound)));
  $("musicVol").value = save.settings.music ?? 0.6;
  applyDrive(); applyBand(); applyFx();
  const tiltMode = input.tiltOn;
  document.querySelectorAll("#ctrlTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.m === "tilt") === tiltMode)));
  $("tiltOpts").hidden = !tiltMode; $("tiltSens").value = tiltCfg.sens;
  document.querySelectorAll("#assistTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.a === (save.settings.assist || "auto"))));
  document.querySelectorAll("#lineTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === (save.settings.line || "auto"))));
  document.querySelectorAll("#diffTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.d === (save.settings.difficulty || "easy"))));
}
document.querySelectorAll("#qualityTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.quality = b.dataset.q; world.applyQuality(b.dataset.q); writeSave(); refreshSettings(); }));
document.querySelectorAll("#camTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); setCam(b.dataset.c); refreshSettings(); }));
document.querySelectorAll("#soundTabs .tab").forEach((b) => b.addEventListener("click", () => { if ((b.dataset.s === "1") !== save.settings.sound) $("muteBtn").click(); sfx.click(); refreshSettings(); }));
document.querySelectorAll("#diffTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.difficulty = b.dataset.d; writeSave(); applyAids(); refreshSettings(); }));
document.querySelectorAll("#assistTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.assist = b.dataset.a; writeSave(); refreshSettings(); }));
document.querySelectorAll("#lineTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.line = b.dataset.l; writeSave(); applyAids(); refreshSettings(); }));
$("resetBtn").addEventListener("click", () => {
  if (!TEST && !confirm("Reset all progress? Coins, cars, upgrades and records will be wiped.")) return;
  resetSave(); G.garageCar = null; buildPlayer(); sfx.setMuted(false); $("muteBtn").textContent = "♪ On";
  applyDrive(); setCam("chase"); setMusicVolume(save.settings.music ?? 0.6); toast("Progress reset."); show("menu");
});
$("againBtn").addEventListener("click", startRace);
$("nextBtn").addEventListener("click", () => { if (G.cup) { G.cup.i++; startCupRace(); return; } const i = EVENTS.indexOf(G.event); if (i >= 0 && EVENTS[i + 1]) startEvent(EVENTS[i + 1]); });
$("menuBtn").addEventListener("click", () => { const ev = G.event; G.cup = null; $("againBtn").hidden = false; toMenu(); if (ev) show("career"); });
// share a one-line result through the phone's share sheet, or copy it (nothing is sent anywhere by the game)
$("shareBtn").addEventListener("click", async () => {
  const best = Math.min(...G.lapTimes);
  const text = `${G.event ? G.event.name + ": " : ""}I finished ${ordinal(G.place || 1)} at ${G.track.name}${G.weather === "rain" ? " in the rain" : ""}${G.night ? " at night" : ""} in Apex Ring` + (isFinite(best) ? `, best lap ${fmt(best)}` : "") + `, driving the ${carById(save.car).name}.`;
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (_) { return; }
  try { await navigator.clipboard.writeText(text); toast("Result copied: paste it anywhere", 2000); } catch (_) { toast(text, 4000); }
});
$("pauseBtn").addEventListener("click", () => pause(true));
$("resumeBtn").addEventListener("click", () => { sfx.click(); pause(false); });
$("restartBtn").addEventListener("click", startRace);
$("quitBtn").addEventListener("click", () => { G.cup = null; $("againBtn").hidden = false; toMenu(); });
$("muteBtn").addEventListener("click", () => {
  save.settings.sound = !save.settings.sound; sfx.setMuted(!save.settings.sound); writeSave();
  $("muteBtn").textContent = save.settings.sound ? "♪ On" : "♪ Off";
});
setMusicVolume(save.settings.music ?? 0.6);
$("musicVol").addEventListener("input", (e) => { save.settings.music = Number(e.target.value); setMusicVolume(save.settings.music); writeSave(); });
// ---------- tilt controls ----------
tiltCfg.zero = save.settings.tiltZero || 0; tiltCfg.sens = save.settings.tiltSens || 1;
async function useControls(mode) {
  if (mode === "tilt") {
    const ok = await setTilt(true, toast);
    if (!ok) mode = "touch";
  } else await setTilt(false, toast);
  save.settings.controls = mode; writeSave();
  $("tiltBtn").hidden = mode !== "tilt";
  refreshSettings();
  return mode;
}
function calibrate() {
  save.settings.tiltZero = calibrateTilt(); writeSave();
  toast("Straight ahead set. Hold the phone like this to drive straight.", 2200);
}
$("tiltBtn").addEventListener("click", calibrate);
$("calBtn").addEventListener("click", calibrate);
$("tiltSens").addEventListener("input", (e) => { tiltCfg.sens = Number(e.target.value); save.settings.tiltSens = tiltCfg.sens; writeSave(); });
document.querySelectorAll("#ctrlTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); useControls(b.dataset.m); }));
// tilt needs a tap before some browsers allow the sensor, so re-enable it on the first tap after loading
if (save.settings.controls === "tilt") addEventListener("pointerdown", function once() { removeEventListener("pointerdown", once); useControls("tilt"); });

$("respawnBtn").addEventListener("click", () => { if (G.mode === "race") G.player.respawn(); });
bindZones($("zoneL"), $("zoneR"));
bindPads($("proPads"));
// Pro driving: manual throttle, brake and handbrake; touch gets on-screen pedals instead of the half-screen zones
function applyDrive() {
  const pro = save.settings.drive === "pro"; input.pro = pro;
  document.querySelectorAll("#driveTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.d === "pro") === pro)));
  $("driveHint").textContent = pro ? "Pro: you drive. ↑/W accelerate, ↓/S brake, Space handbrake (drift), Shift boost. On touch: pedals on screen. No auto-brake." : "Casual: the car speeds up, brakes and drifts by itself; you steer and boost.";
}
document.querySelectorAll("#driveTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.drive = b.dataset.d; writeSave(); applyDrive(); }));
// comfort: camera shake and speed lines can be turned off (off by default if the phone asks for reduced motion)
function fxOn() { const f = save.settings.fx || (matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "on"); return f === "on"; }
function applyFx() { document.querySelectorAll("#fxTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.f === "on") === fxOn()))); }
document.querySelectorAll("#fxTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.fx = b.dataset.f; writeSave(); applyFx(); }));
function applyBand() { document.querySelectorAll("#bandTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.b === (save.settings.catchup || "normal")))); }
document.querySelectorAll("#bandTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.catchup = b.dataset.b; writeSave(); applyBand(); }));
applyBand();
applyDrive();
// cameras: high chase, low chase (cinematic, close behind), bonnet
function setCam(m) { chase.mode = m; save.settings.camera = m; writeSave(); $("camBtn").textContent = "Cam " + (CAMS.indexOf(m) + 1); chase.ready = false; }
$("camBtn").addEventListener("click", () => setCam(CAMS[(CAMS.indexOf(chase.mode) + 1) % CAMS.length]));
$("camBtn").textContent = "Cam " + (CAMS.indexOf(chase.mode) + 1);
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

// Driver aids follow the settings; "auto" means on when rivals are on Easy.
function applyAids() { const m = G.track && world.trackGroup && world.trackGroup.getObjectByName("racingLine"); if (m) m.visible = aidOn("line"); }
// steering assist strength: Auto follows the difficulty (full on Easy, lighter on Medium, off on Hard)
function assistLevel() { const v = save.settings.assist || "auto"; return v === "on" ? 0.55 : v === "off" || save.settings.drive === "pro" ? 0 : AUTO_ASSIST[save.settings.difficulty || "easy"] || 0; }
function aidOn(key) { const v = save.settings[key] || "auto"; return v === "on" || (v === "auto" && (save.settings.difficulty || "easy") === "easy"); }

function stepRivals(dt) {
  const cars = [G.player, ...G.field.map((r) => r.veh)], L = G.path.length;
  for (const r of G.field) {
    const done = r.finished != null;
    if (r.human) {
      // player 2: same casual driving aids as player 1 (auto throttle/brake, steering assist by difficulty)
      const c2 = readControls2(), aid = assistLevel(), v2 = r.veh;
      const s2 = smoothSteer(r.touch, c2.steer, v2.vF, v2.spec.vmax, dt);
      v2.ctl.steer = G.mode === "race" ? assistSteer(v2, G.path, s2, aid) : 0;
      v2.ctl.targetSpeed = cornerSpeed(v2, G.path, AUTO_BRAKE[save.settings.difficulty] || 1, aid ? 1 : 0);
      if (c2.boost && G.mode === "race") v2.ctl.boost = true;
      v2.step(dt, G.mode === "race");
      if (!done && v2.totalD >= laps() * L) r.finished = G.raceTime;
      continue;
    }
    r.driver.think(dt, cars, r.veh.totalD - G.player.totalD);
    if (done) r.veh.ctl.targetSpeed = Math.min(r.veh.ctl.targetSpeed, 30);
    r.veh.step(dt, true);
    if (!done && r.veh.totalD >= laps() * L) r.finished = G.raceTime;
  }
}

// Name tags over the nearest rivals ahead, projected from 3D.
const tagPos = new THREE.Vector3();
function drawTags() {
  const tags = $("tags"); if (!G.tagEls) G.tagEls = [];
  tags.hidden = !!G.splitRace || G.mode !== "race" && G.mode !== "done"; if (G.splitRace) return;
  const v = G.player, near = G.field.filter((r) => { const dd = r.veh.totalD - v.totalD; return dd > 4 && dd < 70; }).slice(0, 3);
  while (G.tagEls.length < near.length) { const e = document.createElement("div"); e.className = "tag"; tags.appendChild(e); G.tagEls.push(e); }
  G.tagEls.forEach((e, i) => {
    const r = near[i];
    if (!r || G.mode !== "race") { e.hidden = true; return; }
    tagPos.set(r.veh.x, r.veh.y + 1.8, r.veh.z).project(camera);
    if (tagPos.z > 1) { e.hidden = true; return; }
    e.hidden = false;
    e.style.transform = `translate(${(tagPos.x * 0.5 + 0.5) * innerWidth}px, ${(-tagPos.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    if (e._n !== r.name) { e._n = r.name; e.textContent = r.name.split(" ")[0]; e.style.borderColor = "#" + r.color.toString(16).padStart(6, "0"); }
  });
}

function popDrift(n, label = "DRIFT +") {
  const el = $("driftPop"); el.textContent = label + n; el.hidden = false; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  clearTimeout(popDrift._t); popDrift._t = setTimeout(() => (el.hidden = true), 1200);
}

// ---------- simulation ----------
const lookAt = new THREE.Vector3(), camPos = new THREE.Vector3();

function step(dt) {
  if (G.paused) { readControls(false); return; } // still read the gamepad, so its Start button can unpause
  if (G.mode === "replay") return;
  const ctl = readControls();

  if (G.mode === "countdown") {
    G.countT += dt;
    const c = G.countT;
    [$("l1"), $("l2"), $("l3")].forEach((l, i) => { l.className = "lamp" + (c >= 4 ? " green" : c >= 1 + i ? " red" : ""); });
    $("countV").textContent = c < 1 ? "" : c < 4 ? String(3 - Math.floor(c - 1)) : "GO";
    const b = Math.floor(c); if (b !== G.lastBeep && b >= 1 && b <= 4) { G.lastBeep = b; sfx.beep(b === 4); }
    // launch control: boost in the last moment before green for a perfect start; too early and you bog down
    if (ctl.boost && c > 3.55 && c < 4 && G.launch !== "early") G.launch = "perfect";
    else if (ctl.boost && c > 2.6 && c <= 3.55) G.launch = "early";
    if (c >= 4) {
      G.mode = "race";
      const v = G.player;
      if (G.launch === "perfect") { v.vx += Math.sin(v.h) * 22; v.vz += Math.cos(v.h) * 22; toast("Perfect start!", 1500); sfx.whoosh(); }
      else if (G.launch === "early") { G.bog = 0.8; toast("Too early: wheelspin!", 1500); }
      G.launch = null;
    }
  }
  if (G.mode === "race" && G.countT < 5) { G.countT += dt; if (G.countT >= 5) $("count").hidden = true; }

  const v = G.player, racing = G.mode === "race";
  const ap = AUTOPILOT && racing ? autopilot(v) : null;
  const aid = assistLevel();
  const steerIn = input.tiltOn ? ctl.steer : smoothSteer(G.touch || (G.touch = {}), ctl.steer, v.vF, v.spec.vmax, dt);
  v.ctl.steer = ap ? ap.steer : racing ? assistSteer(v, G.path, steerIn, aid) : steerIn;
  if (racing && ctl.boost) { v.ctl.boost = true; if (v.boost <= 0.12) toast("Boost is empty: drift to fill it.", 1400); }
  v.ctl.targetSpeed = ap ? ap.targetSpeed : cornerSpeed(v, G.path, AUTO_BRAKE[save.settings.difficulty] || 1, aid ? 1 : 0);
  v.ctl.pro = !ap && save.settings.drive === "pro";
  v.ctl.throttle = ctl.throttle; v.ctl.brake = ctl.brake; v.ctl.handbrake = ctl.handbrake;
  if (G.bog > 0) { G.bog -= dt; v.ctl.targetSpeed = Math.min(v.ctl.targetSpeed, 4); }
  if (G.mode === "race" || G.mode === "done") {
    v.step(dt, racing);
    stepRivals(dt);
    collide([v, ...G.field.map((r) => r.veh)], (a, b, k) => { if (k > 3 && (a === v || b === v)) { chase.shake = Math.min(0.6, k * 0.04); sfx.thud(k); } });
    v.draft = 1;
    for (const r of G.field) { const dd = r.veh.totalD - v.totalD; if (dd > 6 && dd < 35 && Math.abs(r.veh.lat - v.lat) < 2.4) v.draft = 1.045; }
    // slipstream meter: tuck in behind a rival to fill it; when full you get a free slingshot burst
    if (racing) {
      G.draftM = Math.max(0, Math.min(1, (G.draftM || 0) + (v.draft > 1 ? dt / 2.2 : -dt * 0.5)));
      if (G.draftM >= 1) { G.draftM = 0; v.slingT = 1.3; toast("Slingshot!", 1100); sfx.whoosh(); trophy("sling"); }
    }
  }

  if (racing) {
    // drift points: build while sliding, banked when the slide ends
    // drift points build while sliding and are banked when the slide ends; linking drifts within 1.5 s of each
    // other raises a multiplier (up to x5), and a wall hit mid-drift loses the drift and the chain
    if (v.driftTime > 0.25) {
      if (G.driftPts === 0) G.mult = G.raceTime - (G.lastBank ?? -9) < 1.5 ? Math.min(5, (G.mult || 1) + 1) : 1;
      G.driftPts += dt * v.vF * Math.abs(v.driftAngle) * 6; G.driftShow = 1.5;
      if (v.wallHit > 2) { G.driftPts = 0; G.mult = 1; G.lastBank = -9; popDrift("", "DRIFT LOST"); }
    } else if (G.driftPts > 0 && v.driftTime === 0) {
      if (G.driftPts > 20) { const pts = Math.round(G.driftPts * (G.mult || 1)); G.totalDrift += pts; G.bestDrift = Math.max(G.bestDrift || 0, pts); if (pts >= 1000) trophy("drift1k"); if (G.mult >= 5) trophy("combo5"); popDrift(pts + (G.mult > 1 ? "  x" + G.mult : ""), "DRIFT +"); sfx.chime(); G.lastBank = G.raceTime; }
      G.driftPts = 0;
    }
    if (v.boosting && !G.wasBoosting) { sfx.whoosh(); const f = $("boostFlash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
    // first time the meter has charge, explain how to boost
    if (v.boost > 0.3 && !save.boostHint && !TEST) {
      save.boostHint = true; writeSave();
      toast(matchMedia("(pointer: coarse)").matches ? "Boost ready! Tap BOTH sides of the screen together, twice." : "Boost ready! Press Space.", 4500);
    }
    G.wasBoosting = v.boosting;
    G.raceTime += dt;
    const L = G.path.length, done = G.lapTimes.length;
    if (trialMode() && v.totalD >= done * L) G.ghost.record(G.raceTime - G.lapStart, v);
    if (v.totalD >= (done + 1) * L) {
      const lap = G.raceTime - G.lapStart; G.lapTimes.push(lap); G.lapStart = G.raceTime;
      if (trialMode()) {
        const rec = G.ghost.lapDone(lap), old = save.ghosts[G.track.id];
        // the very first lap starts behind the line, so only keep it if there's nothing better
        if (!old || lap < old.t) { save.ghosts[G.track.id] = rec; G.ghost.load(rec); }
      }
      logLap(G.track.id, lap);
      const best = save.best[G.track.id];
      if (G.lapWall === 0) G.cleanLaps++;
      G.lapWall = 0;
      if (best == null || lap < best) { if (best != null) G.newRecord = true; save.best[G.track.id] = lap; writeSave(); if (G.lapTimes.length < laps()) toast("New best lap · " + fmt(lap), 1800); }
      if (G.lapTimes.length >= laps()) finishRace(); else sfx.lapChime();
    }
    if (G.event && G.event.type === "elim" && G.mode === "race") { if (G.event.every) { if (G.raceTime >= (G.elimDone + 1) * G.event.every) { G.elimDone++; dropLast(G.event.every + " seconds"); } } else eliminate(); }
    stepRocks(dt);
    if (G.event && G.event.type === "attack" && G.mode === "race") {
      const left = Math.max(0, G.event.time - G.raceTime);
      const t = Math.ceil(left), shown = t * 1e6 + Math.round(G.totalDrift);
      if (shown !== G.attackShown) { G.attackShown = shown; $("eventTag").textContent = `${G.event.name} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} · ${Math.round(G.totalDrift).toLocaleString("en-GB")} pts`; }
      if (left <= 0) { if (G.driftPts > 20) G.totalDrift += Math.round(G.driftPts * (G.mult || 1)); G.driftPts = 0; finishRace(); }
    }
    if (G.tips && G.tips.length && G.raceTime > G.tips[0][0] - 4) { toast(G.tips.shift()[1], 5000); if (!G.tips.length) { save.tipsSeen = true; writeSave(); } }
  }
  // big jumps top up the boost meter
  if (v.airDone >= 2 && G.mode === "race") trophy("air2");
  if (v.airDone > 0.7 && G.mode === "race") { v.boost = Math.min(1, v.boost + Math.min(0.3, v.airDone * 0.12)); popDrift(v.airDone.toFixed(1) + "s", "BIG AIR "); sfx.chime(); G.airPops = (G.airPops || 0) + 1; }
  if (v.landed > 4) G.squash = Math.min(0.14, v.landed * 0.012);
  if (v.landed > 4) { chase.shake = Math.min(0.8, v.landed * 0.05); sfx.thud(v.landed); }
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
  dropLast("lap");
}
function dropLast(per) {
  const order = standings(), last = order[order.length - 1];
  if (last.me) { G.eliminated = true; toast(`You're out! Last place drops out every ${per}.`, 2500); finishRace(); return; }
  last.out = true; last.model.group.visible = false; last.veh.reset(-2000, 0);
  G.field = G.field.filter((r) => r !== last);
  toast(last.name + " is out!", 1800); sfx.thud(4);
  if (!G.field.length) { toast("Last one standing!", 2000); finishRace(); } // knockout won
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

// brake lights flare when a car slows hard (auto-brake, Pro brake, or lifting into a corner)
function brakeLights(m, v) { if (!m.tailMat) return; const want = v.lonAcc < -4 ? 3.4 : 1.1; m.tailMat.emissiveIntensity += (want - m.tailMat.emissiveIntensity) * 0.3; }

// nose follows the climb / fall (pitch), smoothed so landings don't snap
function pitchOf(v) { const target = -Math.atan2(v.vy || 0, Math.max(10, v.vF)) * 0.8; v.pitchS = (v.pitchS || 0) + (target - (v.pitchS || 0)) * 0.2; return v.pitchS; }

function poseCar(m, v, dt) {
  // cheap level of detail: far-away rivals drop their small parts
  const dx = v.x - camera.position.x, dz = v.z - camera.position.z, far = dx * dx + dz * dz > 110 * 110;
  if (far !== m.far) { m.far = far; m.body.children.forEach((c, i) => { if (i > 2 && c !== m.tailMesh) c.visible = !far; }); m.wheels.forEach((w) => (w.parent.visible = !far)); }
  updateFlames(m, v.boosting, performance.now() / 1000);
  m.group.position.set(v.x, v.y, v.z); m.group.rotation.set(pitchOf(v), v.h, 0, "YXZ");
  updateContactShadow(m, v.y, v.groundPrev ?? v.y); brakeLights(m, v); if (!far) wheelBlur(m, v.vF);
  m.body.rotation.z = clamp(-v.latAcc * 0.0035, -0.06, 0.06); m.body.rotation.x = clamp(-v.lonAcc * 0.002, -0.03, 0.03);
  m.wheels.forEach((w) => (w.rotation.x += v.vF * dt / 0.36)); m.steerers.forEach((p) => (p.rotation.y = -v.steer * 0.4));
}

function render(dt) {
  const v = G.player, car = G.car;
  if (G.mode === "replay" && G.replay) {
    // puppet the player's car along the recorded lap
    G.replayT = (G.replayT + dt) % G.replay.t;
    const p = replayPose(G.replay, G.replayT);
    Object.assign(v, { x: p.x, y: p.y, z: p.z, h: p.h, vx: p.vx, vz: p.vz, vy: 0, boosting: false, driftAngle: 0, latAcc: 0, lonAcc: 0 });
    v.vF = Math.hypot(p.vx, p.vz); v.groundPrev = p.y; // (speed is a getter worked out from vx, vz)
    $("replayTag").textContent = `REPLAY · ${fmt(G.replayT)} / ${fmt(G.replay.t)} · tap to exit`;
  }
  car.group.position.set(v.x, v.y, v.z);
  car.group.rotation.set(pitchOf(v), v.h, 0, "YXZ");
  updateContactShadow(car, v.y, v.groundPrev ?? v.y); brakeLights(car, v);
  if (headLight.visible) {
    const on = G.mode !== "menu", fx = Math.sin(v.h), fz = Math.cos(v.h);
    headLight.intensity = on ? 420 : 0; headLight.position.set(v.x + fx * 2.2, v.y + 0.75, v.z + fz * 2.2); headLight.target.position.set(v.x + fx * 26, v.y - 0.4, v.z + fz * 26);
  } wheelBlur(car, G.mode === "menu" ? 0 : v.vF);
  car.body.rotation.z = clamp(-v.latAcc * 0.0035, -0.06, 0.06);
  car.body.rotation.x = clamp(-v.lonAcc * 0.002, -0.03, 0.03);
  // suspension squash after a hard landing, springing back over ~0.3 s
  G.squash = (G.squash || 0) * Math.exp(-dt * 9); car.body.position.y = -G.squash;
  car.wheels.forEach((w) => (w.rotation.x += v.vF * dt / 0.36));
  car.steerers.forEach((p) => (p.rotation.y = -v.steer * 0.4));
  for (const r of G.field) poseCar(r.model, r.veh, dt);
  // in the garage, picking a flame colour shows the flames for a moment
  const showFlames = G.mode === "menu" && (G.trailShow = Math.max(0, (G.trailShow || 0) - dt)) > 0;
  updateFlames(car, v.boosting || showFlames, performance.now() / 1000);
  if (car.beams) car.beams.visible = false; // the player has a real spotlight at night instead
  if (G.ghost) G.ghost.update(G.raceTime - G.lapStart, trialMode() && G.mode === "race");
  if (G.friend) G.friend.update(G.raceTime - G.lapStart, trialMode() && G.mode === "race");
  if (G.mode === "race" || G.mode === "done") {
    tyreFx("p", car, v, dt);
    G.field.forEach((r, i) => tyreFx("r" + i, r.model, r.veh, dt));
  }
  smoke.update(dt, world.renderer.domElement.clientHeight || innerHeight);
  drawRocks();
  if (G.water) { G.water.offset.x += dt * 0.012; G.water.offset.y += dt * 0.007; }
  if (G.rain) G.rain.update(Math.min(dt, 0.05), camera.position, G.mode === "menu" ? 0 : v.vx, G.mode === "menu" ? 0 : v.vz);
  speedLines.update(dt, v.vF, G.mode === "race" && fxOn() ? (v.boosting ? 1 : Math.max(0, (v.vF / v.spec.vmax - 0.8) * 3)) : 0);
  if (!fxOn()) chase.shake = 0;

  car.group.position.y += Math.sin(G.bob = (G.bob || 0) + dt * v.vF * 0.9) * 0.006 * Math.min(1, v.vF / 30);
  const portrait = camera.aspect < 1;
  if (G.mode === "menu") {
    G.menuT += dt;
    // doors swing open and shut every few seconds in the lobby; held open in the garage
    const want = G.screen === "garage" ? 1 : (G.menuT % 9) < 5 ? 1 : 0;
    G.doors += (want - G.doors) * Math.min(1, dt * 2.2); setDoors(G.car, G.doors);
    car.group.position.set(0, 0, 0); car.group.rotation.set(0, 0, 0, "YXZ"); car.body.rotation.set(0, 0, 0); car.body.position.y = 0;
    updateContactShadow(car, 0, 0);
    showroom.update(dt, camera);
    chase.snap(v);
  } else if (G.photo) {
    const P = G.photo, c = Math.cos(P.e);
    camera.position.set(v.x + Math.sin(P.a) * P.d * c, v.y + 0.6 + Math.sin(P.e) * P.d, v.z + Math.cos(P.a) * P.d * c);
    camera.lookAt(v.x, v.y + 0.7, v.z);
  } else chase.update(v, dt, v.boosting ? 1 : 0);
  if (G.splitRace && G.p2 && G.mode !== "menu") {
    chase2.update(G.p2.veh, dt, G.p2.veh.boosting ? 1 : 0);
    const order = standings(), L = G.path.length, n = laps();
    const box = (e, veh, who) => `<span class="p">${who}</span><b>${ordinal(order.indexOf(e) + 1)}</b> · Lap ${Math.min(n, Math.floor(Math.max(0, veh.totalD) / L) + 1)}/${n} · ${Math.round(Math.max(0, veh.vF) * 3.6)} km/h`;
    $("shud1").innerHTML = box(order.find((e) => e.me), G.player, "P1"); $("shud2").innerHTML = box(G.p2, G.p2.veh, "P2");
  }
  car.body.visible = chase.mode !== "bonnet" || G.mode === "menu";
  world.follow(v.x, v.y, v.z);

  if (G.mode !== "menu") {
    $("lapV").textContent = G.event && G.event.type === "attack" ? String(G.lapTimes.length + 1) : Math.min(G.lapTimes.length + 1, laps()) + "/" + laps();
    $("timeV").textContent = fmt(G.mode === "race" ? G.raceTime - G.lapStart : G.lapTimes[G.lapTimes.length - 1] || 0);
    if ((G.hudTick = (G.hudTick || 0) + 1) % 6 === 0) {
      const o = standings(), i = o.findIndex((e) => e.me);
      $("posV").textContent = ordinal(i + 1) + "/" + o.length;
      // gap to the car ahead (or behind when leading), in seconds at current speed
      const other = i > 0 ? o[i - 1] : o[1];
      if (other && G.mode === "race") {
        const gap = Math.abs(other.veh.totalD - v.totalD) / Math.max(15, v.vF);
        $("gapV").hidden = false; $("gapV").className = i > 0 ? "behind" : "ahead";
        $("gapV").textContent = (i > 0 ? "+" : "−") + gap.toFixed(1) + "s " + (i > 0 ? "to " : "over ") + other.name.split(" ")[0];
      } else $("gapV").hidden = true;
    }
    $("boostFill").style.width = Math.round(v.boost * 100) + "%";
    $("speedo").classList.toggle("ready", v.boost > 0.12);
    $("drift").hidden = !(G.driftPts > 5);
    if (G.driftPts > 5) { $("driftV").textContent = "+" + Math.round(G.driftPts); $("driftX").textContent = G.mult > 1 ? "x" + G.mult : ""; }
    $("draft").classList.toggle("on", (G.draftM || 0) > 0.02); $("draftFill").style.width = Math.round((G.draftM || 0) * 100) + "%";
    $("spdV").textContent = Math.round(Math.max(0, v.vF) * 3.6);
    if (G.mode === "race") G.topSpeed = Math.max(G.topSpeed || 0, v.vF * 3.6);
    const gb = sfx.gearbox(Math.max(0, v.vF), v.spec.vmax);
    $("tachArc").style.strokeDasharray = `${Math.round(gb.rpm * 100)} 100`; $("tachArc").style.stroke = gb.rpm > 0.86 ? "#ff4d4d" : "";
    $("gearV").textContent = gb.electric ? "E" : v.vF < 1 ? "N" : String(gb.gear + 1);
    $("spdBar").style.width = Math.min(100, (v.vF / v.spec.vmax) * 100) + "%";
    const wrong = G.mode === "race" && v.speed > 5 && Math.cos(Math.atan2(v.vx, v.vz) - v.p.h) < -0.3;
    $("offtrack").hidden = !((v.offTrack || wrong) && G.mode === "race");
    $("offtrack").textContent = wrong ? "WRONG WAY" : "OFF TRACK";
    drawTags();
    minimap.draw([...G.field.map((r) => ({ x: r.veh.x, z: r.veh.z, color: "#" + r.color.toString(16).padStart(6, "0") })), { x: v.x, z: v.z, color: "#f2a65a", me: true }]);
  }
  sfx.updateAudio(v.vF, v.spec.vmax, G.mode === "race" || G.mode === "countdown" || G.mode === "replay", Math.min(1, Math.abs(v.driftAngle) * 3), v.boosting);
  // the three nearest rivals: left/right from the camera, distance, engine speed and how fast they close in
  if (G.mode === "race" || G.mode === "done") {
    const cx = camera.position.x, cz = camera.position.z, rx = Math.cos(chase.yaw ?? v.h), rz = -Math.sin(chase.yaw ?? v.h);
    const near = G.field.map((r) => {
      const dx = r.veh.x - cx, dz = r.veh.z - cz, dist = Math.hypot(dx, dz) || 1;
      const closing = -((r.veh.vx - v.vx) * dx + (r.veh.vz - v.vz) * dz) / dist;
      return { pan: -(dx * rx + dz * rz) / dist, dist, rpm: Math.min(1, r.veh.vF / r.veh.spec.vmax), closing };
    }).filter((r) => r.dist < 70).sort((a, b) => a.dist - b.dist).slice(0, 3);
    sfx.updateRivalAudio(near, true);
  } else sfx.updateRivalAudio([], false);
}

// sound (and the menu music) can only start after the first tap or key press
const firstTouch = () => { sfx.startAudio(); removeEventListener("pointerdown", firstTouch); removeEventListener("keydown", firstTouch); };
addEventListener("pointerdown", firstTouch); addEventListener("keydown", firstTouch);

// ---------- rockfall (active hazard on mountain and canyon tracks) ----------
// Every so often a few boulders tumble onto the road a couple of hundred metres ahead of you (with a warning).
// They sit there for a while; hitting one costs a lot of speed. Scheduled from the race clock and a seeded
// random stream, so it doesn't break the fixed-step determinism.
const rockGeo = new THREE.DodecahedronGeometry(1, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 1, flatShading: true });
const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, 12); rockMesh.count = 0; rockMesh.frustumCulled = false; rockMesh.castShadow = true; scene.add(rockMesh);
const rockO = new THREE.Object3D();
function stepRocks(dt) {
  const theme = THEMES[G.track.theme];
  if (!theme.rockfall || G.mode !== "race" || (G.event && G.event.type === "trial") || G.trial) {
    if (G.rocks && G.rocks.length) G.path.hazards = G.path.hazards.filter((h) => h.type !== "rock");
    G.rocks = []; return;
  }
  G.rocks = G.rocks || [];
  if (!G.rockRnd) G.rockRnd = makeRng((SEED ^ 0x5eed) >>> 0);
  if (G.raceTime >= (G.nextRock ?? 18)) {
    G.nextRock = G.raceTime + 22 + G.rockRnd() * 14;
    const P = G.path, d = P.wrapD(G.player.p.d + 170 + G.rockRnd() * 60), i = Math.floor(d / P.ds) % P.N;
    if (!P.bridge[i] && !P.tunnel[i] && !P.cliff[i]) {
      const half = P.width / 2 - 2;
      for (let k = 0; k < 3; k++) {
        const lat = (G.rockRnd() * 2 - 1) * half, r = { type: "rock", d: P.wrapD(d + k * 6), lat, len: 3, w: 3, s: 0.8 + G.rockRnd() * 0.5, fall: 1.2 + k * 0.25, life: 14 };
        G.rocks.push(r); P.hazards.push(r);
      }
      toast("ROCKFALL AHEAD!", 1800); sfx.thud(6);
    }
  }
  for (const r of G.rocks) { r.fall = Math.max(0, r.fall - dt); r.life -= dt; }
  // hits: any car overlapping a landed rock loses a big chunk of speed and knocks it away
  for (const veh of [G.player, ...G.field.map((f) => f.veh)]) for (const r of G.rocks) {
    if (r.fall > 0 || r.life <= 0) continue;
    let dd = veh.p.d - r.d; if (dd > G.path.length / 2) dd -= G.path.length; if (dd < -G.path.length / 2) dd += G.path.length;
    if (Math.abs(dd) < 1.8 + r.s && Math.abs(veh.lat - r.lat) < 1.2 + r.s) {
      veh.vx *= 0.55; veh.vz *= 0.55; r.life = 0;
      if (veh === G.player) { chase.shake = 0.8; sfx.thud(8); }
    }
  }
  const gone = G.rocks.filter((r) => r.life <= 0);
  if (gone.length) { G.rocks = G.rocks.filter((r) => r.life > 0); G.path.hazards = G.path.hazards.filter((h) => !gone.includes(h)); }
}
function drawRocks() {
  const list = G.rocks || [], tmp = {};
  rockMesh.count = Math.min(12, list.length);
  for (let k = 0; k < rockMesh.count; k++) {
    const r = list[k]; G.path.pointAt(r.d, r.lat, tmp);
    rockO.position.set(tmp.x, tmp.y + r.s * 0.7 + r.fall * 12, tmp.z); rockO.rotation.set(r.fall * 3 + k, k * 1.7, r.fall * 2); rockO.scale.setScalar(r.s); rockO.updateMatrix();
    rockMesh.setMatrixAt(k, rockO.matrix);
  }
  rockMesh.instanceMatrix.needsUpdate = true;
}

// trophies: award once, pay out, and say so
function trophy(id) { const t = award(save, id); if (t) { writeSave(); setTimeout(() => toast(`Trophy: ${t.name} · +${TROPHY_COINS}`, 2600), 300); sfx.chime(); } }
// lifetime stats shown on the career map
// a "real" race has someone to beat (solo time trials and drift runs always finish "1st")
const realRace = () => !!G.realRace;
function logStats(place) {
  const st = (save.stats = save.stats || { races: 0, wins: 0, podiums: 0, km: 0, top: 0, drift: 0 });
  st.races++; if (realRace() && place === 1 && !G.eliminated) st.wins++; if (realRace() && place <= 3 && !G.eliminated) st.podiums++;
  st.km += Math.max(0, G.player.totalD) / 1000; st.top = Math.max(st.top, G.topSpeed || 0); st.drift = Math.max(st.drift, G.bestDrift || 0);
}
function raceTrophies(place) {
  logStats(place);
  if (!realRace()) return;
  if (place === 1 && !G.eliminated) { trophy("win"); if (G.weather === "rain") trophy("rainwin"); }
  if (place <= 3 && !G.eliminated) { save.podiums = (save.podiums || 0) + 1; if (save.podiums >= 10) trophy("podium10"); }
  if (layoutOf(G.track.id) === "m") trophy("mirror");
  if (G.lapTimes.length >= laps() && G.cleanLaps >= laps()) trophy("clean");
}

// "What's new" card, once per big version (never in test mode, where it would cover the menu)
// only for players coming back from an older version; brand-new players just start playing
if (save.seenNews !== "2.0") {
  const returning = Object.keys(save.career || {}).length > 0 || save.coins > 0 || (save.owned || []).length > 1;
  if (returning && !TEST) $("whatsNew").hidden = false; else { save.seenNews = "2.0"; writeSave(); }
}
$("whatsNewOk").addEventListener("click", () => { sfx.click(); $("whatsNew").hidden = true; save.seenNews = "2.0"; writeSave(); });

// ---------- boot ----------
loadTrack(QS.get("track") || save.track || "gp");
buildPlayer();
buildRivals();
G.field = G.rivals;
gridUp();
showroom.setCar(G.car);
show("menu");
requestAnimationFrame(() => { const l = $("loading"); l.classList.add("gone"); setTimeout(() => l.remove(), 600); });
camera.position.set(G.player.x + 8, 3, G.player.z + 7);
addEventListener("resize", () => world.resize());
// pause when the app goes to the background (phone lock, tab switch)
document.addEventListener("visibilitychange", () => { sfx.suspend(document.hidden); if (document.hidden && G.mode === "race") pause(true); });
world.resize();

// Fixed-timestep loop: physics always advances in exact 1/60 s ticks, however fast the screen refreshes, so every
// player gets identical physics at 30, 60, 90 or 144 Hz. Drawing blends between the last two ticks so motion stays
// smooth on high-refresh screens instead of stuttering when a frame lands between ticks.
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
G.tick = 0;
const movers = () => [G.player, ...(G.field || []).map((r) => r.veh)];
function frame(now) {
  if (FPS_CAP && now - last < 1000 / FPS_CAP - 1) { requestAnimationFrame(frame); return; }
  const raw = now - last;
  const real = Math.min(TEST ? 0.25 : 0.1, raw / 1000); last = now;
  if (G.mode === "race" && !document.hidden && raw < 200) world.adapt(raw);
  acc += real * TIME_SCALE;
  let n = 0;
  while (acc >= STEP && n++ < 240 && !(STOP_TICK && G.tick >= STOP_TICK)) {
    for (const v of movers()) { v.px = v.x; v.py = v.y; v.pz = v.z; v.ph = v.h; }
    step(STEP); acc -= STEP;
    if (!G.paused && G.mode !== "menu") G.tick++;
  }
  if (STOP_TICK && G.tick >= STOP_TICK) acc = 0;
  // draw at the blended position, then put the exact physics state back
  const a = Math.min(1, acc / STEP), saved = [];
  for (const v of movers()) {
    if (v.px == null || (v.x - v.px) ** 2 + (v.z - v.pz) ** 2 > 400) continue; // respawns and warps snap
    saved.push([v, v.x, v.y, v.z, v.h]);
    v.x = v.px + (v.x - v.px) * a; v.y = v.py + (v.y - v.py) * a; v.z = v.pz + (v.z - v.pz) * a; v.h = v.ph + wrapA(v.h - v.ph) * a;
  }
  render(real);
  if (G.splitRace && G.p2 && G.mode !== "menu") { world.renderSplit([camera, camera2]); G.wasSplit = true; }
  else { if (G.wasSplit) { G.wasSplit = false; world.resize(); } world.render(G.mode === "menu" ? showroom.scene : null); }
  for (const [v, x, y, z, h] of saved) { v.x = x; v.y = y; v.z = z; v.h = h; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- offline / install ----------
// New versions download in the background. If one is waiting when the app opens, it's applied straight away
// (a quick reload before you start playing); if one arrives while you're playing, a banner offers to reload.
function setupUpdates(sw) {
  let reloading = false;
  sw.addEventListener("controllerchange", () => { if (!reloading && G.wantReload) { reloading = true; location.reload(); } });
  const apply = (reg) => { G.wantReload = true; if (reg.waiting) reg.waiting.postMessage("skipWaiting"); else location.reload(); };
  const offer = (reg) => {
    if (G.mode === "menu" && performance.now() < LAUNCH_WINDOW) { apply(reg); return; } // just launched: update now
    const b = $("updateBanner"); b.hidden = false; b.onclick = () => apply(reg);
  };
  sw.register(SW_URL).then((reg) => {
    if (reg.waiting && sw.controller) offer(reg);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) w.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) offer(reg); });
    });
    const check = () => reg.update().catch(() => { /* offline */ });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => { /* offline play just won't be available */ });
}
const SW_URL = QS.get("sw") || "sw.js", LAUNCH_WINDOW = QS.has("launchwin") ? Number(QS.get("launchwin")) : TEST ? 0 : 8000;
if ("serviceWorker" in navigator && location.protocol !== "file:" && (!TEST || QS.has("sw"))) addEventListener("load", () => setupUpdates(navigator.serviceWorker));

// ---------- test hook ----------
addEventListener("error", (e) => errors.push(String(e.message)));
if (TEST) {
  window.__apex = {
    get mode() { return G.mode; },
    get player() { const v = G.player; return { x: v.x, z: v.z, h: v.h, vF: v.vF, totalD: v.totalD, boost: v.boost, boosting: v.boosting, drifting: v.drifting, driftAngle: v.driftAngle, lat: v.lat, hErr: wrapA(v.h - v.p.h), bend: Math.abs(G.path.cs[v.p.i]) > 0.004 ? Math.sign(G.path.cs[v.p.i]) : 0 }; },
    get skidCount() { return skids.n; },
    setBoost(b) { G.player.boost = b; },
    tilt(beta, gamma) { window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { beta, gamma, alpha: 0 })); },
    get tiltOn() { return input.tiltOn; },
    get version() { return VERSION; },
    setSetting(k, val) { save.settings[k] = val; writeSave(); applyAids(); },
    get laps() { return G.lapTimes.slice(); },
    get place() { return G.place; },
    get eventOk() { return G.eventOk; },
    get fieldSize() { return G.field.length; },
    get countT() { return G.countT; },
    get ghostVisible() { return !!(G.ghost && G.ghost.model.group.visible); },
    get drawCalls() { return world.renderer.info.render.calls; },
    get triangles() { return world.renderer.info.render.triangles; },
    get reward() { return G.lastReward; },
    addCoins(n, g = 0) { save.coins += n; save.gems += g; writeSave(); refreshLobby(); },
    get rivals() { return G.rivals.map((r) => ({ totalD: r.veh.totalD, vF: r.veh.vF, lat: r.veh.lat, finished: r.finished })); },
    get trackLength() { return G.path.length; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get track() { return G.track.id; },
    // jump the player to a distance along the track (used for screenshots of specific corners)
    warp(d) { const keep = G.player.totalD; G.player.reset(d, 0); G.player.totalD = keep; G.player.vF = 40; G.player.vx = Math.sin(G.player.h) * 40; G.player.vz = Math.cos(G.player.h) * 40; chase.ready = false; },
    rampD() { const r = G.path.ramps[0]; return r ? r.d - r.len - 45 : -1; },
    get airPops() { return G.airPops || 0; },
    // anything solid within car height above the road surface (should be nothing)
    roadCover() {
      const P = G.path, rc = new THREE.Raycaster(), o = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), pt = {}, hits = [];
      rc.far = 3; world.trackGroup.updateMatrixWorld(true);
      for (let i = 0; i < P.N; i += 2) for (const f of [-0.9, -0.45, 0, 0.45, 0.9]) {
        if (P.cliff[i]) continue;
        const lat = f * (P.width / 2 - 1); P.pointAt(i * P.ds, lat, pt);
        o.set(pt.x, pt.y + P.rampAt(i * P.ds, lat) + 0.3, pt.z); rc.set(o, up);
        const h = rc.intersectObject(world.trackGroup, true).find((x) => x.object.visible && !x.object.isSprite && !x.object.isPoints);
        if (h) hits.push({ i, lat: Math.round(lat), dist: +h.distance.toFixed(2), col: h.object.material.color ? h.object.material.color.getHexString() : "?", name: h.object.name || h.object.type });
      }
      return hits;
    },
    get world() { return world; },
    get p2() { return G.p2 ? { x: G.p2.veh.x, z: G.p2.veh.z, h: G.p2.veh.h, vF: G.p2.veh.vF, lat: G.p2.veh.lat } : null; },
    get splitRace() { return !!G.splitRace; },
    get weather() { return G.weather; },
    get night() { return !!G.night; },
    get rocks() { return (G.rocks || []).length; },
    get eventId() { return G.event ? G.event.id : null; },
    get grip() { return G.path.surfaceAt(G.player.p.d, 0); },
    get tick() { return G.tick; },
    get raceTime() { return G.raceTime; },
    get fieldCars() { return G.field.map((r) => r.carId); },
    // exact physics state of every car (for the determinism test)
    get simState() { return [G.player, ...G.field.map((r) => r.veh)].map((v) => [v.x, v.y, v.z, v.h, v.vx, v.vz, v.boost, v.totalD]); },
    get airborne() { return !!G.player.airborne; },
    sharpD() { const i = G.path.cs.findIndex((c) => Math.abs(c) > 0.011); return i < 0 ? 0 : i * G.path.ds - 110; },
    bridgeD() { const i = G.path.bridge.findIndex((b) => b); return i < 0 ? -1 : (i - 30) * G.path.ds; },
    errors,
    ready: true,
  };
}
