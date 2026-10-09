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

// Reverse and Mirror layouts: picked from the race setup tabs, and a full lap is driven on each.
test("reverse and mirror layouts can be picked and raced", async ({ page }) => {
  test.setTimeout(240_000);
  const problems = await openGame(page, "track=gp&autopilot=1&speed=12&laps=1&rivals=2");
  await page.click("#raceBtn");
  await page.click('#layoutTabs [data-l="r"]');
  expect(await page.evaluate(() => window.__apex.track)).toBe("gp:r");
  await expect(page.locator("#trackName")).toHaveText(/Reverse/);
  await page.click("#startBtn");
  await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 100_000 });
  expect((await page.evaluate(() => window.__apex.save)).best["gp:r"]).toBeGreaterThan(10);
  await page.click("#menuBtn");
  await page.click("#raceBtn");
  await page.click('#layoutTabs [data-l="m"]');
  expect(await page.evaluate(() => window.__apex.track)).toBe("gp:m");
  await page.click("#startBtn");
  await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 100_000 });
  expect(problems).toEqual([]);
  await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
});

test("weather: any track can be raced in the rain, which makes the road slippery", async ({ page }) => {
  const problems = await openGame(page, "track=forest&rivals=2");
  await page.click("#raceBtn");
  await page.click('#weatherTabs [data-w="rain"]');
  expect(await page.evaluate(() => window.__apex.weather)).toBe("rain");
  await expect(page.locator("#trackTheme")).toContainText("Rain");
  await page.click("#startBtn");
  await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__apex.grip)).toBeLessThan(0.9);
  await page.click("#pauseBtn"); await page.click("#quitBtn").catch(() => {});
  expect(problems).toEqual([]);
});
