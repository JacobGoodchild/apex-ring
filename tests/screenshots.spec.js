import { test } from "@playwright/test";
import { openGame, startRace } from "./helpers.js";

// Saves menu and race screenshots at phone portrait and landscape sizes into screenshots/.
for (const [name, size] of [["portrait", { width: 412, height: 915 }], ["landscape", { width: 915, height: 412 }]]) {
  test(`screenshots ${name}`, async ({ page }) => {
    test.setTimeout(240_000); // many screens; CI runners are slower than local
    await page.setViewportSize(size);
    await openGame(page, "quality=medium&speed=1");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `screenshots/menu-${name}.png` });
    await page.click("#garageBtn");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/garage-${name}.png` });
    await page.click("#tabUp");
    await page.click("#carNext");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `screenshots/upgrades-${name}.png` });
    await page.click("#carPrev");
    await page.click("#garageBack");
    await page.click("#careerBtn");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/career-${name}.png` });
    await page.click("#careerBack");
    await page.click("#settingsBtn");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/settings-${name}.png` });
    await page.click("#settingsBack");
    await page.click("#garageBtn");
    await page.click("#garageBack");
    await startRace(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/race-${name}.png` });
    await page.evaluate(() => window.__apex.warp(window.__apex.bridgeD()));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/flyover-${name}.png` });
    await page.evaluate(() => window.__apex.setBoost(1));
    await page.keyboard.press(" ");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/boost-${name}.png` });
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `screenshots/drift-${name}.png` });
    await page.keyboard.up("ArrowLeft");
  });
}
