import { test, expect } from "@playwright/test";
import { openGame, startRace } from "./helpers.js";
import { TRACKS } from "../src/tracks.js";

// Every track loads, races and gets a portrait screenshot.
for (const t of TRACKS) {
  test(`track ${t.id} loads and races`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const problems = await openGame(page, `track=${t.id}&quality=medium&speed=2`);
    await startRace(page);
    await page.waitForFunction(() => window.__apex.player.vF > 20, null, { timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `screenshots/track-${t.id}.png` });
    if (t.id === "xtreme") {
      // the first ramp is full width: the car must leave the ground
      await page.evaluate(() => window.__apex.warp(window.__apex.rampD()));
      await page.waitForFunction(() => window.__apex.airborne, null, { timeout: 15_000 });
      await page.screenshot({ path: `screenshots/jump-${t.id}.png` });
      // a long flight pays out a BIG AIR boost bonus
      await page.waitForFunction(() => window.__apex.airPops > 0, null, { timeout: 40_000 });
    }
    if (t.difficulty > 1) {
      await page.evaluate(() => window.__apex.warp(window.__apex.sharpD() - 30));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/corner-${t.id}.png` });
    }
    expect(problems).toEqual([]);
  });
}
