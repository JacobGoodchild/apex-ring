import { tiltCfg, tiltRoll, tiltSteer } from "./tilt.js";

// Keyboard, touch and optional phone tilt, merged into one control state.
// Touch: hold the left or right half of the screen to steer. Touch BOTH halves together twice (within ~0.45 s)
// to fire boost. Keyboard: arrows / A-D steer, Space (or up arrow) boosts.
// Pro mode (input.pro): Up/W accelerate, Down/S brake, Space handbrake, Shift/B boost; on touch, on-screen pedals.
export const input = { kl: false, kr: false, ku: false, kd: false, kh: false, tilt: 0, tiltOn: false, onKey: null, boostTaps: 0, touchL: 0, touchR: 0, lastBoth: -1, both: false, pro: false, pad: {} };

const KEYS = { ArrowLeft: "kl", a: "kl", A: "kl", ArrowRight: "kr", d: "kr", D: "kr" };
const PRO_KEYS = { ArrowUp: "ku", w: "ku", W: "ku", ArrowDown: "kd", s: "kd", S: "kd", " ": "kh" };
const BOOST_KEYS = new Set([" ", "ArrowUp", "w", "W"]);
const PRO_BOOST = new Set(["Shift", "b", "B", "n", "N"]);

// split-screen: player 1 uses A/D + W (or Space), player 2 the arrow keys + Up (or Enter)
const P2_KEYS = { ArrowLeft: "p2l", ArrowRight: "p2r" };
addEventListener("keydown", (e) => {
  if (input.split && (P2_KEYS[e.key] || e.key === "ArrowUp" || e.key === "Enter")) {
    e.preventDefault(); if (P2_KEYS[e.key]) input[P2_KEYS[e.key]] = true; else if (!e.repeat) input.boost2 = (input.boost2 || 0) + 1; return;
  }
  const k = KEYS[e.key] || (input.pro && PRO_KEYS[e.key]);
  if (k) { input[k] = true; if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault(); }
  else if ((input.pro ? PRO_BOOST : BOOST_KEYS).has(e.key)) { e.preventDefault(); if (!e.repeat) input.boostTaps++; }
  else if (input.onKey && !e.repeat) input.onKey(e.key);
});
addEventListener("keyup", (e) => { const k = KEYS[e.key] || PRO_KEYS[e.key]; if (k) input[k] = false; if (P2_KEYS[e.key]) input[P2_KEYS[e.key]] = false; });
addEventListener("blur", () => { input.kl = input.kr = input.ku = input.kd = input.kh = false; input.pad = {}; });

// Pro-mode on-screen buttons: each element's data-pad names what it holds (l, r, gas, brake, hand) or "boost".
export function bindPads(root) {
  root.querySelectorAll("[data-pad]").forEach((el) => {
    const key = el.dataset.pad;
    const down = (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } if (key === "boost") input.boostTaps++; else input.pad[key] = true; el.classList.add("on"); };
    const up = () => { input.pad[key] = false; el.classList.remove("on"); };
    el.addEventListener("pointerdown", down); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}

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

// Gamepads (standard mapping): left stick or d-pad steers, A boosts, RT/LT are throttle/brake in Pro, B or X handbrake.
// pad index 0 drives player 1, pad 1 drives player 2 in split-screen.
const padPrev = [{}, {}];
export function readPad(i) {
  const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && pads[i];
  if (!p || !p.connected) return null;
  const b = (k) => !!(p.buttons[k] && p.buttons[k].pressed), v = (k) => (p.buttons[k] ? p.buttons[k].value : 0);
  let steer = Math.abs(p.axes[0] || 0) > 0.12 ? p.axes[0] : 0;
  if (b(14)) steer = -1; if (b(15)) steer = 1;
  const a = b(0), prev = padPrev[i];
  const out = { steer, boost: a && !prev.a, throttle: Math.max(v(7), b(12) ? 1 : 0), brake: Math.max(v(6), b(13) ? 1 : 0), handbrake: b(1) || b(2), pause: b(9) && !prev.start };
  padPrev[i] = { a, start: b(9) };
  return out;
}

// Player 2 in split-screen: arrow keys or the second gamepad.
export function readControls2() {
  let s = (input.p2r ? 1 : 0) - (input.p2l ? 1 : 0), boost = (input.boost2 || 0) > 0; input.boost2 = 0;
  const gp = readPad(1);
  if (gp) { if (gp.steer) s = gp.steer; boost = boost || gp.boost; }
  return { steer: Math.max(-1, Math.min(1, s)), boost };
}

// Returns the steering value -1..1 (positive = right) and whether a boost was requested since the last call.
export function readControls(consume = true) {
  let s = 0;
  if (input.tiltOn) s = input.tilt;
  else {
    if (input.touchL) s -= 1;
    if (input.touchR) s += 1;
  }
  if (input.kl || input.pad.l) s -= 1;
  if (input.kr || input.pad.r) s += 1;
  const boost = input.boostTaps > 0;
  if (consume) input.boostTaps = 0;
  const p = input.pad, gp = readPad(0);
  const out = { steer: Math.max(-1, Math.min(1, s)), boost, throttle: input.ku || p.gas ? 1 : 0, brake: input.kd || p.brake ? 1 : 0, handbrake: !!(input.kh || p.hand) };
  if (gp) {
    if (gp.steer) out.steer = Math.max(-1, Math.min(1, gp.steer));
    out.boost = out.boost || gp.boost; out.throttle = Math.max(out.throttle, gp.throttle); out.brake = Math.max(out.brake, gp.brake); out.handbrake = out.handbrake || gp.handbrake;
    if (gp.pause && input.onKey) input.onKey("p");
  }
  return out;
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
