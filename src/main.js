// Apex Ring entry point: builds the world, runs the fixed-step game loop and drives the menus.
import * as THREE from "three";
import { TEST, TIME_SCALE, AUTOPILOT, SEED } from "./env.js";
import { loadSave, writeSave, save, carSave } from "./save.js";
import { World, autoQuality } from "./scene.js";
import { TrackPath } from "./track.js";
import { buildTrackMeshes } from "./trackmesh.js";
import { buildScenery } from "./scenery.js";
import { TRACKS, THEMES, trackById } from "./tracks.js";
import { CARS, PAINTS, carById, carSpec } from "./cars.js";
import { makeCar, setDoors } from "./carmodel.js";
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
const skids = new Skids(scene), smoke = new Smoke(scene), speedLines = new SpeedLines(camera);
chase.mode = save.settings.camera === "bonnet" ? "bonnet" : "chase";

const QS = new URLSearchParams(location.search);
const G = {
  mode: "menu", track: null, path: null, player: null, car: null, lapsOverride: TEST && QS.get("laps") ? Number(QS.get("laps")) : 0,
  countT: 0, raceTime: 0, lapStart: 0, lapTimes: [], menuT: 0, doors: 1, paused: false, rivals: [], finishOrder: [],
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
  drawTrack(previewCtx, G.path, 96, { width: 4 });
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
function buildPlayer() {
  const def = carById(save.car), cs = carSave(def.id);
  if (G.car) scene.remove(G.car.group);
  G.car = makeCar(def, PAINTS[cs.paint % PAINTS.length].hex);
  addFlames(G.car);
  G.car.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(G.car.group);
  G.player = new Vehicle(carSpec(def, cs.upgrades), G.path);
  G.player.reset(-8, 0);
}

// Grid slots: two columns, staggered. The player starts near the back so there's a field to race through.
function slot(k) { const row = Math.floor(k / 2), col = k % 2; return [-7 - row * 9 - col * 4.5, col ? -3.3 : 3.3]; }

function buildRivals() {
  for (const r of G.rivals) scene.remove(r.model.group);
  G.rivals = [];
  const rnd = makeRng(SEED ^ 0x77);
  for (let k = 0; k < G.nRivals; k++) {
    const prof = RIVALS[k % RIVALS.length], def = CARS[k % CARS.length];
    const veh = new Vehicle(carSpec(def, {}), G.path);
    const model = makeCar(def, prof.color);
    addFlames(model);
    setDoors(model, 0);
    scene.add(model.group);
    G.rivals.push({ veh, model, driver: new Driver(veh, prof, 0.95 + rnd() * 0.05, (SEED + k * 977) >>> 0), name: prof.name, color: prof.color });
  }
}

function gridUp() {
  G.player.spec = carSpec(carById(save.car), carSave(save.car).upgrades);
  G.player.track = G.path; G.player.boost = 0.25;
  const ps = slot(Math.min(G.gridSlot, G.rivals.length)); G.player.reset(ps[0], ps[1]);
  let k = 0;
  for (const r of G.rivals) {
    if (k === Math.min(G.gridSlot, G.rivals.length)) k++;
    const [d, lat] = slot(k++); r.veh.track = G.path; r.veh.boost = 0.25; r.veh.reset(d, lat); r.finished = null;
  }
  G.raceTime = 0; G.lapStart = 0; G.lapTimes = []; G.finishOrder = []; G.playerFinish = null;
  skids.clear(); G.driftPts = 0; G.driftShow = 0; G.totalDrift = 0;
}

// Everyone in the race, ordered by position.
function standings() {
  const L = G.path.length, n = laps();
  const all = [{ veh: G.player, name: "You", me: true, finished: G.playerFinish, color: 0xf2a65a }, ...G.rivals];
  return all.sort((a, b) => {
    if (a.finished != null && b.finished != null) return a.finished - b.finished;
    if (a.finished != null) return -1; if (b.finished != null) return 1;
    return Math.min(b.veh.totalD, n * L) - Math.min(a.veh.totalD, n * L);
  });
}
const ordinal = (n) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

const laps = () => G.lapsOverride || G.track.laps;

// ---------- UI ----------
function toast(msg, ms = 3200) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
const fmt = (t) => { if (t == null || !isFinite(t)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
function setRaceUI(on) { ["hud", "speedo", "pads", "topbtns", "minimap"].forEach((id) => ($(id).hidden = !on)); if (!on) { $("drift").hidden = true; $("driftPop").hidden = true; } }

function buildPaints() {
  const el = $("paints"); el.innerHTML = "";
  const cs = carSave(save.car);
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
  gridUp();
  ["menu", "finish", "pause"].forEach((id) => ($(id).hidden = true));
  setRaceUI(true); G.paused = false; minimap.setTrack(G.path);
  $("count").hidden = false; G.mode = "countdown"; G.countT = 0; G.lastBeep = -1;
}

function toMenu() {
  sfx.click();
  G.mode = "menu"; G.paused = false;
  ["finish", "pause", "count"].forEach((id) => ($(id).hidden = true));
  setRaceUI(false); $("menu").hidden = false;
  gridUp();
}

function finishRace() {
  G.mode = "done";
  G.playerFinish = G.raceTime;
  const order = standings(), place = order.findIndex((e) => e.me) + 1;
  G.place = place;
  const fastest = Math.min(...G.lapTimes);
  let html = `<div class="place">${ordinal(place)}<small> of ${order.length}</small></div><ol class="standings">`;
  const L = G.path.length;
  order.forEach((e, i) => {
    const gap = e.finished != null ? fmt(e.finished) : "~" + fmt(G.raceTime + Math.max(0.5, (laps() * L - e.veh.totalD) / Math.max(25, e.veh.vF || 40)));
    html += `<li class="${e.me ? "me" : ""}"><span class="pos">${i + 1}</span><span class="sw" style="background:#${e.color.toString(16).padStart(6, "0")}"></span><span class="nm">${e.name}</span><span class="tm">${gap}</span></li>`;
  });
  html += `</ol><div class="laps">Best lap <b>${fmt(fastest)}</b> · Record <b>${fmt(save.best[G.track.id])}</b></div>`;
  $("results").innerHTML = html;
  writeSave();
  setTimeout(() => { if (G.mode === "done") { setRaceUI(false); $("finish").hidden = false; } }, TEST ? 200 : 1400);
}

function pause(on) {
  if (G.mode !== "race" && G.mode !== "countdown") return;
  G.paused = on; $("pause").hidden = !on;
}

$("startBtn").addEventListener("click", startRace);
$("againBtn").addEventListener("click", startRace);
$("menuBtn").addEventListener("click", toMenu);
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
  const cars = [G.player, ...G.rivals.map((r) => r.veh)], L = G.path.length;
  for (const r of G.rivals) {
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
  G.doors += ((G.mode === "menu" ? 1 : 0) - G.doors) * Math.min(1, dt * 3.2);
  setDoors(G.car, G.doors);

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
    collide([v, ...G.rivals.map((r) => r.veh)], (a, b, k) => { if (k > 3 && (a === v || b === v)) { chase.shake = Math.min(0.6, k * 0.04); sfx.thud(k); } });
    v.draft = 1;
    for (const r of G.rivals) { const dd = r.veh.totalD - v.totalD; if (dd > 6 && dd < 35 && Math.abs(r.veh.lat - v.lat) < 2.4) v.draft = 1.045; }
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
      if (best == null || lap < best) { save.best[G.track.id] = lap; writeSave(); if (G.lapTimes.length < laps()) toast("New best lap · " + fmt(lap), 1800); }
      if (G.lapTimes.length >= laps()) finishRace();
    }
  }
  if (v.wallHit > 4) { chase.shake = Math.min(1, v.wallHit * 0.05); sfx.thud(v.wallHit); }
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
  for (const r of G.rivals) poseCar(r.model, r.veh, dt);
  updateFlames(car, v.boosting, performance.now() / 1000);
  if (G.mode === "race" || G.mode === "done") {
    tyreFx("p", car, v, dt);
    G.rivals.forEach((r, i) => tyreFx("r" + i, r.model, r.veh, dt));
  }
  smoke.update(dt, world.renderer.domElement.clientHeight || innerHeight);
  speedLines.update(dt, v.vF, G.mode === "race" ? (v.boosting ? 1 : Math.max(0, (v.vF / v.spec.vmax - 0.8) * 3)) : 0);

  car.group.position.y += Math.sin(G.bob = (G.bob || 0) + dt * v.vF * 0.9) * 0.006 * Math.min(1, v.vF / 30);
  const portrait = camera.aspect < 1;
  if (G.mode === "menu") {
    G.menuT += dt;
    const a = G.menuT * 0.22 + 2.2, rad = portrait ? 10.5 : 7.5;
    camPos.set(v.x + Math.sin(a) * rad, v.y + (portrait ? 3.2 : 2.2), v.z + Math.cos(a) * rad);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 3));
    lookAt.set(v.x, v.y + (portrait ? -1.6 : 0.3), v.z);
    camera.fov += ((portrait ? 62 : 50) - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    camera.lookAt(lookAt);
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
    minimap.draw([...G.rivals.map((r) => ({ x: r.veh.x, z: r.veh.z, color: "#" + r.color.toString(16).padStart(6, "0") })), { x: v.x, z: v.z, color: "#f2a65a", me: true }]);
  }
  sfx.updateAudio(v.vF, v.spec.vmax, G.mode === "race" || G.mode === "countdown", Math.min(1, Math.abs(v.driftAngle) * 3), v.boosting);
}

// ---------- boot ----------
loadTrack(QS.get("track") || save.track || "gp");
buildPlayer();
buildRivals();
gridUp();
buildPaints();
camera.position.set(G.player.x + 8, 3, G.player.z + 7);
addEventListener("resize", () => world.resize());
world.resize();

let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const real = Math.min(TEST ? 0.25 : 0.1, (now - last) / 1000); last = now;
  acc += real * TIME_SCALE;
  let n = 0;
  while (acc >= STEP && n++ < 240) { step(STEP); acc -= STEP; }
  render(real);
  world.render();
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
