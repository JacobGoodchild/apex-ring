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
import { makeCar, setDoors, setRims, setDecal, setFinish, wheelBlur, RIMS, DECALS, FINISHES, LIVERY, UNDERGLOW, setUnderglow } from "./carmodel.js";
import { Showroom } from "./showroom.js";
import { Ghost } from "./ghost.js";
import { medalTimes, medalFor, MEDAL_RANK } from "./medals.js";
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
import { Sparks, Fireworks, Skids, Smoke, SpeedLines, Rain, addFlames, updateFlames, addBeams, setTrail, TRAILS, addContactShadow, updateContactShadow } from "./effects.js";
import { Minimap, drawTrack } from "./minimap.js";
import { addWings, setWings, setWingSkin, WING_SKINS } from "./wings.js";
import { onlineReady, signIn, saveProfile, postLap, topLaps, friendLaps, addFriend, myId, Room, roomCode, postGhost, getGhost, ghostOwners, lapsSince, friendsList, touchSeen, myInbox } from "./online.js";

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
const skids = new Skids(scene), smoke = new Smoke(scene), speedLines = new SpeedLines(camera), sparks = new Sparks(scene), fireworks = new Fireworks(scene);
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
  // flight challenges over a chasm: rings to thread, updraft columns, lightning strikes
  for (const k of G.strikes || []) k.m.removeFromParent();
  const rg = grp.getObjectByName("rings"); G.rings = rg ? rg.children : []; G.ringHits = 0; G.strikes = []; G.strikeT = 1.5;
  G.updrafts = []; grp.traverse((o) => { if (o.name === "updraft") G.updrafts.push(o); });
  G.waterfall = grp.getObjectByName("waterfall") || null;
  if (theme.rain && !G.rain) G.rain = new Rain(scene);
  if (G.rain) G.rain.lines.visible = !!theme.rain;
  if (theme.snowfall && !G.snow) G.snow = new Rain(scene, 900, true);
  if (G.snow) G.snow.lines.visible = !!theme.snowfall && !theme.rain;
  sfx.setWeatherSound(theme.rain ? "rain" : theme.snowfall ? "snow" : theme.wetRoad ? "wet" : "");
  G.ltFlash = 0; $("flash").style.opacity = 0; if (G.bolt) { G.bolt.removeFromParent(); G.bolt.geometry.dispose(); G.bolt.material.dispose(); G.bolt = null; } // setTheme has reset the light
  G.lightning = !!theme.lightning;
  if (G.car && G.car.beams) G.car.beams.visible = G.night;
  for (const r of G.rivals || []) if (r.model.beams) r.model.beams.visible = G.night;
  if (G.player) { G.player.track = G.path; gridUp(); }
  save.track = def.id;
  $("trackName").textContent = def.name; $("trackBlurb").textContent = def.blurb;
  showTrackCard(def, theme);
  $("trackTheme").textContent = DIFFICULTY_NAMES[def.difficulty || 1] + " · " + (theme.label || "Track");
  $("trackTheme").dataset.diff = def.difficulty || 1;
  applyAids();
  drawTrack(previewCtx, G.path, 96, { width: 4 });
  refreshLock();
}
function refreshLock() {
  if (!G.track) return;
  const open = G.cupMode ? cupOpen(CUPS[G.cupIdx]) : TEST || trackUnlocked(save, baseId(G.track.id)) || G.openTrack === baseId(G.track.id); // the weekly challenge / an online ghost opens its track
  // layout tabs (Normal / Reverse / Mirror); Reverse is hidden on tracks with cliff drops
  const lay = layoutOf(G.track.id), base = trackById(baseId(G.track.id));
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
  // medal targets for this layout, and the best one you've won here
  const mt = medalTimes(G.track.id), got = (save.medals || {})[G.track.id];
  $("medalLine").hidden = !G.trial || !mt.length;
  $("trackName").innerHTML = G.track.name + (G.trial && got ? ` <i class="mdot ${got}" title="${got} medal"></i>` : "");
  $("medalLine").innerHTML = mt.map((m) => `<span class="md ${m.name}${got && MEDAL_RANK[got] >= MEDAL_RANK[m.name] ? " won" : ""}"><i></i>${fmt(m.t)}</span>`).join("");
  $("playersOpt").hidden = !!G.trial || G.cupMode || !canSplit(); applyPlayers(); applyWeather();
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
  for (const r of G.rivals) { r.model.group.visible = false; r.model.nearHid = false; }
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
// ---------- race select: track photo, stats and the thumbnail strip ----------
const previewSrc = (id) => `assets/previews/${baseId(id)}.jpg`;
function setImg(img, src) {
  if (img.dataset.src === src) return;
  img.dataset.src = src; img.style.visibility = "";
  img.onerror = () => (img.style.visibility = "hidden");
  img.src = src; img.classList.remove("swap"); void img.offsetWidth; img.classList.add("swap");
}
function showTrackCard(def, theme) {
  setImg($("trackImg"), previewSrc(def.id));
  const km = G.path.length / 1000, best = save.best[def.id], d = def.difficulty || 1;
  const len = mph() ? (km / 1.609).toFixed(1) + " mi" : km.toFixed(1) + " km";
  $("trackStats").innerHTML = `<div><b>${len}</b><span>Length</span></div><div><b>${def.laps}</b><span>Laps</span></div>` +
    `<div><b>${best ? fmt(best) : "–"}</b><span>Your record</span></div>` +
    `<div><span class="pips">${[1, 2, 3].map((k) => `<i class="${k <= d ? "on" : ""}"></i>`).join("")}</span><span>${DIFFICULTY_NAMES[d]}</span></div>`;
  buildStrip();
}
function buildStrip() {
  const strip = $("trackStrip"), cur = baseId(G.track.id);
  if (!strip.childElementCount) {
    for (const t of TRACKS) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.id = t.id; b.setAttribute("role", "option");
      b.innerHTML = `<img alt="" loading="lazy" src="${previewSrc(t.id)}"><span>${t.name}</span>`;
      b.querySelector("img").onerror = (e) => (e.target.style.visibility = "hidden");
      b.addEventListener("click", () => { if (baseId(G.track.id) === t.id) return; sfx.click(); const lay = layoutOf(G.track.id); loadTrack(t.id + (lay && (lay !== "r" || canReverse(t)) ? ":" + lay : "")); writeSave(); });
      strip.appendChild(b);
    }
  }
  for (const b of strip.children) {
    const sel = b.dataset.id === cur; b.setAttribute("aria-selected", String(sel));
    b.classList.toggle("locked", !TEST && !trackUnlocked(save, b.dataset.id));
    if (sel && strip.offsetParent) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
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
$("settingsTop").addEventListener("click", () => show("settings"));
$("trackNext").addEventListener("click", () => pickTrack(1));

// ---------- player car ----------
function buildPlayer(id = save.car) {
  const def = carById(id), cs = carSave(def.id);
  if (G.car) G.car.group.removeFromParent();
  G.car = makeCar(def, PAINTS[cs.paint % PAINTS.length].hex, cs.rims, cs.decal || 0); G.car.paintHex = PAINTS[cs.paint % PAINTS.length].hex;
  sfx.setEngine(def.engine);
  addFlames(G.car); addBeams(G.car); addContactShadow(G.car); G.car.beams.visible = !!G.night;
  setFinish(G.car, cs.finish || 0, PAINTS[cs.paint % PAINTS.length].hex); setTrail(G.car, cs.trail || 0);
  if (cs.number) G.car.decalCtx.number = cs.number;
  if (cs.livery || cs.number) setDecal(G.car, cs.decal || 0, PAINTS[cs.paint % PAINTS.length].hex, cs.livery || 0);
  setUnderglow(G.car, cs.glow || 0);
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
  const model = makeCar(def, prof.color, 2, 4, true);
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
    const model = makeCar(def, prof.color, k % 4, [1, 4, 2, 3, 0, 4, 1][k % 7], true);
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
  G.raceTime = 0; G.lapStart = 0; G.lapTimes = []; G.finishOrder = []; G.playerFinish = null; hlReset(); G.photoFin = false; G.slowmo = 0; G.lastPos = -1;
  skids.clear(); G.driftPts = 0; G.airPops = 0; G.mult = 1; G.lastBank = -9; G.draftM = 0; G.topSpeed = 0; G.bestDrift = 0;
  if (G.rocks && G.path) G.path.hazards = G.path.hazards.filter((h) => h.type !== "rock"); G.rocks = []; G.nextRock = 18; G.rockRnd = makeRng((SEED ^ 0x5eed) >>> 0); G.driftShow = 0; G.totalDrift = 0; G.cleanLaps = 0; G.lapWall = 0; G.newRecord = false;
}

// Everyone in the race, ordered by position.
function standings() {
  const L = G.path.length, n = laps();
  const all = [{ veh: G.player, name: "You", me: true, finished: G.playerFinish, color: 0xf2a65a }, ...G.field, ...(G.netRace && G.net ? [...G.net.peers.values()].filter((q) => q.racing) : [])];
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
  $("proPads").hidden = !(on && pro); if (on && pro) $("pads").hidden = true; $("proSteer").hidden = input.tiltOn; $("tags").hidden = !on; if (!on) { $("drift").hidden = true; $("driftPop").hidden = true; $("eventTag").hidden = true; $("gapV").hidden = true; stopFlightFx(); } }

const SCREENS = ["menu", "setup", "garage", "settings", "career", "help", "daily", "online"];
function show(id) {
  sfx.click();
  SCREENS.forEach((s) => ($(s).hidden = s !== id));
  setMusicMode("menu"); if (G.photo) endPhoto();
  $("topbar").hidden = !SCREENS.includes(id);
  G.screen = id;
  showroom.side = id === "garage" ? -2.4 : 1.6; // keep the car clear of the garage card (left) or the menu tiles (right)
  showroom.lift = id === "garage" ? 1.6 : 0; // in portrait the garage card is taller than the menu tiles, so the car sits higher
  if (id === "garage") { G.garageCar = save.car; refreshGarage(); }
  if (id === "menu") { if (G.garageCar && G.garageCar !== save.car) buildPlayer(); refreshLobby(); }
  if (id === "settings") refreshSettings();
  if (id === "career") buildCareer();
  if (id === "daily") refreshDaily();
  if (id === "online") { refreshOnline(); if (!save.wentOnline) { save.wentOnline = true; writeSave(); } setTimeout(startPresence, 500); }
  if (id === "setup") {
    G.event = null;
    const base = THEMES[G.track.theme], wantNight = (G.wantTime || "day") === "night" || !!base.stars;
    if (G.track.id !== (save.track || G.track.id) || G.weather !== (base.rain ? "rain" : G.wantWeather || "dry") || G.night !== wantNight) loadTrack(save.track || G.track.id);
    refreshLock();
  }
}
function refreshLobby() {
  const car = carById(save.car), sp = carSpec(car, carSave(car.id).upgrades || {});
  $("lobbyCar").textContent = car.name;
  $("lobbyCls").textContent = car.cls; $("lobbyCls").className = "cls cls-" + car.cls.toLowerCase();
  $("lobbyEngine").textContent = car.engine === "electric" ? "Electric" : car.engine.toUpperCase().replace("FLAT6", "Flat-6");
  $("lobbyStats").innerHTML = STAT_KEYS.slice(0, 3).map(([k, f]) => `<div>${k}<i><b style="width:${Math.round(Math.min(1, Math.max(0.05, f(sp))) * 100)}%"></b></i></div>`).join("");
  if (G.track) { $("raceTileSub").textContent = "Last track: " + G.track.name; setImg($("raceTileImg"), previewSrc(G.track.id)); }
  const stars = EVENTS.reduce((a, e) => a + ((save.career[e.id] || {}).stars || 0), 0);
  $("careerTileSub").textContent = `${stars} / ${EVENTS.length * 3} stars`;
  $("garageTileSub").textContent = `${save.owned.length} of ${CARS.length} cars`;
  $("coinsV").textContent = save.coins.toLocaleString("en-GB"); $("gemsV").textContent = save.gems;
}

// ---------- garage ----------
const STAT_KEYS = [["Top speed", (s) => s.vmax / 95], ["Acceleration", (s) => s.accel / 21], ["Handling", (s) => (s.grip / 42) * 0.6 + (s.response / 11) * 0.4],
  ["Drift grip", (s) => (s.driftGrip - 0.75) / 0.5], ["Boost duration", (s) => s.boostDur / 1.5]];
// real-feeling numbers for the garage: top speed and 0-100 km/h from the same acceleration and drag formula the
// physics uses (accel x (1 - (v/vmax)^2) minus air drag), integrated on a flat straight
function perfNumbers(def, up) {
  const s = carSpec(def, up || {});
  let v = 0, t = 0, t100 = 0, t60 = 0;
  for (let k = 0; k < 60 * 60; k++) { const a = s.accel * Math.max(0, 1 - (v / s.vmax) ** 2) - 0.0009 * v * v; v += a / 60; t += 1 / 60; if (!t100 && v >= 100 / 3.6) t100 = t; if (!t60 && v >= 60 / 2.237) t60 = t; }
  return { top: Math.round(v * 3.6), topMph: Math.round(v * 2.237), t100, t60 };
}
// Speed units: mph or km/h (Settings). Defaults to mph where the roads use it, km/h everywhere else.
function mph() { const u = save.settings.units || (!TEST && /^en-(GB|US)\b/i.test(navigator.language || "") ? "mph" : "kmh"); return u === "mph"; }
const speedOf = (ms) => Math.round(Math.max(0, ms) * (mph() ? 2.237 : 3.6));
const unitName = () => (mph() ? "mph" : "km/h");
function applyUnits() {
  document.querySelectorAll("#unitTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.u === "mph") === mph())));
  $("unitV").textContent = mph() ? "MPH" : "KM/H";
}
document.querySelectorAll("#unitTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.units = b.dataset.u; writeSave(); applyUnits(); }));
applyUnits();
setTimeout(() => applyFps(), 0);
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
  $("perfLine").textContent = `Top speed ${mph() ? pn.topMph + " mph · 0-60 mph " + pn.t60.toFixed(1) : pn.top + " km/h · 0-100 km/h " + pn.t100.toFixed(1)} s · ${def.engine === "electric" ? "electric" : def.engine.toUpperCase().replace("FLAT6", "flat-6")}`;
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
  G.garageCar = order[i].id; sfx.click(); refreshGarage(); showMoment();
}
// showroom moment when you pick a car: the doors swing open, the headlights flicker on, the engine revs, the doors close
function showMoment() { G.showT = 0; sfx.rev(); }
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
  // your race number (free), shown by the patterns with a number
  $("numV").textContent = String(cs.number || G.car.decalCtx.number).padStart(2, "0");
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
function stepNumber(d) {
  const cs = carSave(G.garageCar); cs.number = (((cs.number || G.car.decalCtx.number) - 1 + d + 99) % 99) + 1;
  G.car.decalCtx.number = cs.number; sfx.click(); setDecal(G.car, cs.decal || 0, PAINTS[cs.paint % PAINTS.length].hex, cs.livery || 0); writeSave(); buildDecals();
}
$("numPrev").addEventListener("click", () => stepNumber(-1));
$("numNext").addEventListener("click", () => stepNumber(1));
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
  chips("glows", UNDERGLOW, "glowOwned", "glow", 600, (i) => setUnderglow(G.car, i));
}

function startRace() {
  sfx.startAudio(); sfx.click(); if (G.photo) endPhoto();
  fireworks.stop(); $("spectate").hidden = true; G.spectate = -1;
  if (G.car.def && G.car.def !== save.car) buildPlayer();
  G.mode = "countdown";
  scene.add(G.car.group); setDoors(G.car, 0); G.doors = 0;
  const ev = G.event, solo = ev ? ev.type === "trial" || ev.type === "drift" || ev.type === "attack" : G.trial;
  if (G.boss) { G.boss.model.group.removeFromParent(); G.boss = null; }
  if (G.p2) { G.p2.model.group.removeFromParent(); G.p2 = null; }
  G.splitRace = !!G.split && !ev && !G.trial && canSplit(); input.split = G.splitRace;
  // a race started from a friends room has no bots; any other race does, even while you're still in a room
  G.netRace = !!(G.netGo && G.net); G.netGo = false;
  if (G.net && !G.netRace) { G.net.racing = false; for (const q of G.net.peers.values()) { q.racing = false; if (q.model) q.model.group.visible = false; } }
  G.field = solo || G.netRace ? [] : ev && ev.type === "h2h" ? G.rivals.filter((r) => r.name === ev.rival) : ev && ev.type === "boss" ? [(G.boss = makeBoss(ev))] : G.splitRace ? [(G.p2 = makeP2()), ...G.rivals.slice(0, 5)] : G.rivals;
  G.realRace = !trialMode() && (G.field.length > 0 || !!(G.netRace && G.net.peers.size));
  for (const r of G.rivals) { r.model.group.visible = G.field.includes(r); r.model.nearHid = false; }
  G.elimDone = 0; G.eliminated = false; G.attackShown = -1;
  if (ev && ev.type === "boss") setTimeout(() => toast("BOSS BATTLE · " + ev.desc.split(".")[0], 3200), 300);
  if (!G.ghost) { G.ghost = new Ghost(makeCar(CARS[0], 0xffffff, 0, 0, true)); scene.add(G.ghost.model.group); }
  save.ghosts = save.ghosts || {};
  G.ghost.load(trialMode() ? save.ghosts[G.track.id] : null); G.ghost.startLap();
  // a friend's ghost (pasted as a code) races too, in orange
  if (!G.friend) { G.friend = new Ghost(makeCar(CARS[0], 0xffffff, 0, 0, true), 0xffa24c); scene.add(G.friend.model.group); }
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
  endTutorial(); flushTrophies(); fireworks.stop(); $("react").hidden = true; $("spectate").hidden = true; G.spectate = -1;
  ["finish", "pause", "count"].forEach((id) => ($(id).hidden = true));
  setRaceUI(false); showroom.setCar(G.car);
  show("menu");
  gridUp();
}

function finishRace() {
  G.mode = "done";
  if (G.rocks && G.rocks.length) { G.path.hazards = G.path.hazards.filter((h) => h.type !== "rock"); G.rocks = []; }
  G.playerFinish = G.raceTime; hlEvent(3);
  if (G.netRace && G.net && G.net.racing) G.net.room.send("fin", { i: G.net.me, t: G.raceTime });
  const order = standings(), place = order.findIndex((e) => e.me) + 1;
  sfx.fanfare(place <= 3 && !G.eliminated);
  G.place = place;
  raceTrophies(place);
  const fastest = Math.min(...G.lapTimes);
  let html = `<div class="place">${ordinal(place)}<small> of ${order.length}</small></div>`;
  if (order.length >= 3) {
    const pod = [order[1], order[0], order[2]], hx = (c) => "#" + c.toString(16).padStart(6, "0");
    html += `<div class="podium">${pod.map((e, i) => `<div class="step s${[2, 1, 3][i]}${e.me ? " me" : ""}"><span class="who" style="--c:${hx(e.color)}">${esc(e.name)}</span><span class="blk">${[2, 1, 3][i]}</span></div>`).join("")}</div>`;
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
    html += `<li class="${e.me ? "me" : ""}"><span class="pos">${i + 1}</span><span class="sw" style="background:#${e.color.toString(16).padStart(6, "0")}"></span><span class="nm">${esc(e.name)}${e.boss ? ' <small class="sty boss">Boss</small>' : e.driver ? ` <small class="sty">${STYLE_NAMES[e.driver.style] || ""}</small>` : ""}</span><span class="tm">${gap}</span></li>`;
  });
  html += `</ol><div class="laps">Best lap <b>${fmt(fastest)}</b> · Record <b>${fmt(save.best[G.track.id])}</b></div>`;
  if (G.lapTimes.length > 1) html += `<div class="laplist">${G.lapTimes.map((t, i) => `<span class="${t === fastest ? "best" : ""}">L${i + 1} ${fmt(t)}</span>`).join("")}</div>`;
  if (G.event) html = eventResult(place, fastest) + html;
  if (G.cup) html = cupResult(order) + html;
  if (G.trial && !G.event) html = medalResult(fastest) + html;
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
  $("againBtn").hidden = !!G.cup || (G.netRace && !(G.net && G.net.host));
  $("againBtn").textContent = G.netRace ? "Rematch" : G.event ? (G.eventOk ? "Replay event" : "Try again") : "Race again";
  $("react").hidden = true;
  if (G.netRace && G.net) {
    if (place === 1 && G.net.peers.size) badge("roomwin");
    const live = [...G.net.peers.values()].some((q) => q.racing && q.finished == null);
    $("watchBtn").hidden = !live;
    if (!G.net.host) $("results").insertAdjacentHTML("beforeend", `<div class="hint">The host can start a rematch from here.</div>`);
  } else $("watchBtn").hidden = true;
  if (G.event && G.event.id === "sky" && !G.eliminated) badge("sky");
  if (G.tut) { $("tutBox").hidden = true; if (!save.tutDone) { save.tutDone = true; save.coins += 200; (G.trophyQ = G.trophyQ || []).push("Tutorial complete (+200 coins)"); } }
  // a win: fireworks over the start/finish gantry and the crowd roars
  if (place === 1 && G.realRace && !G.eliminated) { fireworks.show(() => { const d = camera.getWorldDirection(new THREE.Vector3()), k = 150 / Math.max(0.2, Math.hypot(d.x, d.z)); return [camera.position.x + d.x * k, camera.position.y - 4, camera.position.z + d.z * k]; }, 7); sfx.cheer(); } // ahead of wherever the camera is when each rocket goes up
  // photo finish: you won by less than a tenth of a second
  if (place === 1 && order[1] && order[1].finished != null && order[1].finished - G.playerFinish < 0.1) { badge("photo"); hlEvent(6); }
  $("clipBtn").hidden = !hlWindow() || typeof MediaRecorder === "undefined"; $("clipBtn").textContent = "🎬 Share replay"; G.clipFile = null;
  $("againBtn").classList.toggle("ghost", !!next);
  if (G.event && G.eventOk && ni === EVENTS.length) setTimeout(() => toast("Career complete. You're the Apex champion!", 5000), 1600);
  setTimeout(() => { if (G.mode === "done") { setRaceUI(false); $("finish").hidden = false; flushTrophies(); } }, TEST ? 200 : 1400);
}

// Time-trial medals: coins for each medal you reach for the first time on this layout
function medalResult(fastest) {
  const id = G.track.id, won = medalFor(id, fastest), meds = (save.medals = save.medals || {}), prev = MEDAL_RANK[meds[id]] || 0;
  const mt = medalTimes(id);
  if (!mt.length) return "";
  let coins = 0;
  if (won && MEDAL_RANK[won] > prev) { for (const m of mt) if (MEDAL_RANK[m.name] > prev && MEDAL_RANK[m.name] <= MEDAL_RANK[won]) coins += m.coins; meds[id] = won; save.coins += coins; if (won === "gold") { trophy("gold"); if (Object.values(meds).filter((m) => m === "gold").length >= 5) trophy("gold5"); } }
  const next = mt.slice().reverse().find((m) => MEDAL_RANK[m.name] > (MEDAL_RANK[won] || 0));
  const name = (n) => n[0].toUpperCase() + n.slice(1);
  return `<div class="medalres ${won || "none"}"><i></i><div><b>${won ? name(won) + " medal" : "No medal yet"}</b>${coins ? ` <span class="coin">+${coins}</span>` : ""}<div class="hint">${next ? `${name(next.name)} at ${fmt(next.t)}` : "Top of the board. Can you go faster?"}</div></div></div>`;
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
  if (on) { clearTimeout(G.voiceT); clearTimeout(subtitle._d); }
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
  db.innerHTML = `<span class="nd" data-t="DAILY">DAILY</span><span class="nn">${TYPE_LABEL[daily.type]}</span><span class="ns">${dst && dst.done ? "★".repeat(dst.stars) + "☆".repeat(3 - dst.stars) : "+900 · 1 gem"}</span>`;
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
    b.innerHTML = `<span class="nd" data-t="${open ? TYPE_TAG[ev.type] : "🔒"}">${open ? TYPE_TAG[ev.type] : "🔒"}</span><span class="nn">${ev.name.replace("Boss: ", "")}</span><span class="ns">${st ? "★".repeat(st.stars) + "☆".repeat(3 - st.stars) : open ? "☆☆☆" : ""}</span>`;
    b.addEventListener("click", () => selectEvent(ev));
    row.appendChild(b);
  });
  $("careerStars").textContent = total + " / " + EVENTS.length * 3 + " ★";
  // trophies at the bottom of the map
  const got = save.trophies || {}, tsec = document.createElement("div"); tsec.className = "chapter trophies";
  tsec.innerHTML = `<div class="chh">Trophies · ${TROPHIES.filter((t) => got[t.id]).length} / ${TROPHIES.length}</div><ul class="tlist">${TROPHIES.map((t) => `<li class="${got[t.id] ? "got" : ""}"><b>${got[t.id] ? "🏆" : "·"} ${t.name}</b><span>${t.desc}</span></li>`).join("")}</ul>`;
  el.appendChild(tsec);
  const st = save.stats || { races: 0, wins: 0, podiums: 0, km: 0, top: 0, drift: 0 }, ssec = document.createElement("div"); ssec.className = "chapter stats";
  ssec.innerHTML = `<div class="chh">Your stats</div><div class="statgrid">${[["Races", st.races], ["Wins", st.wins], ["Podiums", st.podiums], ["Distance", st.km.toFixed(1) + " km"], ["Top speed", Math.round(st.top / (mph() ? 1.609 : 1)) + " " + unitName()], ["Best drift", Math.round(st.drift).toLocaleString("en-GB")]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")}</div>`;
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
["setupBack", "garageBack", "settingsBack", "dailyBack", "onlineBack"].forEach((id) => $(id).addEventListener("click", () => show("menu")));

