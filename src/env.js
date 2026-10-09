// Reads URL options. Test mode (?test=1) fixes the random seed, speeds up time and exposes a small hook for tests.
const q = new URLSearchParams(location.search);

export const TEST = q.has("test");
export const SEED = Number(q.get("seed") || (TEST ? 1234 : 0)) || ((Date.now() ^ 0x5bd1e995) >>> 0);
export const TIME_SCALE = Math.max(1, Math.min(20, Number(q.get("speed") || (TEST ? 4 : 1))));
export const AUTOPILOT = q.has("autopilot");
export const FORCE_QUALITY = q.get("quality"); // low | medium | high
export const SAVE_KEY = TEST ? "apexring.test.save" : "apexring.save.v1";
