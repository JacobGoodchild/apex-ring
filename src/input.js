// Keyboard, touch pads and optional phone tilt, merged into one control state.
export const input = { left: false, right: false, kl: false, kr: false, boost: false, kBoost: false, drift: false, kDrift: false, kBrake: false, tilt: 0, tiltOn: false, onKey: null };

const KEYS = {
  ArrowLeft: "kl", a: "kl", A: "kl", ArrowRight: "kr", d: "kr", D: "kr",
  ArrowUp: "kBoost", w: "kBoost", W: "kBoost", Shift: "kBoost",
  " ": "kDrift", ArrowDown: "kBrake", s: "kBrake", S: "kBrake",
};

addEventListener("keydown", (e) => {
  const k = KEYS[e.key];
  if (k) { input[k] = true; if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault(); }
  else if (input.onKey && !e.repeat) input.onKey(e.key);
});
addEventListener("keyup", (e) => { const k = KEYS[e.key]; if (k) input[k] = false; });
addEventListener("blur", () => { for (const k of Object.values(KEYS)) input[k] = false; });

export function bindPad(el, key) {
  const on = (e) => { e.preventDefault(); input[key] = true; el.classList.add("on"); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
  const off = () => { input[key] = false; el.classList.remove("on"); };
  el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off); el.addEventListener("lostpointercapture", off);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

// Returns the steering value -1..1 (positive = right) and the button states.
export function readControls() {
  let s = 0;
  if (input.left || input.kl) s -= 1;
  if (input.right || input.kr) s += 1;
  if (input.tiltOn) s += input.tilt;
  return { steer: Math.max(-1, Math.min(1, s)), boost: input.boost || input.kBoost, drift: input.drift || input.kDrift, brake: input.kBrake };
}

let tiltSeen = false;
function onOrient(e) {
  if (e.gamma == null && e.beta == null) return;
  tiltSeen = true;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const a = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
  const v = (a || 0) / 20;
  input.tilt = Math.abs(v) < 0.08 ? 0 : Math.max(-1, Math.min(1, v));
}

// Turn tilt on or off. Resolves to true when tilt is working.
export async function setTilt(on, toast) {
  if (!on) { input.tiltOn = false; input.tilt = 0; removeEventListener("deviceorientation", onOrient); return false; }
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") throw new Error("denied");
    }
  } catch (err) { toast("Tilt isn't allowed here. Use the pads instead."); return false; }
  tiltSeen = false; addEventListener("deviceorientation", onOrient); input.tiltOn = true;
  return new Promise((res) => setTimeout(() => {
    if (!tiltSeen) { setTilt(false); toast("This device isn't reporting tilt. Use the pads instead."); res(false); } else res(true);
  }, 1200));
}