// ---------- daily challenge screen: Zeus's Fury, open to anyone, plus the dated daily event ----------
const ZEUS_EVENT = { id: "zeus", name: "Zeus's Fury", type: "race", track: "zeus", laps: 2, target: 3, weather: "rain", special: true,
  reward: { coins: 3000, gems: 2 }, desc: "Fly the chasm and finish in the top three." };
function refreshDaily() {
  const d = dailyEvent(), st = save.career[d.id];
  $("dailyName").textContent = d.name; $("dailyDesc").textContent = d.desc;
  $("dailyReward").innerHTML = st && st.done ? `Done today: <b>${"★".repeat(st.stars)}${"☆".repeat(3 - st.stars)}</b>` : `Reward <b>+900</b> <b class="gem">+1 gem</b>`;
  $("zeusBest").textContent = fmt(save.best.zeus); $("skyBest").textContent = fmt(save.best.sky);
}
$("dailyBtn").addEventListener("click", () => show("daily"));
$("zeusGo").addEventListener("click", () => { sfx.startAudio(); sfx.preloadVoice("wings"); startEvent(ZEUS_EVENT); });
const SKY_EVENT = { id: "sky", name: "Sky Islands", type: "race", track: "sky", laps: 2, target: 3, weather: "dry", special: true,
  reward: { coins: 2500, gems: 2 }, desc: "Fly both chasms and finish in the top three." };
$("skyGo").addEventListener("click", () => { sfx.startAudio(); sfx.preloadVoice("wings"); startEvent(SKY_EVENT); });
$("dailyGo").addEventListener("click", () => startEvent(dailyEvent()));

