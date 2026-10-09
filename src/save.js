// Player progress, kept in localStorage. Every access is wrapped because storage can be blocked or full.
import { SAVE_KEY } from "./env.js";

function defaults() {
  return {
    v: 1,
    coins: 0,
    gems: 0,
    car: "vanta",
    owned: ["vanta"],
    cars: {}, // per car: { paint, rims, upgrades: {engine,tyres,handling,boost,weight} }
    best: {}, // best lap per track id
    career: {}, // event id -> { place, stars }
    settings: { quality: "", sound: true, tilt: false, camera: "chase" },
  };
}

export let save = defaults();

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === "object") save = Object.assign(defaults(), data, { settings: Object.assign(defaults().settings, data.settings) });
    }
  } catch (e) {
    save = defaults();
  }
  return save;
}

export function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}

export function resetSave() {
  save = defaults();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
  return save;
}

export function carSave(id) {
  if (!save.cars[id]) save.cars[id] = { paint: 0, rims: 0, upgrades: { engine: 0, tyres: 0, handling: 0, boost: 0, weight: 0 } };
  return save.cars[id];
}
