import { test, expect } from "@playwright/test";
import { openGame, startRace } from "./helpers.js";

// Physics runs on a fixed 1/60 s tick, so the same race must end up in exactly the same state whatever the
// screen's refresh rate. Run the race drawn at 20 fps, then again at the full rate, and compare every car bit for bit.
async function stateAt(page, query) {
  await openGame(page, query);
  await startRace(page);
  await page.waitForFunction(() => window.__apex.tick >= 900, null, { timeout: 90_000 });
  return page.evaluate(() => ({ tick: window.__apex.tick, s: window.__apex.simState }));
}

test("physics is identical at different frame rates", async ({ page }) => {
  test.setTimeout(240_000);
  const q = "autopilot=1&speed=6&stopTick=900";
  const a = await stateAt(page, q + "&fps=20");
  const b = await stateAt(page, q);
  expect(a.tick).toBe(900); expect(b.tick).toBe(900);
  expect(a.s[0][7]).toBeGreaterThan(200); // the player really drove somewhere
  expect(a.s).toEqual(b.s);
});