// ---------- online: leaderboards, friends and profile. The screens are real; anything that needs the server says so. ----------
function soon(msg) { sfx.click(); if (msg) $("soonMsg").textContent = msg; $("soon").hidden = false; }
$("soonOk").addEventListener("click", () => { sfx.click(); $("soon").hidden = true; });
G.oTrack = 0;
// everyone has a name online: the one they chose, or their own Racer#### (made once, kept in the save)
function myName() {
  if (save.driverName) return save.driverName.slice(0, 16);
  if (!/^Racer\d{4}$/.test(save.racerName || "")) { save.racerName = "Racer" + (1000 + Math.floor(Math.random() * 9000)); writeSave(); }
  return save.racerName;
}
function friendCode() {
  if (!save.friendCode) { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = ""; for (let i = 0; i < 4; i++) c += a[Math.floor(Math.random() * a.length)]; save.friendCode = "APX-" + c; writeSave(); }
  return save.friendCode;
}
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// season titles go to the top of each season board: #1 Apex Legend, 2-3 Gold, 4-10 Silver
const seasonTitle = (i) => (i === 0 ? "Apex Legend" : i < 3 ? "Gold" : i < 10 ? "Silver" : "");
const boardRow = (r, i, me, o = {}) => {
  const title = o.season ? seasonTitle(i) : "", gh = o.ghosts && o.ghosts.has(r.user_id) && r.user_id !== me;
  return `<li class="${r.user_id === me ? "me" : ""}"><span class="pos">${i + 1}</span><span class="nm">${esc(r.name)}${title ? ` <small class="ttl t${i < 1 ? 1 : i < 3 ? 2 : 3}">${title}</small>` : ""}</span>` +
    `<span class="tm">${fmt(r.ms / 1000)}${gh ? ` <button class="gbtn" type="button" data-u="${esc(r.user_id)}" data-n="${esc(r.name)}" aria-label="Race ${esc(r.name)}'s ghost">👻</button>` : ""}</span></li>`;
};
// best lap per driver from a list of laps (fastest first), with names from the joined profile
const bestPer = (laps) => { const seen = new Set(), out = []; for (const l of laps) { if (seen.has(l.user_id)) continue; seen.add(l.user_id); out.push({ user_id: l.user_id, ms: l.ms, car: l.car, name: (l.profiles && l.profiles.name) || "Racer" }); } return out; };
const weekStart = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t; };
const seasonStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const seasonName = (d = new Date()) => d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) + " season";
// the weekly challenge: one track for everyone, picked from the week's date (no server needed to agree on it)
function weeklyTrack(d = new Date()) { const wk = Math.floor(weekStart(d).getTime() / 6048e5), pool = TRACKS.filter((t) => t.id !== "xtreme"); return pool[(wk * 7 + 3) % pool.length]; }
function refreshOnline(fetchNow = true) {
  const t = TRACKS[G.oTrack], best = save.best[t.id], name = myName();
  $("oTrackName").textContent = t.name;
  $("oCode").textContent = friendCode();
  $("oName").value = save.driverName || ""; $("oName").placeholder = myName();
  const st = save.stats || { races: 0, wins: 0, podiums: 0 };
  $("oStats").innerHTML = [["Races", st.races], ["Wins", st.wins], ["Podiums", st.podiums]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("");
  if (onlineReady() && fetchNow) {
    // real boards from the server: this season (the month) or all time; a ghost icon where a driver has a lap to race
    const id = t.id, season = G.oBoard !== "all";
    $("oBoardKind").textContent = season ? seasonName() : "All time";
    $("oSeasonHint").textContent = season ? "Top 10 at the end of the month earn a title: Apex Legend, Gold or Silver." : "";
    $("oSeason").setAttribute("aria-pressed", String(season)); $("oAll").setAttribute("aria-pressed", String(!season));
    $("oBoard").innerHTML = `<li class="empty">Loading…</li>`;
    ensureProfile().catch(() => {}).then(() => Promise.all([season ? lapsSince(id, seasonStart().toISOString(), new Date(Date.now() + 36e5).toISOString()).then(bestPer) : topLaps(id), friendLaps(id).catch(() => []), ghostOwners(id).catch(() => [])])).then(([top, fr, gh]) => {
      if (TRACKS[G.oTrack].id !== id) return;
      const me = myId(), ghosts = new Set((gh || []).map((g) => g.user_id));
      top = top.slice(0, 100);
      $("oBoard").innerHTML = top.length ? top.map((r, i) => boardRow(r, i, me, { season, ghosts })).join("") : `<li class="empty">No laps yet${season ? " this season" : ""}. Set one and you're first!</li>`;
      $("oFriendBoard").innerHTML = fr.length ? fr.map((r, i) => boardRow(r, i, me, { ghosts })).join("") : `<li class="empty">No laps from you or your friends on this track yet.</li>`;
      const mine = top.findIndex((r) => r.user_id === me);
      // your title this season is the best rank you hold on any board (it only goes up, and resets with the season)
      if (season && mine >= 0 && mine < 10) {
        const cur = save.title && save.title.season === seasonName() ? save.title.rank : 99;
        if (mine < cur) { save.title = { name: seasonTitle(mine), season: seasonName(), rank: mine }; writeSave(); }
        if (mine === 0) badge("legend");
      }
    }).catch((e) => { $("oBoard").innerHTML = `<li class="empty">Couldn't reach the server: ${esc(e.message)}</li>`; });
    return;
  }
  // not set up yet: your own best lap is real; the world's rows are placeholders
  const rows = [`<li class="me"><span class="pos">–</span><span class="nm">${esc(name)} <small>this device</small></span><span class="tm">${best ? fmt(best) : "no lap yet"}</span></li>`];
  for (let i = 1; i <= 6; i++) rows.push(`<li class="ghostrow"><span class="pos">${i}</span><span class="nm"><i></i></span><span class="tm"><i></i></span></li>`);
  $("oBoard").innerHTML = rows.join("");
  $("oFriendBoard").innerHTML = `<li class="me"><span class="pos">1</span><span class="nm">${esc(name)}</span><span class="tm">${best ? fmt(best) : "–"}</span></li><li class="empty">Add friends to see their times here.</li>`;
}
// the server needs a profile (name + friend code) before it takes laps or friends; made once per session
function ensureProfile(force = false) {
  if (!G.profileP || force) G.profileP = saveProfile(myName(), friendCode()).catch((e) => { G.profileP = null; throw e; });
  return G.profileP;
}
// a lap goes up when it's your best this week, this season or ever (so the weekly and season boards see it)
function uploadLap(track, lap) {
  const wk = weekStart().toISOString().slice(0, 10), se = seasonStart().toISOString().slice(0, 10), U = (save.upBest = save.upBest || {});
  const k1 = track + "@" + wk, k2 = track + "@" + se, better = !(U[k1] <= lap) || !(U[k2] <= lap);
  if (!better) return;
  U[k1] = Math.min(U[k1] ?? Infinity, lap); U[k2] = Math.min(U[k2] ?? Infinity, lap);
  for (const k of Object.keys(U)) if (!k.endsWith(wk) && !k.endsWith(se)) delete U[k]; // keep only this week's and season's
  writeSave(); uploadLapNow(track, lap);
}
function uploadLapNow(track, lap) { if (onlineReady() && !TEST && save.wentOnline) ensureProfile().then(() => postLap(track, lap, save.car)).catch(() => {}); }
function doAddFriend() {
  const code = $("oFriendCode").value.trim().toUpperCase(); if (!code) return;
  sfx.click();
  ensureProfile().then(() => addFriend(code)).then((n) => { sfx.chime(); toast(`${n || "Racer"} is now your friend`, 2000); $("oFriendCode").value = ""; refreshOnline(); })
    .catch((e) => toast(e.message.includes("No driver") ? "No driver has that code" : e.message.includes("own code") ? "That's your own code" : "Couldn't add: " + e.message, 2400));
}
function onlineTab(o) {
  document.querySelectorAll("#online .seg .tab").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.o === o)));
  for (const [k, id] of [["global", "oGlobal"], ["weekly", "oWeekly"], ["friends", "oFriends"], ["race", "oRace"], ["profile", "oProfile"]]) $(id).hidden = k !== o;
  if (o === "race") drawLobby();
  if (o === "weekly") drawWeekly();
  if (o === "friends") drawFriends();
  if (o === "profile") drawBadges();
}

// ---------- online ghosts: your best time-trial lap goes up; a 👻 on a board row loads that driver's lap to race ----------
function uploadGhost(track, rec) {
  if (!onlineReady() || TEST || !save.wentOnline) return;
  encodeGhost(rec, track, save.car, myName()).then((data) => ensureProfile().then(() => postGhost(track, rec.t, save.car, data))).catch(() => {});
}
async function raceGhost(userId, name, track) {
  sfx.click();
  try {
    const g = await getGhost(userId, track); if (!g) { toast("That ghost isn't available", 1600); return; }
    const r = await decodeGhost(g.data);
    if (r.track !== track) throw new Error("wrong track");
    G.openTrack = baseId(track);
    save.friendGhosts = save.friendGhosts || {}; save.friendGhosts[track] = { ...r.ghost, n: String(name || r.name).slice(0, 16), online: true }; writeSave();
    if (!G.track || G.track.id !== track) loadTrack(track);
    setMode(true); show("setup"); toast(`Ghost loaded: ${String(name).slice(0, 16)} · ${fmt(g.ms / 1000)}`, 2200);
  } catch (e) { toast("Couldn't load that ghost", 1600); }
}
for (const id of ["oBoard", "oFriendBoard", "oWkBoard"]) $(id).addEventListener("click", (e) => {
  const b = e.target.closest(".gbtn"); if (!b) return;
  const track = id === "oWkBoard" ? weeklyTrack().id : TRACKS[G.oTrack].id;
  raceGhost(b.dataset.u, b.dataset.n, track);
});
$("oSeason").addEventListener("click", () => { sfx.click(); G.oBoard = "season"; refreshOnline(); });
$("oAll").addEventListener("click", () => { sfx.click(); G.oBoard = "all"; refreshOnline(); });

// ---------- weekly challenge: one track for everyone each week (Monday to Sunday, UTC), its own world board ----------
function drawWeekly() {
  const t = weeklyTrack(), end = new Date(weekStart().getTime() + 6048e5), left = end - Date.now();
  const d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 36e5);
  const mine = (save.upBest || {})[t.id + "@" + weekStart().toISOString().slice(0, 10)];
  $("oWkHead").innerHTML = `<img alt="" src="${previewSrc(t.id)}"><div><div class="label">This week's challenge</div><b>${t.name}</b>` +
    `<span>Ends in ${d}d ${h}h · Your best ${mine ? fmt(mine) : "–"}</span></div>`;
  if (!onlineReady()) { $("oWkBoard").innerHTML = `<li class="empty">The weekly world board needs online play.</li>`; return; }
  $("oWkBoard").innerHTML = `<li class="empty">Loading…</li>`;
  ensureProfile().catch(() => {}).then(() => Promise.all([lapsSince(t.id, weekStart().toISOString(), new Date(weekStart().getTime() + 6048e5).toISOString()).then(bestPer), ghostOwners(t.id).catch(() => [])])).then(([top, gh]) => {
    const me = myId(), ghosts = new Set((gh || []).map((g) => g.user_id));
    top = top.slice(0, 50);
    $("oWkBoard").innerHTML = top.length ? top.map((r, i) => boardRow(r, i, me, { ghosts })).join("") : `<li class="empty">Nobody has raced it yet this week. Be first!</li>`;
    const i = top.findIndex((r) => r.user_id === me); if (i >= 0 && i < 10) badge("weekly10");
  }).catch((e) => { $("oWkBoard").innerHTML = `<li class="empty">Couldn't reach the server: ${esc(e.message)}</li>`; });
}
$("oWkGo").addEventListener("click", () => { sfx.click(); const t = weeklyTrack(); G.openTrack = t.id; loadTrack(t.id); setMode(true); show("setup"); });

// ---------- friends list: who's online (seen in the last 2.5 minutes), and invites into your race room ----------
function drawFriends() {
  if (!onlineReady()) { $("oFriendList").innerHTML = `<li class="empty">Friends need online play.</li>`; return; }
  $("oFriendList").innerHTML = `<li class="empty">Loading…</li>`;
  ensureProfile().catch(() => {}).then(friendsList).then((list) => {
    save.friendCount = list.length; if (list.length) badge("social"); writeSave();
    const now = Date.now(), room = G.net && G.net.room && G.net.room.open;
    const rows = list.sort((a, b) => Date.parse(b.last_seen || 0) - Date.parse(a.last_seen || 0)).map((p) => {
      const on = p.last_seen && now - Date.parse(p.last_seen) < 150000;
      return `<li><span class="pos"><i class="dot${on ? " on" : ""}"></i></span><span class="nm">${esc(p.name)} <small>${on ? "online" : "offline"}</small></span>` +
        `<span class="tm">${room && on && p.inbox ? `<button class="tab" type="button" data-c="${esc(String(p.inbox).replace(/[^a-f0-9]/gi, ""))}">Invite</button>` : ""}</span></li>`;
    });
    $("oFriendList").innerHTML = rows.length ? rows.join("") : `<li class="empty">No friends yet: share your code above.</li>`;
  }).catch(() => { $("oFriendList").innerHTML = `<li class="empty">Couldn't load your friends. Has the part 2 setup been run?</li>`; });
}
$("oFriendList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-c]"); if (!b || !G.net) return;
  sfx.click(); const code = G.net.code, to = new Room("I" + b.dataset.c, () => {}, (st) => { if (st === "open") { to.send("inv", { n: myName(), r: code }); setTimeout(() => to.close(), 800); } else to.close(); });
  b.disabled = true; b.textContent = "Sent"; toast("Invite sent", 1200);
});
// presence: while the game is open, say "I'm here" every minute and listen on your own channel for invites
function startPresence() {
  // only for players who've used Online: nobody gets a guest account just for opening the game
  if (!onlineReady() || TEST || G.presence || !save.wentOnline) return;
  G.presence = true;
  let timer = 0;
  const beat = () => { if (!document.hidden) touchSeen().catch(() => clearInterval(timer)); }; // stop if the server doesn't have "last seen" yet
  ensureProfile().then(() => {
    beat(); timer = setInterval(beat, 60000);
    // invites arrive on a private inbox only your friends know about; reopened if the phone drops the connection
    return myInbox().then((box) => {
      if (!box) return;
      const open = () => {
        G.inbox = new Room("I" + String(box).replace(/[^a-f0-9]/gi, ""), (e, p) => {
          if (e !== "inv" || !p || !/^[A-Z0-9]{5}$/.test(p.r || "")) return;
          G.invite = p.r; $("inviteMsg").textContent = `${String(p.n || "A friend").slice(0, 16)} invites you to race`; $("invite").hidden = false; sfx.chime();
        }, (st) => { if (st === "closed" || st === "error") { clearTimeout(G.inboxT); G.inboxT = setTimeout(() => { if (!document.hidden) open(); }, 5000); } });
      };
      open();
      document.addEventListener("visibilitychange", () => { if (!document.hidden && G.inbox && !G.inbox.open) { clearTimeout(G.inboxT); open(); } });
    });
  }).catch(() => { G.presence = false; });
}
$("inviteJoin").addEventListener("click", () => { $("invite").hidden = true; if (G.mode !== "menu") return toast("Finish your race first", 1600); show("online"); onlineTab("race"); openRoom(G.invite, false); });
$("inviteNo").addEventListener("click", () => { $("invite").hidden = true; });

