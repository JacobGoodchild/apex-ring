import { test } from "@playwright/test";
import { openGame, startRace } from "./helpers.js";

// Saves menu and race screenshots at phone portrait and landscape sizes into screenshots/.
for (const [name, size] of [["portrait", { width: 412, height: 915 }], ["landscape", { width: 915, height: 412 }]]) {
  test(`screenshots ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openGame(page, "quality=medium&speed=1");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `screenshots/menu-${name}.png` });
    await page.click("#garageBtn");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/garage-${name}.png` });
    await page.click("#garageBack");
    await startRace(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/race-${name}.png` });
    await page.evaluate(() => window.__apex.warp(window.__apex.bridgeD()));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/flyover-${name}.png` });
    await page.evaluate(() => window.__apex.setBoost(1));
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `screenshots/boost-${name}.png` });
    await page.keyboard.up("ArrowUp");
    await page.keyboard.down("ArrowLeft"); await page.keyboard.down(" ");
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `screenshots/drift-${name}.png` });
    await page.keyboard.up("ArrowLeft"); await page.keyboard.up(" ");
  });
}
