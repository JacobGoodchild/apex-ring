import { test } from "@playwright/test";
import { openGame, startRace } from "./helpers.js";

// Saves menu and race screenshots at phone portrait and landscape sizes into screenshots/.
for (const [name, size] of [["portrait", { width: 412, height: 915 }], ["landscape", { width: 915, height: 412 }]]) {
  test(`screenshots ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openGame(page, "quality=medium&speed=1");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `screenshots/menu-${name}.png` });
    await startRace(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/race-${name}.png` });
  });
}