// ---------- badges: earned once, kept in the save, shown in Profile (some unlock wing skins) ----------
const BADGES = [
  ["first_win", "🏆", "First win", "Win a race"], ["podium10", "🥉", "Podium regular", "10 podiums"], ["gold", "🥇", "Gold medallist", "A gold time-trial medal"],
  ["wings", "🪽", "Chasm flyer", "Fly across a chasm"], ["rings", "💫", "Ring master", "Fly through every ring on Zeus's Fury"], ["sky", "☁️", "Sky pilot", "Finish Sky Islands"],
  ["streak7", "🔥", "Week-long streak", "Play 7 days in a row"], ["social", "🤝", "Social racer", "Add a friend"], ["roomwin", "🎮", "Room champion", "Win a race against friends"],
  ["weekly10", "📅", "Weekly top 10", "Top 10 on a weekly challenge"], ["ghostbuster", "👻", "Ghostbuster", "Beat an online ghost"], ["legend", "👑", "Apex Legend", "#1 on a season board"],
  ["photo", "📸", "Photo finish", "Win by less than a tenth"],
];
function badge(id) {
  save.badges = save.badges || {};
  if (save.badges[id]) return;
  const b = BADGES.find((x) => x[0] === id); if (!b) return;
  save.badges[id] = Date.now(); writeSave();
  if (G.mode === "race" || G.mode === "countdown" || G.mode === "done") (G.trophyQ = G.trophyQ || []).push("Badge " + b[2]);
  else toast(`Badge: ${b[1]} ${b[2]}`, 2200);
}
function syncBadges() { // badges that follow from progress you already have
  const st = save.stats || {}, tr = save.trophies || {};
  if (st.wins >= 1) badge("first_win"); if (st.podiums >= 10) badge("podium10");
  if (Object.values(save.medals || {}).some((m) => m === "gold" || (m && m.gold))) badge("gold");
  if (tr.wings) badge("wings"); if ((save.streak || {}).n >= 7) badge("streak7");
}
function drawBadges() {
  syncBadges();
  const got = save.badges || {};
  $("oBadgeCount").textContent = `${Object.keys(got).length} / ${BADGES.length}`;
  $("oBadges").innerHTML = BADGES.map(([id, ic, name, how]) => `<div class="bdg${got[id] ? " got" : ""}" title="${how}"><i>${got[id] ? ic : "🔒"}</i><b>${name}</b><span>${how}</span></div>`).join("") +
    (save.title ? `<div class="bdg got wide"><i>🏁</i><b>${esc(save.title.name)}</b><span>${esc(save.title.season)} title</span></div>` : "");
  // wing skins for the flight tracks, each unlocked by a badge
  $("oWingSkins").innerHTML = WING_SKINS.map((k) => {
    const open = !k.badge || got[k.badge], need = k.badge ? BADGES.find((b) => b[0] === k.badge)[2] : "";
    return `<button class="tab" type="button" data-w="${k.id}" aria-pressed="${(save.wingSkin || "paint") === k.id}" ${open ? "" : "disabled"} title="${open ? k.name : "Earn: " + need}">${open ? k.name : "🔒 " + k.name}</button>`;
  }).join("");
}
$("oWingSkins").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-w]"); if (!b || b.disabled) return;
  sfx.click(); save.wingSkin = b.dataset.w; writeSave(); if (G.car.wings) setWingSkin(G.car, save.wingSkin); drawBadges();
});

