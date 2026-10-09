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
    expect(problems).toEqual([]);
  });
}
