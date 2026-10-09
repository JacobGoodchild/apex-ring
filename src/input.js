import { tiltCfg, tiltRoll, tiltSteer } from "./tilt.js";

// Keyboard, touch and optional phone tilt, merged into one control state.
// Touch: hold the left or right half of the screen to steer. Touch BOTH halves together twice (within ~0.45 s)
// to fire boost. Keyboard: arrows / A-D steer, Space (or up arrow) boosts.
export const input = { kl: false, kr: false, tilt: 0, tiltOn: false, onKey: null, boostTaps: 0, touchL: 0, touchR: 0, lastBoth: -1, both: false };

const KEYS = { ArrowLeft: "kl", a: "kl", A: "kl", ArrowRight: "kr", d: "kr", D: "kr" };
const BOOST_KEYS = new Set([" ", "ArrowUp", "w", "W"]);

addEventListener("keydown", (e) => {
  const k = KEYS[e.key];
  if (k) { input[k] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); }
  else if (BOOST_KEYS.has(e.key)) { e.preventDefault(); if (!e.repeat) input.boostTaps++; }
  else if (input.onKey && !e.repeat) input.onKey(e.key);
});
addEventListener("keyup", (e) => { const k = KEYS[e.key]; if (k) input[k] = false; });
addEventListener("blur", () => { input.kl = input.kr = false; });

const pointers = new Map(); // pointerId -> "L" | "R"
function recount() {
  input.touchL = 0; input.touchR = 0;
  for (const side of pointers.values()) side === "L" ? input.touchL++ : input.touchR++;
}

// Bind the two half-screen touch zones.
export function bindZones(left, right) {
  const now = () => performance.now() / 1000;
  for (const [el, side] of [[left, "L"], [right, "R"]]) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      pointers.set(e.pointerId, side); recount(); el.classList.add("on");
      if (input.touchL && input.touchR && !input.both) {
        // both thumbs down together: two of these in quick succession = boost
        input.both = true;
        const t = now();
        if (t - input.lastBoth < 0.45) { input.boostTaps++; input.lastBoth = -1; } else input.lastBoth = t;
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId); recount();
      if (!(side === "L" ? input.touchL : input.touchR)) el.classList.remove("on");
      if (!input.touchL || !input.touchR) input.both = false;
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}

// Returns the steering value -1..1 (positive = right) and whether a boost was requested since the last call.
export function readControls(consume = true) {
  let s = 0;
  if (input.tiltOn) s = input.tilt;
  else {
    if (input.touchL) s -= 1;
    if (input.touchR) s += 1;
  }
  if (input.kl) s -= 1;
  if (input.kr) s += 1;
  const boost = input.boostTaps > 0;
  if (consume) input.boostTaps = 0;
  return { steer: Math.max(-1, Math.min(1, s)), boost };
}

// ---------- tilt ---------- (maths in tilt.js)
const screenAngle = () => (screen.orientation && typeof screen.orientation.angle === "number" ? screen.orientation.angle : window.orientation || 0);
let tiltSeen = false;
function onOrient(e) {
  if (e.gamma == null && e.beta == null) return;
  tiltSeen = true;
  tiltCfg.roll = tiltRoll(e.beta, e.gamma, screenAngle());
  input.tilt = tiltSteer(tiltCfg.roll);
}
export function calibrateTilt() { tiltCfg.zero = tiltCfg.roll; input.tilt = 0; return tiltCfg.zero; }

// Turn tilt on or off. Resolves to true when the sensor is working; otherwise says why and stays off.
export async function setTilt(on, toast) {
  if (!on) { input.tiltOn = false; input.tilt = 0; removeEventListener("deviceorientation", onOrient); return false; }
  try {
    if (typeof DeviceOrientationEvent === "undefined") throw new Error("none");
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") throw new Error("denied");
    }
  } catch (err) {
    toast(err.message === "denied" ? "Motion sensor permission was refused, so steering is back on Touch." : "This browser has no motion sensor, so steering is back on Touch.", 4500);
    return false;
  }
  tiltSeen = false; addEventListener("deviceorientation", onOrient); input.tiltOn = true;
  return new Promise((res) => setTimeout(() => {
    if (!tiltSeen) { setTilt(false); toast("No tilt readings from this device, so steering is back on Touch.", 4500); res(false); } else res(true);
  }, 1200));
}

export { tiltCfg };