// ---------- daily login streak: come back on consecutive days for a growing coin reward ----------
function checkStreak() {
  const day = (d) => d.toISOString().slice(0, 10), today = day(new Date()), y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
  const S = (save.streak = save.streak || { n: 0, last: "" });
  if (S.last === today) return;
  S.n = S.last === day(y) ? S.n + 1 : 1; S.last = today;
  const coins = 50 * Math.min(S.n, 7) + (S.n % 7 === 0 ? 300 : 0);
  save.coins += coins; writeSave(); if (S.n >= 7) badge("streak7");
  if (!TEST) setTimeout(() => toast(`🔥 Day ${S.n} streak · +${coins} coins`, 3200), 1200);
}
document.querySelectorAll("#online .seg .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); onlineTab(b.dataset.o); }));

// ---------- race friends live: a room on Supabase Realtime. Messages: hi (who's here), trk (host's track pick),
// go (start), s (car state, 10 a second), fin (finish time), bye. Friends' cars are drawn where they say they are. ----------
const NET_COLORS = [0x4cc9f0, 0xf72585, 0x80ed99, 0xffd166, 0xb388ff, 0xff8fab, 0x90e0ef];
const NET_TRACKS = TRACKS.filter((t) => t.id !== "xtreme");
function openRoom(code, host) {
  if (!onlineReady()) { soon("Live races with friends are under construction: they switch on once the game's server is set up."); return; }
  sfx.click(); leaveRoom();
  const n = (G.net = { code, host, me: null, peers: new Map(), track: G.track ? baseId(G.track.id) : NET_TRACKS[0].id, racing: false, room: null, status: "Connecting…" });
  drawLobby();
  signIn().then((id) => id, () => "g" + Math.random().toString(36).slice(2, 10)).then((id) => {
    if (G.net !== n) return;
    n.me = id;
    n.room = new Room(code, (e, p) => netMsg(e, p), (st, why) => {
      if (G.net !== n) return;
      n.status = st === "open" ? "" : st === "closed" ? "Disconnected" : "Couldn't join: " + (why || st);
      if (st === "open") { netHello(); n.helloT = setInterval(netHello, 2000); }
      drawLobby();
    });
  });
}
function leaveRoom() {
  const n = G.net; if (!n) return;
  if (n.room) { n.room.send("bye", { i: n.me }); n.room.close(); }
  clearInterval(n.helloT); for (const q of n.peers.values()) if (q.model) q.model.group.removeFromParent();
  G.net = null; drawLobby();
}
function netHello() { const n = G.net; if (n && n.room) n.room.send("hi", { i: n.me, n: myName(), c: save.car, h: n.host ? 1 : 0, t: n.host ? n.track : undefined, r: n.ready ? 1 : 0 }); }
function netMsg(e, p) {
  const n = G.net; if (!n || !p || p.i === n.me) return;
  let q = n.peers.get(p.i);
  if (!q && e !== "bye" && n.peers.size >= 7) return; // rooms hold 8 drivers; anyone past that (or someone flooding the room with fake players) is ignored
  if (!q && e !== "bye") { q = { id: p.i, name: "Racer", car: CARS[0].id, color: NET_COLORS[n.peers.size % NET_COLORS.length], veh: { totalD: 0, vF: 0 }, finished: null, racing: false, seen: 0, at: null, model: null }; n.peers.set(p.i, q); }
  if (q) q.seen = performance.now();
  if (e === "hi") { q.name = String(p.n || "Racer").slice(0, 16); if (CARS.some((c) => c.id === p.c)) q.car = p.c; q.ready = !!p.r; if (p.h && p.t && !n.host && trackById(p.t)) n.track = p.t; if (G.mode === "menu") drawLobby(); }
  else if (e === "trk" && !n.host && trackById(p.t)) { n.track = p.t; drawLobby(); }
  else if (e === "go" && !n.host && trackById(p.t) && (G.mode === "menu" || (G.mode === "done" && G.netRace))) { n.track = p.t; $("finish").hidden = true; netStart(); }
  else if (e === "re" && typeof p.e === "string" && REACTS.includes(p.e)) showReact(p.e, q.name);
  else if (e === "s" && n.racing) { q.racing = true; q.prev = q.at; q.at = { x: +p.x, y: +p.y, z: +p.z, h: +p.h, t: performance.now() }; q.veh.totalD = +p.d || 0; q.veh.vF = +p.v || 0; }
  else if (e === "fin" && n.racing) { q.finished = +p.t; }
  else if (e === "bye") { if (q && q.model) q.model.group.removeFromParent(); n.peers.delete(p.i); drawLobby(); }
}
function drawLobby() {
  const n = G.net, inRoom = !!n;
  $("oRoomStart").hidden = inRoom; $("oLobby").hidden = !inRoom;
  if (!n) return;
  const now = performance.now();
  for (const [k, q] of n.peers) if (now - q.seen > 7000 && !n.racing) n.peers.delete(k); // gone quiet: left
  $("oRoomName").textContent = n.code;
  $("oRoomTrack").textContent = trackById(n.track).name;
  $("oRoomPick").hidden = !n.host; $("oGo").hidden = !n.host; $("oWait").hidden = n.host && !n.status;
  $("oWait").textContent = n.status || "Waiting for the host to start the race…";
  const tick = (r) => (r ? `<small class="rdy">✓ ready</small>` : "");
  const me = `<li class="me"><span class="pos">${n.host ? "★" : "·"}</span><span class="nm">${esc(myName())} <small>you</small> ${tick(n.ready)}</span><span class="tm">${carDef(save.car).name}</span></li>`;
  const peers = [...n.peers.values()], ready = peers.filter((q) => q.ready).length + (n.ready ? 1 : 0);
  $("oReady").textContent = n.ready ? "Not ready" : "I'm ready"; $("oReady").classList.toggle("on", !!n.ready);
  if (n.host) $("oGo").textContent = peers.length ? `Start race · ${ready}/${peers.length + 1} ready` : "Start race";
  $("oPlayers").innerHTML = me + peers.map((q) => `<li><span class="pos">·</span><span class="nm">${esc(q.name)} ${tick(q.ready)}</span><span class="tm">${carDef(q.car).name}</span></li>`).join("") + (n.peers.size ? "" : `<li class="empty">Send your friends the code <b>${n.code}</b> to join.</li>`);
}
const carDef = (id) => CARS.find((c) => c.id === id) || CARS[0];
function netPickTrack(dir) {
  const n = G.net; if (!n || !n.host) return;
  const i = NET_TRACKS.findIndex((t) => t.id === n.track); n.track = NET_TRACKS[(i + dir + NET_TRACKS.length) % NET_TRACKS.length].id;
  sfx.click(); n.room && n.room.send("trk", { i: n.me, t: n.track }); drawLobby();
}
function netStart() {
  const n = G.net; if (!n) return;
  if (n.host) n.room.send("go", { i: n.me, t: n.track });
  for (const q of n.peers.values()) { q.finished = null; q.racing = false; q.at = q.prev = null; q.veh.totalD = 0; }
  n.racing = true; n.sendT = 0;
  G.event = null; G.cup = null; G.trial = false; G.split = false;
  loadTrack(n.track, "dry"); G.netGo = true; startRace();
  n.ready = false; G.spectate = -1; $("spectate").hidden = true; $("againBtn").hidden = true; $("react").hidden = false;
}
// ---------- quick reactions in a friends race: tap an emoji, everyone sees it float up with your name ----------
const REACTS = ["🔥", "😂", "👋", "😮"];
function showReact(e, who) {
  const el = document.createElement("div"); el.className = "rf"; el.textContent = e;
  const tag = document.createElement("small"); tag.textContent = who; el.appendChild(tag);
  el.style.left = 30 + Math.random() * 40 + "%"; $("reactFloat").appendChild(el); setTimeout(() => el.remove(), 2200);
}
$("react").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-r]"); if (!b || !G.net || !G.net.room) return;
  const now = performance.now(); if (now - (G.reactT || 0) < 700) return; G.reactT = now; // no spamming
  G.net.room.send("re", { i: G.net.me, e: b.dataset.r }); showReact(b.dataset.r, "You");
});
$("react").addEventListener("pointerdown", (e) => e.stopPropagation()); // tapping an emoji isn't steering
// ---------- spectate: after you finish a friends race, watch the others until they're done ----------
function spectateTarget() { const n = G.net; if (!n) return null; const live = [...n.peers.values()].filter((q) => q.racing && q.finished == null && q.model); return live.length ? live[((G.spectate % live.length) + live.length) % live.length] : null; }
$("spectate").addEventListener("click", () => { const t = spectateTarget(); if (!t) { $("spectate").hidden = true; $("finish").hidden = false; return; } G.spectate++; });
function netFrame(dt) {
  const n = G.net; if (!n.racing) return;
  if (G.mode === "menu") { n.racing = false; for (const q of n.peers.values()) { q.racing = false; if (q.model) q.model.group.visible = false; } return; }
  const v = G.player;
  if (G.mode === "race" && (n.sendT -= dt) <= 0 && n.room) { n.sendT = 0.1; n.room.send("s", { i: n.me, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2), h: +v.h.toFixed(3), d: +v.totalD.toFixed(1), v: +v.vF.toFixed(1) }); }
  const now = performance.now();
  for (const q of n.peers.values()) {
    if (!q.at) continue;
    if (!q.model) { q.model = makeCar(carDef(q.car), q.color, 0, 0, true); scene.add(q.model.group); }
    const g = q.model.group; g.visible = true;
    // aim a little ahead of the last report along its velocity (reports come 10 a second), and ease toward it
    const a = q.at, b = q.prev, k = b && a.t > b.t ? Math.min(0.25, (now - a.t) / 1000) / ((a.t - b.t) / 1000) : 0;
    const tx = a.x + (b ? (a.x - b.x) * k : 0), ty = a.y + (b ? (a.y - b.y) * k : 0), tz = a.z + (b ? (a.z - b.z) * k : 0);
    const e = Math.min(1, dt * 12);
    if (!q.placed) { g.position.set(tx, ty, tz); g.rotation.y = a.h; q.placed = true; }
    g.position.x += (tx - g.position.x) * e; g.position.y += (ty - g.position.y) * e; g.position.z += (tz - g.position.z) * e;
    let dh = a.h - g.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); g.rotation.y += dh * e;
    q.veh.x = g.position.x; q.veh.y = g.position.y; q.veh.z = g.position.z; q.veh.h = g.rotation.y;
  }
}
$("oMakeRoom").addEventListener("click", () => openRoom(roomCode(), true));
$("oJoin").addEventListener("click", () => { const c = $("oRoomCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (c.length === 5) openRoom(c, false); else toast("Room codes have 5 letters and numbers", 1800); });
$("oLeave").addEventListener("click", () => { sfx.click(); leaveRoom(); });
$("oRPrev").addEventListener("click", () => netPickTrack(-1));
$("oRNext").addEventListener("click", () => netPickTrack(1));
$("oReady").addEventListener("click", () => { if (!G.net) return; sfx.click(); G.net.ready = !G.net.ready; netHello(); drawLobby(); });
$("oGo").addEventListener("click", () => { if (G.net && G.net.host && G.net.room && G.net.room.open) { sfx.click(); netStart(); } });
$("oPrev").addEventListener("click", () => { sfx.click(); G.oTrack = (G.oTrack + TRACKS.length - 1) % TRACKS.length; refreshOnline(); });
$("oNext").addEventListener("click", () => { sfx.click(); G.oTrack = (G.oTrack + 1) % TRACKS.length; refreshOnline(); });
$("oRefresh").addEventListener("click", () => onlineReady() ? refreshOnline(true) : soon("World leaderboards are under construction. Your laps are saved on this device and will be uploaded when online play arrives."));
$("oAdd").addEventListener("click", () => onlineReady() ? doAddFriend() : soon("Adding friends is under construction. Keep your friend code handy: it'll work as soon as online play is switched on."));
$("oSignIn").addEventListener("click", () => soon("Syncing across devices is under construction."));
$("oSaveName").addEventListener("click", () => { const n = $("oName").value.trim().slice(0, 16); save.driverName = n; writeSave(); sfx.chime(); if (onlineReady()) ensureProfile(true).catch(() => {}); toast(n ? "Name saved: " + n : "Name cleared", 1500); refreshOnline(); });
$("onlineBtn").addEventListener("click", () => show("online"));
function setMode(trial, cup = false) {
  G.trial = trial; G.cupMode = cup;
  const m = cup ? "cup" : trial ? "trial" : "race";
  if (save.settings.raceMode !== m) { save.settings.raceMode = m; writeSave(); } // the race screen opens on the mode you used last
  $("modeRace").setAttribute("aria-pressed", String(!trial && !cup)); $("modeTrial").setAttribute("aria-pressed", String(trial)); $("modeCup").setAttribute("aria-pressed", String(cup));
  $("cupPick").hidden = !cup; $("trackPick").hidden = cup; ["layoutOpt", "board", "timeOpt", "weatherOpt", "trackStrip"].forEach((id) => ($(id).hidden = cup)); // cups always race by day, dry
  if (cup) refreshCup();
  refreshLock();
}
// ---------- cups ----------
G.cupIdx = 0;
const cupOpen = (c) => TEST || c.tracks.every((t) => trackUnlocked(save, baseId(t)));
function refreshCup() {
  const c = CUPS[G.cupIdx], best = (save.cups || {})[c.id];
  $("cupName").textContent = c.name + (best ? ` · best ${ordinal(best)}` : "");
  setImg($("cupImg"), previewSrc(c.tracks[0]));
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
{ const m = save.settings.raceMode; if (m === "trial" || m === "cup") setMode(m === "trial", m === "cup"); }

// ---------- settings ----------
function refreshSettings() {
  $("versionV").textContent = `Apex Ring v${VERSION} · ${BUILD.replace("·", " · ")}`;
  document.querySelectorAll("#qualityTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === world.qname)));
  document.querySelectorAll("#camTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === chase.mode)));
  document.querySelectorAll("#soundTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.s === "1") === save.settings.sound)));
  $("musicVol").value = save.settings.music ?? 0.6;
  applyDrive(); applyBand(); applyFx(); applyUnits(); applyFps();
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
  resetSave(); G.garageCar = null; buildPlayer(); sfx.setMuted(false); $("muteBtn").textContent = "Sound: On";
  applyDrive(); applyUnits(); applyFps(); setCam("chase"); setMusicVolume(save.settings.music ?? 0.6); toast("Progress reset."); show("menu");
});
$("clipBtn").addEventListener("click", () => clipShare());
$("watchBtn").addEventListener("click", () => { sfx.click(); G.spectate = 0; G.specPos = null; $("finish").hidden = true; $("spectate").hidden = false; });
$("againBtn").addEventListener("click", () => {
  if (G.netRace && G.net && G.net.host) {
    if ([...G.net.peers.values()].some((q) => q.racing && q.finished == null && performance.now() - q.seen < 5000)) return toast("Wait until everyone has finished", 1600);
    $("finish").hidden = true; netStart();
  } else startRace();
});
$("nextBtn").addEventListener("click", () => { if (G.cup) { G.cup.i++; startCupRace(); return; } const i = EVENTS.indexOf(G.event); if (i >= 0 && EVENTS[i + 1]) startEvent(EVENTS[i + 1]); });
$("menuBtn").addEventListener("click", () => { const ev = G.event; G.cup = null; $("againBtn").hidden = false; const wasNet = G.netRace; toMenu(); if (ev) show("career"); else if (wasNet && G.net) { show("online"); onlineTab("race"); } });
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
  $("muteBtn").textContent = save.settings.sound ? "Sound: On" : "Sound: Off";
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

$("respawnBtn").addEventListener("click", () => { if (G.mode === "race") { G.player.respawn(); pause(false); } });
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
function applyFps() { $("fpsV").hidden = !save.settings.fps; document.querySelectorAll("#fpsTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "on") === !!save.settings.fps))); }
document.querySelectorAll("#fpsTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.fps = b.dataset.v === "on"; writeSave(); applyFps(); }));
function applyFx() { document.querySelectorAll("#fxTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.f === "on") === fxOn()))); }
document.querySelectorAll("#fxTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.fx = b.dataset.f; writeSave(); applyFx(); }));
function applyBand() { document.querySelectorAll("#bandTabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.b === (save.settings.catchup || "normal")))); }
document.querySelectorAll("#bandTabs .tab").forEach((b) => b.addEventListener("click", () => { sfx.click(); save.settings.catchup = b.dataset.b; writeSave(); applyBand(); }));
applyBand();
applyDrive();
// cameras: high chase, low chase (cinematic, close behind), bonnet
function camLabel(m) { return "Camera: " + ({ chase: "Chase", low: "Low", bonnet: "Bonnet" }[m] || m); }
function setCam(m) { chase.mode = m; save.settings.camera = m; writeSave(); $("camBtn").textContent = camLabel(m); chase.ready = false; }
$("camBtn").addEventListener("click", () => setCam(CAMS[(CAMS.indexOf(chase.mode) + 1) % CAMS.length]));
$("camBtn").textContent = camLabel(chase.mode);
input.onKey = (k) => {
  if (k === "Escape" || k === "p" || k === "P") pause(!G.paused);
  else if ((k === "r" || k === "R") && G.mode === "race") G.player.respawn();
  else if (k === "m" || k === "M") $("muteBtn").click();
  else if (k === "c" || k === "C") $("camBtn").click();
};
sfx.setMuted(!save.settings.sound);
$("muteBtn").textContent = save.settings.sound ? "Sound: On" : "Sound: Off";

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
  const v = G.player, friends = G.netRace && G.net ? [...G.net.peers.values()].filter((q) => q.racing && q.model && q.model.group.visible && Math.abs(q.veh.totalD - v.totalD) < 250 && q.veh.totalD - v.totalD > -8) : [];
  const near = friends.concat(G.field.filter((r) => { const dd = r.veh.totalD - v.totalD; return dd > 4 && dd < 70; })).sort((a, b) => a.veh.totalD - b.veh.totalD).slice(0, 4);
  const placed = []; // nearest car's tag goes first; a tag that would sit on top of another is lifted above it
  while (G.tagEls.length < near.length) { const e = document.createElement("div"); e.className = "tag"; tags.appendChild(e); G.tagEls.push(e); }
  G.tagEls.forEach((e, i) => {
    const r = near[i];
    if (!r || G.mode !== "race") { e.hidden = true; return; }
    tagPos.set(r.veh.x, r.veh.y + 1.8, r.veh.z).project(camera);
    if (tagPos.z > 1) { e.hidden = true; return; }
    e.hidden = false;
    if (e._n !== r.name) { e._n = r.name; e.textContent = r.name.split(" ")[0]; e.style.borderColor = "#" + r.color.toString(16).padStart(6, "0"); e._w = 0; }
    if (!e._w) { e._w = e.offsetWidth || 56; e._h = e.offsetHeight || 18; }
    const x = (tagPos.x * 0.5 + 0.5) * innerWidth;
    let y = (-tagPos.y * 0.5 + 0.5) * innerHeight;
    for (let k = 0; k < 3; k++) {
      const hit = placed.find((p) => Math.abs(p.x - x) < (p.w + e._w) / 2 + 2 && Math.abs(p.y - y) < e._h + 2);
      if (!hit) break;
      y = hit.y - e._h - 3;
    }
    placed.push({ x, y, w: e._w });
    e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  });
}

// ---------- rain on the lens: a few drops on the camera in wet races, sliding back and off at speed (kept subtle) ----------
function drawDrops(dt) {
  const c = $("drops"), on = G.wet && (G.mode === "race" || G.mode === "countdown") && !G.photo && chase.mode !== "bonnet" && !G.splitRace;
  if (!on) { if (!c.hidden) { c.hidden = true; G.drops = null; } return; }
  if (c.hidden) { c.hidden = false; c.width = Math.round(innerWidth / 2); c.height = Math.round(innerHeight / 2); G.drops = []; }
  const g = c.getContext("2d"), W = c.width, H = c.height, v = G.player, sp = Math.min(1, Math.max(0, v.vF) / 70);
  if (G.drops.length < 16 && Math.random() < dt * (4 - sp * 1.5)) G.drops.push({ x: Math.random() * W, y: Math.random() * H * 0.8, r: 3 + Math.random() * 6, life: 2 + Math.random() * 3, vx: 0, vy: 0 });
  g.clearRect(0, 0, W, H);
  for (const d of G.drops) {
    d.life -= dt;
    // at speed the airflow pushes drops outwards and up from the middle of the screen
    const ox = d.x - W / 2, oy = d.y - H * 0.55; d.vx += ox * sp * dt * 1.6; d.vy += (oy * sp * 0.6 - 4) * dt + 6 * dt * (1 - sp);
    d.x += d.vx * dt * 30; d.y += d.vy * dt * 30;
    const a = Math.min(1, d.life) * 0.7, gr = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(200,220,235,${a * 0.35})`); gr.addColorStop(1, `rgba(40,50,60,${a * 0.5})`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(d.x, d.y, d.r * (1 + sp * 0.8), d.r, Math.atan2(d.vy, d.vx), 0, Math.PI * 2); g.fill();
  }
  G.drops = G.drops.filter((d) => d.life > 0 && d.x > -10 && d.x < W + 10 && d.y > -10 && d.y < H + 10);
}

// ---------- share replay: every race is quietly recorded (all cars, 20 times a second) and its exciting moments scored;
// "Share replay" films the best 8 seconds with cinematic cameras and slow-mo, adds the logo and result, and saves a video ----------
function hlReset() { G.hl = { f: [], ev: [], acc: 0, posT: 0, pos: -1, cars: [G.player, ...G.field.map((r) => r.veh)], models: [G.car, ...G.field.map((r) => r.model)] }; }
function hlEvent(score) { if (G.hl && (G.mode === "race" || G.mode === "done")) G.hl.ev.push([G.raceTime, score]); }
function hlRecord(dt) {
  const H = G.hl; if (!H || G.mode !== "race") return;
  if ((H.acc += dt) < 0.05) return; H.acc = 0;
  const row = new Float32Array(H.cars.length * 7 + 1); row[0] = G.raceTime;
  H.cars.forEach((v, i) => { const o = 1 + i * 7; row[o] = v.x; row[o + 1] = v.y; row[o + 2] = v.z; row[o + 3] = v.h; row[o + 4] = v.vF; row[o + 5] = v.boosting ? 1 : 0; row[o + 6] = v.wing || 0; });
  H.f.push(row); if (H.f.length > 9600) H.f.shift(); // ~8 minutes
  if ((H.posT -= 0.05) <= 0) { H.posT = 0.5; const p = standings().findIndex((e) => e.me); if (H.pos >= 0 && p < H.pos) hlEvent(2.5 * (H.pos - p)); H.pos = p; } // overtakes
  if (G.player.flying) hlEvent(0.1);
}
// the 8-second window with the most going on, and its biggest moment (played in slow motion)
function hlWindow() {
  const H = G.hl; if (!H || H.f.length < 60) return null;
  const tA = H.f[0][0], tB = H.f[H.f.length - 1][0];
  let best = -1, t0 = Math.max(tA, tB - 8);
  for (let t = tA; t <= tB - 6; t += 0.5) { let sc = 0; for (const [et, v] of H.ev) if (et >= t + 1 && et <= t + 6.5) sc += v; if (sc > best) { best = sc; t0 = t; } }
  let peak = t0 + 4, ps = -1; for (const [et, v] of H.ev) if (et >= t0 + 0.5 && et <= t0 + 7.5 && v > ps) { ps = v; peak = et; }
  return { t0, t1: Math.min(tB, t0 + 8), peak };
}
function hlPose(t) {
  const f = G.hl.f; let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m][0] <= t) lo = m; else hi = m; }
  const a = f[lo], b = f[hi], k = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
  G.hl.cars.forEach((v, i) => {
    const o = 1 + i * 7; let dh = b[o + 3] - a[o + 3]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const h = a[o + 3] + dh * k, vF = a[o + 4] + (b[o + 4] - a[o + 4]) * k;
    Object.assign(v, { x: a[o] + (b[o] - a[o]) * k, y: a[o + 1] + (b[o + 1] - a[o + 1]) * k, z: a[o + 2] + (b[o + 2] - a[o + 2]) * k, h, vx: Math.sin(h) * vF, vz: Math.cos(h) * vF, vy: 0,
      boosting: a[o + 5] > 0.5, wing: a[o + 6] + (b[o + 6] - a[o + 6]) * k, latAcc: 0, lonAcc: 0, driftAngle: 0, steer: 0 });
    v.groundPrev = v.y;
  });
}
function clipStart() {
  const w = hlWindow(); if (!w) return;
  sfx.click();
  G.clip = { ...w, T: w.t0, shot: -1, shotT: 0, slow: false, chunks: [], at: 0 };
  G.mode = "clip"; $("finish").hidden = true; setRaceUI(false); $("clipBar").hidden = false; $("clipBar").textContent = "● REC · filming your highlight";
  // remember the real race state (cars and which models were showing) so filming doesn't disturb it
  G.clip.saved = G.hl.cars.map((v) => ({ ...v })); G.clip.vis = G.hl.models.map((m) => m && m.group && (m.group.visible || !!m.nearHid));
  for (const m of G.hl.models) if (m && m.group) { m.group.visible = true; m.nearHid = false; }
  // the picture plus logo/result overlay is drawn into a 2D canvas, which is what gets recorded (with the game's sound)
  const src = world.renderer.domElement, W = Math.min(1280, src.width), H = Math.round((W * src.height) / src.width) & ~1;
  const c = (G.clip.canvas = document.createElement("canvas")); c.width = W; c.height = H;
  try {
    const stream = c.captureStream(30), au = sfx.audioStream(); if (au) au.getAudioTracks().forEach((t) => stream.addTrack(t));
    const type = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const rec = (G.clip.rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6e6 } : {}));
    rec.ondataavailable = (e) => e.data.size && G.clip && G.clip.chunks.push(e.data);
    rec.start(250);
  } catch (e) { G.clip.rec = null; }
}
const clipV = new THREE.Vector3();
function clipFrame(dt) {
  const C = G.clip; if (!C) return;
  C.slow = Math.abs(C.T - C.peak) < 0.9;
  C.T += dt * (C.slow ? 0.3 : 1); C.at += dt;
  if (C.T >= C.t1 || C.at > 25) return clipEnd();
  hlPose(C.T);
}
// the camera director: cuts between a chase cam, a trackside camera the car blasts past, an orbit (used for the slow-mo) and a low front shot
function clipCamera(dt) {
  const C = G.clip, v = G.player, fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -Math.cos(v.h), rz = Math.sin(v.h);
  C.shotT -= dt;
  const want = C.slow ? 2 : C.shotT <= 0 ? (C.shot + 1) % 4 === 2 ? 3 : (C.shot + 1) % 4 : C.shot;
  if (want !== C.shot) { C.shot = want; C.shotT = 2.4; C.fixed = clipV.set(v.x + fx * 34 + rx * 7, v.y + 1.3, v.z + fz * 34 + rz * 7).clone(); }
  camera.fov = 58; camera.updateProjectionMatrix();
  if (C.shot === 0) { camera.position.set(v.x - fx * 6.5, v.y + 2.2, v.z - fz * 6.5); camera.lookAt(v.x + fx * 6, v.y + 0.8, v.z + fz * 6); }
  else if (C.shot === 1) { camera.position.copy(C.fixed); camera.lookAt(v.x, v.y + 0.6, v.z); }
  else if (C.shot === 2) { const a = C.T * 1.6; camera.position.set(v.x + Math.sin(a) * 6.5, v.y + 1.3, v.z + Math.cos(a) * 6.5); camera.lookAt(v.x, v.y + 0.7, v.z); }
  else { camera.position.set(v.x + fx * 7 + rx * 1.5, v.y + 0.7, v.z + fz * 7 + rz * 1.5); camera.lookAt(v.x, v.y + 0.7, v.z); }
}
function clipCompose() {
  const C = G.clip, c = C.canvas, g = c.getContext("2d"), W = c.width, H = c.height, S = H / 720;
  g.drawImage(world.renderer.domElement, 0, 0, W, H);
  const gr = g.createLinearGradient(0, H * 0.72, 0, H); gr.addColorStop(0, "rgba(6,8,16,0)"); gr.addColorStop(1, "rgba(6,8,16,.75)"); g.fillStyle = gr; g.fillRect(0, H * 0.7, W, H * 0.3);
  const F = (w, px) => `italic ${w} ${Math.round(px * S)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.font = F(800, 64); g.fillStyle = "#fff"; g.fillText("APEX", 36 * S, H - 40 * S); const w1 = g.measureText("APEX ").width;
  g.fillStyle = "#ff7a1a"; g.fillText("RING", 36 * S + w1, H - 40 * S);
  g.fillStyle = "#ff7a1a"; g.fillRect(36 * S, H - 112 * S, 180 * S, 5 * S);
  g.textAlign = "right"; g.font = F(800, 46); g.fillStyle = "#fff";
  g.fillText(`${ordinal(G.place || 1)} · ${fmt(G.playerFinish ?? G.raceTime)}`, W - 36 * S, H - 74 * S);
  g.font = F(700, 26); g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(`${G.track.name.toUpperCase()}  ·  PLAY FREE: JACOBGOODCHILD.ITCH.IO/APEX-RING`, W - 36 * S, H - 40 * S);
  if (C.slow) { g.textAlign = "right"; g.font = F(800, 34); g.fillStyle = "#ffd36b"; g.fillText("SLOW-MO", W - 36 * S, 60 * S); }
}
function clipEnd() {
  const C = G.clip; G.mode = "done"; $("clipBar").hidden = true; $("finish").hidden = false;
  G.hl.cars.forEach((v, i) => Object.assign(v, C.saved[i])); G.hl.models.forEach((m, i) => { if (m && m.group) m.group.visible = C.vis[i]; });
  const done = (blob) => {
    G.clip = null;
    if (!blob || !blob.size) { $("clipBtn").textContent = "🎬 Replay again"; return; }
    const ext = /mp4/.test(blob.type) ? "mp4" : "webm";
    G.clipFile = new File([blob], `apex-ring-${baseId(G.track.id)}-highlight.${ext}`, { type: blob.type });
    $("clipBtn").textContent = "📤 Share video"; toast("Your highlight is ready to share", 2200);
  };
  if (C.rec && C.rec.state !== "inactive") { C.rec.onstop = () => done(new Blob(C.chunks, { type: C.rec.mimeType || "video/webm" })); C.rec.stop(); } else done(null);
}
async function clipShare() {
  const f = G.clipFile; if (!f) return clipStart();
  sfx.click();
  try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: "Apex Ring", text: `${ordinal(G.place || 1)} on ${G.track.name} in Apex Ring 🏁` }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast("Video saved to your downloads", 2000);
}

// ---------- flight challenges: gold rings (boost), updrafts (lift), lightning strikes (dodge them; a near miss pays boost) ----------
const strikeMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const strikeGeo = new THREE.SphereGeometry(1.3, 12, 8);
function flightChallenge(dt, v) {
  const T = performance.now() / 1000;
  for (const u of G.updrafts) { // specks rise and loop
    const a = u.geometry.attributes.position.array;
    for (let i = 1; i < a.length; i += 3) { a[i] += dt * (14 + (i % 7)); if (a[i] > 24) a[i] -= 84; }
    u.geometry.attributes.position.needsUpdate = true;
  }
  if (G.rings.length) {
    const d = v.p.d, first = G.rings[0].userData.d;
    if (d < first - 150 || d > G.rings[G.rings.length - 1].userData.d + 300) { // away from the chasm: reset the rings for the next lap
      if (G.ringHits) { G.ringHits = 0; for (const r of G.rings) { r.userData.hit = false; r.scale.setScalar(1); r.visible = true; } }
    }
    for (const r of G.rings) {
      const u = r.userData; r.rotation.z = T * 0.6 + u.i;
      if (u.hit) { r.scale.multiplyScalar(1 + dt * 4); if (r.scale.x > 2.2) r.visible = false; continue; }
      if (Math.abs(d - u.d) < 3.5 && Math.abs(v.lat - u.lat) < 3.6 && Math.abs(v.y - r.position.y) < 3.6) {
        u.hit = true; G.ringHits++; hlEvent(2);
        v.boost = Math.min(1, v.boost + 0.22); sfx.chime(); popDrift(`${G.ringHits}/${G.rings.length}`, "RING ");
        sparks.emit(r.position.x, r.position.y - 0.4, r.position.z, v.vx * 0.5, v.vz * 0.5, 0, 0, 28, 0.5);
        if (G.ringHits === G.rings.length) { setTimeout(() => popDrift("", "ALL RINGS!"), 700); badge("rings"); }
      }
    }
  }
  // lightning picks a spot just ahead of you while you fly; it glows for a moment, then strikes
  if (G.lightning && (v.flying || (v.wing > 0.5 && v.airborne))) {
    if ((G.strikeT -= dt) <= 0) {
      G.strikeT = 1.0 + Math.random() * 0.9;
      const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -Math.cos(v.h), rz = Math.sin(v.h), ahead = 45 + Math.random() * 35, side = (Math.random() - 0.5) * 18;
      const m = new THREE.Mesh(strikeGeo, strikeMat); m.position.set(v.x + fx * ahead + rx * side, v.y + (Math.random() - 0.3) * 5, v.z + fz * ahead + rz * side);
      scene.add(m); G.strikes.push({ m, t: 0.75 });
    }
  }
  for (let i = G.strikes.length - 1; i >= 0; i--) {
    const k = G.strikes[i]; k.t -= dt; k.m.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(T * 18)));
    if (k.t > 0) continue;
    const p = k.m.position; boltAt(p.x, p.z, p.y, 20); sfx.thunder(60);
    const dist = Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z);
    if (dist < 15) hlEvent(dist < 5 ? 2 : 3);
    if (dist < 5 && !TEST) { v.vx *= 0.82; v.vz *= 0.82; chase.shake = 1; popDrift("", "ZAPPED!"); sfx.thud(8); }
    else if (dist < 15) { v.boost = Math.min(1, v.boost + 0.15); popDrift("", "NEAR MISS +BOOST"); }
    k.m.removeFromParent(); G.strikes.splice(i, 1);
  }
}
function popDrift(n, label = "DRIFT +") {
  const el = $("driftPop"); el.textContent = label + n; el.hidden = false; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  clearTimeout(popDrift._t); popDrift._t = setTimeout(() => (el.hidden = true), 1200);
}

// ---------- simulation ----------
const lookAt = new THREE.Vector3(), camPos = new THREE.Vector3();

function step(dt) {
  if (G.paused) { readControls(false); return; } // still read the gamepad, so its Start button can unpause
  if (G.mode === "replay" || G.mode === "clip") return;
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
      if (!(G.event && G.event.type === "attack")) $("eventTag").hidden = true; // the event brief shows on the grid only
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
  if (racing && ctl.boost) { v.ctl.boost = true; if (v.boost <= 0.12) toast("Boost empty", 1200); }
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
    if (v.driftTime > 0.25 && !v.airborne && !v.flying) { // no drift points in the air
      if (G.driftPts === 0) G.mult = G.raceTime - (G.lastBank ?? -9) < 1.5 ? Math.min(5, (G.mult || 1) + 1) : 1;
      G.driftPts += dt * v.vF * Math.abs(v.driftAngle) * 6; G.driftShow = 1.5;
      if (v.wallHit > 2) { G.driftPts = 0; G.mult = 1; G.lastBank = -9; popDrift("", "DRIFT LOST"); }
    } else if (G.driftPts > 0 && v.driftTime === 0) {
      if (G.driftPts > 20) { const pts = Math.round(G.driftPts * (G.mult || 1)); G.totalDrift += pts; G.bestDrift = Math.max(G.bestDrift || 0, pts); if (pts >= 1000) trophy("drift1k"); if (G.mult >= 5) trophy("combo5"); popDrift(pts + (G.mult > 1 ? "  x" + G.mult : ""), "DRIFT +"); sfx.chime(); G.lastBank = G.raceTime; }
      G.driftPts = 0;
    }
    if (v.boosting && !G.wasBoosting) { hlEvent(1.5); sfx.warp(); if (fxOn()) chase.punch = 1; const f = $("boostFlash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
    // first time the meter has charge, explain how to boost
    if (v.boost > 0.3 && !save.boostHint && !TEST) {
      save.boostHint = true; writeSave();
      toast(matchMedia("(pointer: coarse)").matches ? "Boost ready! Tap BOTH sides of the screen together, twice." : "Boost ready! Press Space.", 4500);
    }
    G.wasBoosting = v.boosting;
    G.raceTime += dt;
    tyreFx("p", v, dt); G.field.forEach((r, i) => tyreFx("r" + i, r.veh, dt)); hlRecord(dt); tutorialStep(dt);
    // a photo finish: on the last lap, a rival right alongside you in the final 45 m slows time down at the line
    if (!G.photoFin && !TEST && G.lapTimes.length === laps() - 1) {
      const left = laps() * G.path.length - v.totalD;
      const rivals = G.field.map((r) => r.veh).concat(G.netRace && G.net ? [...G.net.peers.values()].filter((q) => q.racing).map((q) => q.veh) : []);
      if (left > 0 && left < 45 && rivals.some((r) => Math.abs(r.totalD - v.totalD) < 6)) { G.photoFin = true; G.slowmo = 1.4; popDrift("", "PHOTO FINISH"); hlEvent(5); }
    }
    const L = G.path.length, done = G.lapTimes.length;
    if (trialMode() && v.totalD >= done * L) G.ghost.record(G.raceTime - G.lapStart, v);
    if (v.totalD >= (done + 1) * L) {
      const lap = G.raceTime - G.lapStart; G.lapTimes.push(lap); G.lapStart = G.raceTime;
      if (trialMode()) {
        const rec = G.ghost.lapDone(lap), old = save.ghosts[G.track.id];
        // the very first lap starts behind the line, so only keep it if there's nothing better
        if (!old || lap < old.t) { save.ghosts[G.track.id] = rec; G.ghost.load(rec); uploadGhost(G.track.id, rec); }
        // beat a ghost you loaded from the online boards
        const fg = (save.friendGhosts || {})[G.track.id]; if (fg && fg.online && lap < fg.t) badge("ghostbuster");
      }
      logLap(G.track.id, lap); uploadLap(G.track.id, lap);
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
  if (v.airDone > 0.7 && G.mode === "race") { hlEvent(2 + v.airDone); v.boost = Math.min(1, v.boost + Math.min(0.3, v.airDone * 0.12)); popDrift(v.airDone.toFixed(1) + "s", "BIG AIR "); sfx.chime(); G.airPops = (G.airPops || 0) + 1; }
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
  if (last.me) { G.eliminated = true; toast("You're out!", 2000); finishRace(); return; }
  last.out = true; last.model.group.visible = false; last.model.nearHid = false; last.veh.reset(-2000, 0);
  G.field = G.field.filter((r) => r !== last);
  toast(last.name + " is out!", 1800); sfx.thud(4);
  if (!G.field.length) { toast("Last one standing!", 2000); finishRace(); } // knockout won
}

// ---------- Zeus's Fury: wings, flight HUD, the captain's welcome, lightning ----------
const smoothK = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function flightFx(dt) {
  const v = G.player, T = performance.now() / 1000;
  if (!G.car.wings) { addWings(G.car, G.car.paintHex || 0x3a4250, 1); setWingSkin(G.car, save.wingSkin || "paint"); }
  setWings(G.car, v.wing || 0, T, v.flying, v.steer, v.boosting);
  for (const r of G.field) { if (!r.model.wings) addWings(r.model, r.color || 0x3a4250, 0); setWings(r.model, r.veh.wing || 0, T, r.veh.flying, r.veh.steer, r.veh.boosting); }
  if (G.mode !== "race" || G.paused) return;
  flightChallenge(dt, v);
  // the wings start to unfurl: servos, then the ship's computer welcomes you aboard
  if (v.wingWant && !G.wingCalled) {
    G.wingCalled = true; sfx.servo(); G.voiceT = setTimeout(() => sfx.voice("wings"), 450);
    subtitle("WELCOME ABOARD, CAPTAIN. ALL SYSTEMS ONLINE.", 600);
  }
  if (!v.wingWant && G.wingCalled && !G.wingFold && (v.wing || 0) > 0.4) { G.wingFold = true; sfx.servo(); } // wings fold away with the same servo whirr
  if (v.wingWant) G.wingFold = false;
  if (!v.wingWant && (v.wing || 0) < 0.05) G.wingCalled = false;
  const hud = $("flightHud"), on = (v.wing || 0) > 0.55;
  if (hud.hidden === on) hud.hidden = !on;
  if (on) {
    const alt = v.y - (G.path.gapAt(v.p.d) ? v.p.y : v.p.y), far = G.path.gapAt(v.p.d);
    $("fltAlt").textContent = (alt >= 0 ? "+" : "") + alt.toFixed(0) + " m";
    $("fltState").textContent = v.flying ? (v.boosting ? "THRUSTERS" : "GLIDING") : v.airborne ? "AIRBORNE" : "WINGS OUT";
    $("fltBar").style.width = Math.round(Math.max(0, Math.min(1, (alt + 20) / 40)) * 100) + "%";
    hud.classList.toggle("warn", !!far && alt < -6);
  }
  if (v.gapCleared) { v.gapCleared = false; popDrift("", "CHASM CLEARED"); sfx.chime(); trophy("wings"); }
}
function stopFlightFx() {
  $("flightHud").hidden = true; $("subtitle").hidden = true; G.wingCalled = false;
  for (const k of G.strikes || []) k.m.removeFromParent(); G.strikes = [];
  clearInterval(subtitle._i); clearTimeout(subtitle._t); clearTimeout(subtitle._d); clearTimeout(G.voiceT);
}
function subtitle(text, delay = 0) {
  const el = $("subtitle"); clearInterval(subtitle._i); clearTimeout(subtitle._t); clearTimeout(subtitle._d);
  subtitle._d = setTimeout(() => {
    el.textContent = ""; el.hidden = false; let k = 0;
    subtitle._i = setInterval(() => { el.textContent = text.slice(0, ++k); if (k >= text.length) { clearInterval(subtitle._i); subtitle._t = setTimeout(() => (el.hidden = true), 2200); } }, 55);
  }, delay);
}
// Lightning: every few seconds a jagged bolt cracks down somewhere round the horizon, the world flashes, thunder follows.
const boltMat = new THREE.MeshBasicMaterial({ color: 0xe6eeff, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
function lightning(dt) {
  G.ltT = (G.ltT ?? 2.5) - dt;
  if (G.ltFlash > 0) {
    G.ltFlash = Math.max(0, G.ltFlash - dt * 2.4);
    const f = G.ltFlash * (0.6 + 0.4 * Math.sin(G.ltFlash * 40)); // flickers as it fades
    world.hemi.intensity = G.ltBase + f * 2.2; $("flash").style.opacity = (f * 0.28).toFixed(3);
    if (G.bolt) G.bolt.material.opacity = Math.min(1, G.ltFlash * 1.6);
    if (G.ltFlash <= 0) { world.hemi.intensity = G.ltBase; $("flash").style.opacity = 0; if (G.bolt) { G.bolt.removeFromParent(); G.bolt.geometry.dispose(); G.bolt.material.dispose(); G.bolt = null; } }
  }
  if (G.ltT > 0 || G.mode !== "race" || G.paused) return;
  G.ltT = 3 + Math.random() * 7;
  const a = Math.random() * Math.PI * 2, dist = 350 + Math.random() * 700;
  boltAt(camera.position.x + Math.sin(a) * dist, camera.position.z + Math.cos(a) * dist, -10, 50);
  sfx.thunder(dist);
}
// a bolt from the cloud base down to (cx, yEnd, cz); jitter = how far it wanders sideways per step
function boltAt(cx, cz, yEnd, jitter) {
  if (!(G.ltFlash > 0)) G.ltBase = world.hemi.intensity;
  G.ltFlash = 1;
  // the bolt: a jagged ribbon from the cloud base to the ground, facing the camera, with a branch
  const pts = []; let x = cx + (Math.random() - 0.5) * jitter * 2, y = yEnd + 420, z = cz + (Math.random() - 0.5) * jitter * 2;
  while (y > yEnd + 5) { pts.push([x, y, z]); const k = Math.min(1, (y - yEnd) / 120); x += (Math.random() - 0.5) * jitter * k + (cx - x) * (1 - k) * 0.5; z += (Math.random() - 0.5) * jitter * k + (cz - z) * (1 - k) * 0.5; y -= 18 + Math.random() * 30; }
  pts.push([cx, yEnd, cz]);
  const pos = [], toCam = new THREE.Vector3(), seg = new THREE.Vector3(), side = new THREE.Vector3();
  const ribbon = (P, w) => { for (let i = 0; i < P.length - 1; i++) {
    const [a1, b1, c1] = P[i], [a2, b2, c2] = P[i + 1];
    seg.set(a2 - a1, b2 - b1, c2 - c1); toCam.set(camera.position.x - a1, camera.position.y - b1, camera.position.z - c1); side.crossVectors(seg, toCam).normalize().multiplyScalar(w);
    pos.push(a1 - side.x, b1 - side.y, c1 - side.z, a1 + side.x, b1 + side.y, c1 + side.z, a2 + side.x, b2 + side.y, c2 + side.z, a1 - side.x, b1 - side.y, c1 - side.z, a2 + side.x, b2 + side.y, c2 + side.z, a2 - side.x, b2 - side.y, c2 - side.z);
  } };
  ribbon(pts, 2.2);
  const k = Math.floor(pts.length * 0.4), br = [pts[k]]; let [bx, by, bz] = pts[k];
  for (let j = 0; j < 5; j++) { bx += (Math.random() - 0.3) * 60; bz += (Math.random() - 0.3) * 60; by -= 25 + Math.random() * 20; br.push([bx, by, bz]); }
  ribbon(br, 1.2);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (G.bolt) { G.bolt.removeFromParent(); G.bolt.geometry.dispose(); G.bolt.material.dispose(); }
  G.bolt = new THREE.Mesh(g, boltMat.clone()); G.bolt.frustumCulled = false; scene.add(G.bolt);
}

// Smoke + skid marks from the rear wheels when a car slides or brakes hard. Runs every physics tick (so a short
// slide still marks the road on a slow phone); the wheel positions come from the car's state, not its model.
function tyreFx(key, v, dt) {
  if (v.wallHit > 2.5 && !v.airborne) { const s = Math.sign(v.lat) || 1, nx = Math.cos(v.p.h) * s, nz = -Math.sin(v.p.h) * s; sparks.emit(v.x - nx * 0.9, v.y, v.z - nz * 0.9, v.vx, v.vz, nx, nz, Math.min(34, 8 + v.wallHit * 2)); }
  // a hard landing scrapes the underbody: a shower of sparks from under the car
  if (v.landed > 9) { const fx = Math.sin(v.h), fz = Math.cos(v.h); sparks.emit(v.x - fx * 1.2, v.y - 0.2, v.z - fz * 1.2, v.vx * 0.8, v.vz * 0.8, -fx, -fz, Math.min(40, Math.round(v.landed * 2)), 0.6); }
  if (v.airborne) { skids.mark(key + 2, 0, 0, 0, 0, 0); skids.mark(key + 3, 0, 0, 0, 0, 0); return; }
  const slide = Math.abs(v.driftAngle) > 0.12 && v.vF > 12 ? Math.min(1, (Math.abs(v.driftAngle) - 0.08) * 4) : 0;
  const lock = v.lonAcc < -18 && v.vF > 15 ? 0.6 : 0;
  const k = Math.max(slide, lock);
  const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -Math.cos(v.h), rz = Math.sin(v.h);
  for (let w = 2; w < 4; w++) {
    const side = w === 2 ? -0.82 : 0.82, x = v.x - fx * 1.35 + rx * side, z = v.z - fz * 1.35 + rz * side;
    skids.mark(key + w, x, v.y, z, v.h, k);
    if (k > 0.2 && Math.random() < k * dt * 40) smoke.emit(x, v.y, z, v.vx, v.vz, k);
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
  updateFlames(m, v.boosting, performance.now() / 1000, !far && v.lonAcc < -5 && v.vF > 30, dt);
  // a car right against the lens would fill the screen: hide it while it's there (only ever un-hiding what this hid)
  // (chase cams in a normal race only: not split-screen, where P2's own car is in the field, not the replay clip, and not
  // the bonnet cam, where a car you're drafting is meant to be right there)
  const dy = v.y + 0.8 - camera.position.y, near = G.mode !== "clip" && !G.splitRace && chase.mode !== "bonnet" && dx * dx + dy * dy + dz * dz < 4.2 * 4.2;
  if (near && m.group.visible) { m.group.visible = false; m.nearHid = true; } else if (!near && m.nearHid) { m.group.visible = true; m.nearHid = false; }
  m.group.position.set(v.x, v.y, v.z); m.group.rotation.set(pitchOf(v), v.h, 0, "YXZ");
  updateContactShadow(m, v.y, v.groundPrev ?? v.y); brakeLights(m, v); if (!far) wheelBlur(m, v.vF);
  m.body.rotation.z = clamp(-v.latAcc * 0.0035, -0.06, 0.06); m.body.rotation.x = clamp(-v.lonAcc * 0.002, -0.03, 0.03);
  m.wheels.forEach((w) => (w.rotation.x += v.vF * dt / 0.36)); m.steerers.forEach((p) => (p.rotation.y = -v.steer * 0.4));
}

function render(dt) {
  const v = G.player, car = G.car;
  if (G.mode === "clip") clipFrame(dt);
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
  if (updateFlames(car, v.boosting || showFlames, performance.now() / 1000, G.mode === "race" && v.lonAcc < -5 && v.vF > 28, dt)) sfx.crackle();
  if (G.path && G.path.gaps.length && G.mode !== "menu") flightFx(dt); else { if (car.wings && car.wings.rig.visible) setWings(car, 0); for (const r of G.rivals) if (r.model.wings && r.model.wings.rig.visible) setWings(r.model, 0); }
  if (G.lightning) lightning(dt);
  if (car.beams) car.beams.visible = false; // the player has a real spotlight at night instead
  if (G.ghost) G.ghost.update(G.raceTime - G.lapStart, trialMode() && G.mode === "race");
  if (G.friend) G.friend.update(G.raceTime - G.lapStart, trialMode() && G.mode === "race");
  if (G.net) netFrame(dt);
  smoke.update(dt, world.renderer.domElement.clientHeight || innerHeight); sparks.update(dt); fireworks.update(dt); drawDrops(dt);
  drawRocks();
  if (G.water) { G.water.offset.x += dt * 0.012; G.water.offset.y += dt * 0.007; }
  if (G.waterfall) G.waterfall.material.map.offset.y += dt * 1.4;
  speedLines.update(dt, v.vF, G.mode === "race" && fxOn() && !G.photo ? (v.boosting ? 1 : Math.max(0, (v.vF / v.spec.vmax - 0.8) * 3)) : 0);
  if (!fxOn()) chase.shake = 0;

  car.group.position.y += Math.sin(G.bob = (G.bob || 0) + dt * v.vF * 0.9) * 0.006 * Math.min(1, v.vF / 30);
  const portrait = camera.aspect < 1;
  if (G.mode === "menu" && G.title) {
    titleCamera(dt);
  } else if (G.mode === "menu") {
    G.menuT += dt;
    // doors stay shut in the showroom, except for the moment just after you pick a car
    if (G.showT != null) G.showT += dt;
    const sm = G.showT, want = sm != null && sm > 0.15 && sm < 2.3 ? 1 : 0;
    if (car.headMat) car.headMat.emissiveIntensity = sm != null && sm < 0.9 ? [0, 1.6, 0.2, 1.6, 0, 1.6, 1.6][Math.min(6, Math.floor(sm / 0.13))] : 1.6;
    if (sm > 3) G.showT = null;
    G.doors += (want - G.doors) * Math.min(1, dt * 2.2); setDoors(G.car, G.doors);
    car.group.position.set(0, 0, 0); car.group.rotation.set(0, 0, 0, "YXZ"); car.body.rotation.set(0, 0, 0); car.body.position.y = 0;
    updateContactShadow(car, 0, 0);
    showroom.update(dt, camera);
    chase.snap(v);
  } else if (G.slowmo > 0 && G.mode === "race") {
    // photo-finish camera: low, beside the car, looking across at the line
    const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -Math.cos(v.h), rz = Math.sin(v.h);
    camera.position.set(v.x + rx * 7 + fx * 3, v.y + 1.0, v.z + rz * 7 + fz * 3); camera.lookAt(v.x - fx * 1, v.y + 0.6, v.z - fz * 1);
  } else if (G.mode === "clip" && G.clip) {
    clipCamera(dt);
  } else if (G.photo) {
    G.camOff = null;
    const P = G.photo, c = Math.cos(P.e);
    camera.position.set(v.x + Math.sin(P.a) * P.d * c, v.y + 0.6 + Math.sin(P.e) * P.d, v.z + Math.cos(P.a) * P.d * c);
    camera.lookAt(v.x, v.y + 0.7, v.z);
  } else {
    if (G.camOff) camera.position.sub(G.camOff); // take last frame's flight offset off before the chase cam eases
    chase.update(v, dt, v.boosting ? 1 : 0);
    // flight camera: up and back with the wings out, so you see them and the chasm
    const k = G.mode === "race" || G.mode === "done" ? smoothK(v.wing || 0) : 0;
    G.camOff = null;
    if (k > 0.01) { G.camOff = new THREE.Vector3(-Math.sin(v.h) * 1.6 * k, 0.9 * k, -Math.cos(v.h) * 1.6 * k); camera.position.add(G.camOff); camera.lookAt(v.x + Math.sin(v.h) * 6 * k, v.y + 0.9, v.z + Math.cos(v.h) * 6 * k); } // close behind, wings filling the frame
  }
  // spectating a friend after you've finished: a camera that trails their car
  if (G.spectate >= 0 && G.mode === "done") {
    const t = spectateTarget();
    if (!t) { G.spectate = -1; $("spectate").hidden = true; $("finish").hidden = false; }
    else {
      const g = t.model.group, h = g.rotation.y, want = tagPos.set(g.position.x - Math.sin(h) * 7, g.position.y + 2.6, g.position.z - Math.cos(h) * 7);
      G.specPos = G.specPos ? G.specPos.lerp(want, Math.min(1, dt * 6)) : want.clone(); camera.position.copy(G.specPos); camera.lookAt(g.position.x + Math.sin(h) * 8, g.position.y + 1, g.position.z + Math.cos(h) * 8);
      $("spectate").textContent = `Watching ${t.name} · tap for the next car`;
    }
  }
  if (G.splitRace && G.p2 && G.mode !== "menu") {
    chase2.update(G.p2.veh, dt, G.p2.veh.boosting ? 1 : 0);
    const order = standings(), L = G.path.length, n = laps();
    const box = (e, veh, who) => `<span class="p">${who}</span><b>${ordinal(order.indexOf(e) + 1)}</b> · Lap ${Math.min(n, Math.floor(Math.max(0, veh.totalD) / L) + 1)}/${n} · ${speedOf(veh.vF)} ${unitName()}`;
    $("shud1").innerHTML = box(order.find((e) => e.me), G.player, "P1"); $("shud2").innerHTML = box(G.p2, G.p2.veh, "P2");
  }
  // rain and snow sit in a box around the camera, so place them after the camera has moved this frame
  if (G.rain) G.rain.update(Math.min(dt, 0.05), camera.position, G.mode === "menu" ? 0 : v.vx, G.mode === "menu" ? 0 : v.vz);
  if (G.snow) G.snow.update(Math.min(dt, 0.05), camera.position, G.mode === "menu" ? 0 : v.vx, G.mode === "menu" ? 0 : v.vz);
  car.body.visible = chase.mode !== "bonnet" || G.mode === "menu";
  world.follow(v.x, v.y, v.z);

  if (G.mode !== "menu") {
    $("lapV").textContent = G.event && G.event.type === "attack" ? String(G.lapTimes.length + 1) : Math.min(G.lapTimes.length + 1, laps()) + "/" + laps();
    $("timeV").textContent = fmt(G.mode === "race" ? G.raceTime - G.lapStart : G.lapTimes[G.lapTimes.length - 1] || 0);
    if ((G.hudTick = (G.hudTick || 0) + 1) % 6 === 0) {
      const o = standings(), i = o.findIndex((e) => e.me);
      $("posV").textContent = ordinal(i + 1) + "/" + o.length;
      // gained a place: the chip flashes green with a little rising blip; lost one: a red flash (no extra text on screen)
      if (G.mode === "race" && G.lastPos >= 0 && i !== G.lastPos && G.raceTime > 2) {
        const c = $("posV").parentElement; c.classList.remove("up", "down"); void c.offsetWidth; c.classList.add(i < G.lastPos ? "up" : "down");
        if (i < G.lastPos && G.raceTime - (G.passT || -9) > 1.2) { G.passT = G.raceTime; sfx.passed(); }
      }
      G.lastPos = i;
      // gap to the car ahead (or behind when leading), in seconds at current speed
      const other = i > 0 ? o[i - 1] : o[1];
      if (other && G.mode === "race" && $("flightHud").hidden) {
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
    $("spdV").textContent = speedOf(v.vF);
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
  sfx.updateAudio(v.vF, v.spec.vmax, G.mode === "race" || G.mode === "countdown" || G.mode === "replay" || G.mode === "clip", Math.min(1, Math.abs(v.driftAngle) * 3), v.boosting);
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
// trophies won during a race wait for the results screen, so nothing pops up over the road
function trophy(id) {
  const t = award(save, id); if (!t) return;
  writeSave(); sfx.chime();
  if (G.mode === "race" || G.mode === "countdown" || G.mode === "done") (G.trophyQ = G.trophyQ || []).push(t.name);
  else setTimeout(() => toast(`Trophy: ${t.name} · +${TROPHY_COINS}`, 2600), 300);
}
function flushTrophies() {
  const q = G.trophyQ || []; G.trophyQ = [];
  if (q.length) setTimeout(() => toast(`${q.length > 1 ? "Trophies" : "Trophy"}: ${q.join(", ")} · +${TROPHY_COINS * q.length}`, 3200), 400);
}
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
// ---------- title screen: a slow camera fly-by along the track behind the logo, until the first tap ----------
function startTitle() {
  if (TEST || !G.path) return;
  G.title = { d: G.path.length * 0.1 }; $("title").hidden = false; document.body.classList.add("titling");
  const go = () => { if (!G.title) return; G.title = null; $("title").hidden = true; document.body.classList.remove("titling"); sfx.startAudio(); afterTitle(); removeEventListener("pointerdown", go); removeEventListener("keydown", go); };
  setTimeout(() => { addEventListener("pointerdown", go); addEventListener("keydown", go); }, 300);
}
function titleCamera(dt) {
  const T = G.title; T.d = (T.d + dt * 32) % G.path.length;
  const p = G.path.pointAt(T.d, -4 + Math.sin(T.d / 90) * 6, {}), q = G.path.pointAt(T.d + 40, Math.sin((T.d + 40) / 90) * 6, {});
  camera.fov = 55; camera.updateProjectionMatrix();
  camera.position.set(p.x, p.y + 4.5 + Math.sin(T.d / 140) * 2, p.z); camera.lookAt(q.x, q.y + 1.5, q.z);
}
// ---------- tutorial (optional, from the home screen): a guided lap of Dusk Oval ----------
const TUT = [["Steer", "Hold the LEFT or RIGHT side of the screen (or ← →) to steer"], ["Drift", "Steer hard into the bend at speed: the car drifts by itself and fills your boost"],
  ["Boost", "Tap BOTH sides of the screen together, twice (or Space) to boost"], ["Finish", "Brilliant! Now finish the lap. The car brakes for corners by itself"]];
function startTutorial() {
  sfx.startAudio(); sfx.click(); save.tutHint = true; writeSave();
  const was = save.settings.raceMode;
  G.tut = { step: 0, t: 0 }; G.event = null; G.cup = null; G.split = false; loadTrack("oval", "dry"); setMode(true); save.settings.raceMode = was; writeSave(); G.lapsOverride = 1; startRace();
}
function tutorialStep(dt) {
  const T = G.tut, v = G.player; if (!T || G.mode !== "race") return;
  T.t += dt;
  const ok = T.step === 0 ? Math.abs(v.steer) > 0.5 && T.t > 1 : T.step === 1 ? v.driftTime > 0.35 || T.t > 14 : T.step === 2 ? v.boosting || T.t > 12 : false;
  if (ok) { T.step++; T.t = 0; sfx.chime(); if (T.step === 2) v.boost = Math.max(v.boost, 0.6); }
  $("tutBox").hidden = false; $("tutStep").textContent = `${Math.min(T.step + 1, 4)} / 4 · ${TUT[T.step][0]}`; $("tutMsg").textContent = TUT[T.step][1];
}
function endTutorial() { if (!G.tut) return; G.tut = null; G.lapsOverride = TEST && QS.get("laps") ? Number(QS.get("laps")) : 0; $("tutBox").hidden = true; }
$("tutBtn").addEventListener("click", startTutorial);
function afterTitle() { if (!save.tutHint && !save.tutDone && !TEST) { save.tutHint = true; writeSave(); setTimeout(() => toast("New here? Tap Tutorial at the bottom of the home screen for a 1-minute guided lap", 5000), 900); } }

// daily streak reward, and (with online play) "I'm online" + listening for race invites
if (!TEST) { checkStreak(); document.addEventListener("visibilitychange", () => { if (!document.hidden) checkStreak(); }); }
syncBadges();
setTimeout(() => { if (G.mode === "menu") startTitle(); else afterTitle(); }, 50);
setTimeout(startPresence, 2500);

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
  if (G.slowmo > 0) G.slowmo -= real; // photo finish: the last metres play at a third of the speed
  acc += real * TIME_SCALE * (G.slowmo > 0 ? 0.3 : 1);
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
  if (save.settings.fps) {
    // Settings > Show FPS: frames per second (averaged over half a second), render resolution and draw calls
    const F = (G.fpsMeter = G.fpsMeter || { n: 0, t: 0 }); F.n++; F.t += raw;
    if (F.t >= 500) { $("fpsV").textContent = `${Math.round((F.n * 1000) / F.t)} fps · ${Math.round((world.prScale || 1) * 100)}% res · ${world.renderer.info.render.calls} draws`; F.n = 0; F.t = 0; }
  }
  if (G.splitRace && G.p2 && G.mode !== "menu") { world.renderSplit([camera, camera2]); G.wasSplit = true; }
  else { if (G.wasSplit) { G.wasSplit = false; world.resize(); } world.render(G.mode === "menu" && !G.title ? showroom.scene : null); }
  if (G.clip) clipCompose();
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
    // freeze the race and frame the car from a photo-mode camera (angle relative to the car's heading); used for track previews
    get net() { const n = G.net; return n ? { code: n.code, racing: n.racing, peers: [...n.peers.values()].map((q) => ({ name: q.name, shown: !!(q.model && q.model.group.visible), x: q.model ? q.model.group.position.x : null })), standings: G.path ? standings().length : 0 } : null; },
    photo(a, e, d) { G.paused = true; G.photo = { a: G.player.h + a, e, d }; document.body.classList.add("photo"); $("pause").hidden = true; $("hud").hidden = true; },
    gapD() { return G.path.gaps.length ? G.path.gaps[0].d0 : -1; },
    get flight() { const v = G.player; return { wing: +(v.wing || 0).toFixed(2), flying: !!v.flying, air: !!v.airborne, y: +v.y.toFixed(1), road: +v.p.y.toFixed(1), vF: +v.vF.toFixed(0), d: +v.p.d.toFixed(0) }; },
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
