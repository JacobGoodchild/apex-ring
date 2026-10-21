import { test, expect } from "@playwright/test";
import { openGame, game } from "./helpers.js";

test("Zeus's Fury: start it from Daily challenge, the wings unfold and the car flies the chasm", async ({ page }) => {
  test.setTimeout(150_000);
  await openGame(page, "autopilot=1&rivals=2");
  await page.click("#dailyBtn");
  await expect(page.locator("#daily")).toBeVisible();
  await page.click("#zeusGo");
  await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 60_000 });
  expect(await game(page, () => window.__apex.track)).toBe("zeus");
  expect(await game(page, () => window.__apex.eventId)).toBe("zeus");
  // jump to the approach: the wings deploy, the captain is welcomed aboard, the car glides over and lands beyond
  await page.evaluate(() => window.__apex.warp(window.__apex.gapD() - 300));
  await page.waitForFunction(() => window.__apex.flight.wing > 0.5, null, { timeout: 20_000 });
  await expect(page.locator("#flightHud")).toBeVisible();
  await expect(page.locator("#subtitle")).toContainText("WELCOME", { timeout: 10_000 });
  await page.waitForFunction(() => window.__apex.flight.flying, null, { timeout: 20_000 });
  await page.screenshot({ path: "screenshots/zeus-flight.png" });
  const d0 = await game(page, () => window.__apex.flight.d);
  await page.waitForFunction((d0) => !window.__apex.flight.flying && window.__apex.flight.d > d0 + 150, d0, { timeout: 20_000 });
  const f = await game(page, () => window.__apex.flight);
  expect(Math.abs(f.y - f.road)).toBeLessThan(3); // back on the road, not in the abyss
});

test("online: leaderboards, friends and profile screens open; server actions say they're under construction", async ({ page }) => {
  await openGame(page);
  await page.click("#onlineBtn");
  await expect(page.locator("#oBoard li")).toHaveCount(7);
  await page.click("#oRefresh");
  await expect(page.locator("#soon")).toBeVisible();
  await page.click("#soonOk");
  await page.click('#online .seg [data-o="friends"]');
  await expect(page.locator("#oCode")).toHaveText(/^APX-[A-Z0-9]{4}$/);
  await page.click("#oAdd");
  await expect(page.locator("#soon")).toBeVisible();
  await page.click("#soonOk");
  await page.click('#online .seg [data-o="profile"]');
  await page.fill("#oName", "Jake");
  await page.click("#oSaveName");
  expect((await game(page, () => window.__apex.save)).driverName).toBe("Jake");
  await page.screenshot({ path: "screenshots/online-portrait.png" });
});
