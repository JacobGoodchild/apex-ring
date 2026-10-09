import { test, expect } from "@playwright/test";
import { race } from "./sim.js";
import { TRACKS } from "../src/tracks.js";

// A "beginner bot" (on/off steering, 0.2 s late, lazy, looks away now and then, never boosts) races the real AI.
const seeds = [1, 2, 3, 4];

test("a beginner finishes in the top 3 on every Easy track on Easy", () => {
  for (const t of TRACKS.filter((t) => t.difficulty === 1)) for (const seed of seeds) {
    const r = race(t.id, "easy", { seed });
    expect(r.place, `${t.id} seed ${seed}`).toBeLessThanOrEqual(3);
  }
});

test("a beginner ends up mid-pack on Medium", () => {
  let sum = 0, n = 0;
  for (const t of TRACKS) for (const seed of seeds) { sum += race(t.id, "normal", { seed }).place; n++; }
  const avg = sum / n;
  expect(avg).toBeGreaterThanOrEqual(3);
  expect(avg).toBeLessThanOrEqual(6);
});

test("Hard is properly hard for a beginner", () => {
  let sum = 0, n = 0;
  for (const t of TRACKS.filter((t) => t.difficulty === 1)) { sum += race(t.id, "hard", { seed: 1 }).place; n++; }
  expect(sum / n).toBeGreaterThanOrEqual(6);
});
