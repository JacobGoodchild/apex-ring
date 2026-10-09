import { test, expect } from "@playwright/test";
import { openGame, game, startRace } from "./helpers.js";

test.describe("Apex Ring", () => {
  test("loads with no console errors and shows the menu", async ({ page }) => {
    const problems = await openGame(page);
    await expect(page.locator("#menu")).toBeVisible();
    await expect(page.locator("#raceBtn")).toBeVisible();
    // every lobby screen opens and closes
    for (const [btn, screen, back] of [["#raceBtn", "#setup", "#setupBack"], ["#garageBtn", "#garage", "#garageBack"], ["#settingsBtn", "#settings", "#settingsBack"]]) {
      await page.click(btn); await expect(page.locator(screen)).toBeVisible();
      await page.click(back); await expect(page.locator("#menu")).toBeVisible();
    }
    await page.waitForTimeout(800);
    expect(problems).toEqual([]);
  });

  test("start button runs the countdown then the race", async ({ page }) => {
    const problems = await openGame(page);
    await page.click("#raceBtn");
    await page.click("#startBtn");
    await expect(page.locator("#count")).toBeVisible();
    expect(await game(page, () => window.__apex.mode)).toBe("countdown");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 20_000 });
    await expect(page.locator("#hud")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("car moves forward and steering changes heading", async ({ page }) => {
    await openGame(page);
    await startRace(page);
    const a = await game(page, () => window.__apex.player);
    await page.waitForFunction((d0) => window.__apex.player.totalD > d0 + 20, a.totalD, { timeout: 20_000 });
    const b = await game(page, () => window.__apex.player);
    expect(b.vF).toBeGreaterThan(5);
    // steer right for a moment and compare heading change with the track's own curve
    const h0 = (await game(page, () => window.__apex.player)).h;
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    const h1 = (await game(page, () => window.__apex.player)).h;
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowLeft");
    const h2 = (await game(page, () => window.__apex.player)).h;
    const d = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    // right turns decrease heading, left turns increase it
    expect(d(h1 - h0)).toBeLessThan(d(h2 - h1));
    expect(Math.abs(d(h1 - h0))).toBeGreaterThan(0.05);
  });

  test("drifting leaves skid marks and fills boost; boost spends it", async ({ page }) => {
    await openGame(page, "rivals=0");
    await startRace(page);
    await page.waitForFunction(() => window.__apex.player.vF > 30, null, { timeout: 30_000 });
    const b0 = (await game(page, () => window.__apex.player)).boost;
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.down(" ");
    await page.waitForFunction(() => window.__apex.player.drifting, null, { timeout: 10_000 });
    await page.waitForFunction(() => window.__apex.skidCount > 5, null, { timeout: 10_000 });
    await page.keyboard.up(" ");
    await page.keyboard.up("ArrowLeft");
    expect((await game(page, () => window.__apex.player)).boost).toBeGreaterThan(b0);
    await page.evaluate(() => window.__apex.setBoost(1));
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(() => window.__apex.player.boosting, null, { timeout: 10_000 });
    await page.waitForFunction(() => window.__apex.player.boost < 0.9, null, { timeout: 10_000 });
    await page.keyboard.up("ArrowUp");
  });

  test("HUD shows speed and lap time", async ({ page }) => {
    await openGame(page);
    await startRace(page);
    await page.waitForFunction(() => window.__apex.player.vF > 10, null, { timeout: 20_000 });
    const spd = Number(await page.textContent("#spdV"));
    expect(spd).toBeGreaterThan(10);
    await expect(page.locator("#timeV")).toHaveText(/^\d:\d\d\.\d\d$/);
    await expect(page.locator("#lapV")).toHaveText(/^1\/\d$/);
    await expect(page.locator("#posV")).toHaveText(/^\d(st|nd|rd|th)\/8$/);
  });

  test("laps count and the race finishes, and the best lap is saved", async ({ page }) => {
    test.setTimeout(150_000);
    const problems = await openGame(page, "autopilot=1&speed=12&laps=2");
    await startRace(page);
    await page.waitForFunction(() => window.__apex.laps.length >= 1, null, { timeout: 60_000 });
    await expect(page.locator("#lapV")).toHaveText("2/2");
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 60_000 });
    await expect(page.locator("#finish")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".standings li")).toHaveCount(8);
    await expect(page.locator(".standings li.me")).toHaveCount(1);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.screenshot({ path: "screenshots/results-portrait.png" });
    const laps = await game(page, () => window.__apex.laps);
    expect(laps.length).toBe(2);
    laps.forEach((t) => expect(t).toBeGreaterThan(5));
    const saved = await game(page, () => window.__apex.save);
    expect(Object.values(saved.best).length).toBeGreaterThan(0);
    // finishing pays out coins
    expect(saved.coins).toBeGreaterThan(0);
    await expect(page.locator(".reward")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("track picker switches tracks and remembers the choice", async ({ page }) => {
    await openGame(page);
    await page.click("#raceBtn");
    const first = await page.textContent("#trackName");
    await page.click("#trackNext");
    await expect(page.locator("#trackName")).not.toHaveText(first);
    const id = await game(page, () => window.__apex.track);
    await page.reload();
    await page.waitForFunction(() => window.__apex && window.__apex.ready);
    expect(await game(page, () => window.__apex.track)).toBe(id);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("shop: buy upgrades and a new car with coins", async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__apex.addCoins(50_000, 20));
    await page.click("#garageBtn");
    await page.click("#tabUp");
    const before = (await game(page, () => window.__apex.save)).coins;
    await page.click("#up-engine");
    const after = await game(page, () => window.__apex.save);
    expect(after.coins).toBeLessThan(before);
    expect(after.cars.vanta.upgrades.engine).toBe(1);
    await page.click("#tabDecal");
    await page.click("#decal1");
    expect((await game(page, () => window.__apex.save)).cars.vanta.decal).toBe(1);
    await page.click("#carNext");
    await expect(page.locator("#carAction")).toHaveText(/Buy/);
    await page.click("#carAction");
    await expect(page.locator("#carAction")).toHaveText("Selected");
    const s2 = await game(page, () => window.__apex.save);
    expect(s2.owned.length).toBe(2);
    expect(s2.car).not.toBe("vanta");
    // the new car races
    await page.click("#garageBack");
    await expect(page.locator("#lobbyCar")).toHaveText(/Kestrel/);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("career: a time trial event can be completed and is saved", async ({ page }) => {
    test.setTimeout(120_000);
    const problems = await openGame(page, "autopilot=1&speed=12");
    await page.click("#careerBtn");
    await expect(page.locator("#events .event")).toHaveCount(12);
    await page.click("#ev-c2");
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 90_000 });
    await expect(page.locator("#finish")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".evhead")).toBeVisible();
    expect(await game(page, () => window.__apex.eventOk)).toBe(true);
    const sv = await game(page, () => window.__apex.save);
    expect(sv.career.c2.done).toBe(true);
    await page.click("#menuBtn");
    await expect(page.locator("#career")).toBeVisible();
    expect(problems).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("career: elimination drops the last car each lap", async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page, "autopilot=1&speed=12&laps=3");
    await page.click("#careerBtn");
    await page.click("#ev-c7");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 20_000 });
    expect(await game(page, () => window.__apex.fieldSize)).toBe(7);
    await page.waitForFunction(() => window.__apex.fieldSize <= 6 || window.__apex.mode === "done", null, { timeout: 90_000 });
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("settings: sound and quality choices are saved", async ({ page }) => {
    await openGame(page);
    await page.click("#settingsBtn");
    await page.click('#soundTabs [data-s="0"]');
    await page.click('#qualityTabs [data-q="low"]');
    await page.click('#diffTabs [data-d="hard"]');
    expect((await game(page, () => window.__apex.save)).settings.difficulty).toBe("hard");
    const sv = await game(page, () => window.__apex.save);
    expect(sv.settings.sound).toBe(false);
    expect(sv.settings.quality).toBe("low");
    await page.click("#resetBtn");
    expect((await game(page, () => window.__apex.save)).settings.sound).toBe(true);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("time trial runs without rivals", async ({ page }) => {
    await openGame(page);
    await page.click("#raceBtn");
    await page.click("#modeTrial");
    await page.click("#startBtn");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 20_000 });
    await expect(page.locator("#posV")).toHaveText("1st/1");
  });

  test("time trial records a ghost of the best lap and replays it", async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page, "autopilot=1&speed=8&laps=3&track=oval");
    await page.click("#raceBtn");
    await page.click("#modeTrial");
    await page.click("#startBtn");
    await page.waitForFunction(() => window.__apex.laps.length >= 1, null, { timeout: 60_000 });
    const sv = await game(page, () => window.__apex.save);
    expect(sv.ghosts.oval.s.length).toBeGreaterThan(40);
    await page.waitForFunction(() => window.__apex.ghostVisible, null, { timeout: 20_000 });
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/ghost-landscape.png" });
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("progress is saved and loaded across reloads", async ({ page }) => {
    await openGame(page);
    await page.click("#garageBtn");
    await page.click("#paint2");
    await expect(page.locator("#paintName")).toHaveText("Volt Yellow");
    await page.reload();
    await page.waitForFunction(() => window.__apex && window.__apex.ready);
    await page.click("#garageBtn");
    await expect(page.locator("#paintName")).toHaveText("Volt Yellow");
    await expect(page.locator("#paint2")).toHaveAttribute("aria-pressed", "true");
    // a broken save must not crash the game
    await page.evaluate(() => localStorage.setItem("apexring.test.save", "{not json"));
    await page.reload();
    await page.waitForFunction(() => window.__apex && window.__apex.ready);
    await expect(page.locator("#menu")).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });
});
