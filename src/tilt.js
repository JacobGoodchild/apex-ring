// Tilt steering maths (pure, so it can be unit-tested).
// We turn the sensor's beta/gamma into the "up" direction in the device's own frame, rotate that into screen
// coordinates (so portrait and both landscape ways round all work), and read how far the screen is rolled
// like a steering wheel. Calibrate stores the current roll as straight ahead.
const D = Math.PI / 180;
export const tiltCfg = { zero: 0, sens: 1, dead: 3, roll: 0 };

// Roll of the screen in degrees, positive = turned clockwise (steer right). screenAngle: 0, 90, 180, 270 / -90.
export function tiltRoll(beta, gamma, screenAngle) {
  const b = (beta || 0) * D, g = (gamma || 0) * D, a = (screenAngle || 0) * D;
  const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b);
  const sx = ux * Math.cos(a) - uy * Math.sin(a), sy = ux * Math.sin(a) + uy * Math.cos(a);
  return Math.atan2(-sx, sy) / D;
}

// Steering -1..1 from a roll angle, using the calibration, sensitivity and dead zone.
export function tiltSteer(roll, cfg = tiltCfg) {
  let d = roll - cfg.zero; d = ((d + 540) % 360) - 180;
  if (Math.abs(d) < cfg.dead) return 0;
  const full = 28 / cfg.sens; // degrees of roll for full lock
  return Math.max(-1, Math.min(1, Math.sign(d) * (Math.abs(d) - cfg.dead) / full));
}

