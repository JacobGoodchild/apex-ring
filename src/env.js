// Reads URL options. Test mode (?test=1) fixes the random seed, speeds up time and exposes a small hook for tests.
const q = new URLSearchParams(globalThis.location ? location.search : "");

export const TEST = q.has("test");
export const SEED = Number(q.get("seed") || (TEST ? 1234 : 0)) || ((Date.now() ^ 0x5bd1e995) >>> 0);
export const TIME_SCALE = Math.max(1, Math.min(20, Number(q.get("speed") || (TEST ? 4 : 1))));
export const AUTOPILOT = q.has("autopilot");
export const FORCE_QUALITY = q.get("quality"); // low | medium | high
// test-only: pretend the screen refreshes at this rate, and freeze the simulation after this many physics ticks
export const FPS_CAP = TEST ? Number(q.get("fps") || 0) : 0;
export const STOP_TICK = TEST ? Number(q.get("stopTick") || 0) : 0;
export const SAVE_KEY = TEST ? "apexring.test.save" : "apexring.save.v1";
