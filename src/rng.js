// Small seeded random generator (mulberry32) so tracks, scenery and rivals are repeatable in tests.
import { SEED } from "./env.js";

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = makeRng(SEED);
export const rand = (a = 0, b = 1) => a + (b - a) * rng();
