import { test, expect } from "@playwright/test";
import { openGame, game, startRace } from "./helpers.js";

test.describe("Apex Ring", () => {
  test("loads with no console errors and shows the menu", async ({ page }) => {
    const problems = await openGame(page);
    await expect(page.locator("#menu")).toBeVisible();
    await expect(page.locator("#raceBtn")).toBeVisible();
    // every lobby screen opens and closes
    for (const [btn, screen, back] of [["#raceBtn", "#setup", "#setupBack"], ["#garageBtn", "#garage", "#garageBack"], ["#settingsBtn", "#settings", "#settingsBack"], ["#helpBtn", "#help", "#helpBack"]]) {
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
    // hold right, then left: the nose should point right of the track, then left of it (hErr > 0 = pointing left)
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(() => window.__apex.player.hErr < -0.04, null, { timeout: 10_000 });
    await page.keyboard.up("ArrowRight");
    await page.keyboard.down("ArrowLeft");
    await page.waitForFunction(() => window.__apex.player.hErr > 0.04, null, { timeout: 10_000 });
    await page.keyboard.up("ArrowLeft");
  });

  test("steering hard at speed drifts by itself, leaves skid marks and fills boost", async ({ page }) => {
    await openGame(page, "rivals=0&track=oval");
    await page.evaluate(() => window.__apex.setSetting("assist", "off"));
    await startRace(page);
    // wait for the first bend, then steer hard into it
    await page.waitForFunction(() => window.__apex.player.bend !== 0 && window.__apex.player.vF > 40, null, { timeout: 30_000 });
    const b0 = (await game(page, () => window.__apex.player)).boost;
    const key = (await game(page, () => window.__apex.player.bend)) > 0 ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.down(key);
    await page.waitForFunction(() => window.__apex.player.drifting, null, { timeout: 10_000 });
    await page.waitForFunction(() => window.__apex.skidCount > 0, null, { timeout: 20_000 }); // marks are laid per drawn frame, so few on a slow machine
    await page.keyboard.up(key);
    expect((await game(page, () => window.__apex.player)).boost).toBeGreaterThan(b0);
  });

  test("Space fires a boost burst that spends the meter", async ({ page }) => {
    await openGame(page, "rivals=0");
    await startRace(page);
    await page.evaluate(() => window.__apex.setBoost(1));
    await page.keyboard.press(" ");
    await page.waitForFunction(() => window.__apex.player.boosting, null, { timeout: 10_000 });
    await page.waitForFunction(() => window.__apex.player.boost < 0.9, null, { timeout: 10_000 });
  });

  test("touch: halves steer, and tapping both halves together twice boosts", async ({ page }) => {
    await openGame(page, "rivals=0");
    await startRace(page);
    await page.waitForFunction(() => window.__apex.player.vF > 20, null, { timeout: 30_000 });
    const tap = (sel, id, type) => page.dispatchEvent(sel, type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, bubbles: true });
    // hold the right half: the nose swings right of the track
    await tap("#zoneR", 5, "pointerdown");
    await page.waitForFunction(() => window.__apex.player.hErr < -0.03, null, { timeout: 10_000 });
    await tap("#zoneR", 5, "pointerup");
    // no charge: nothing happens; with charge, two quick two-thumb taps fire boost
    await page.evaluate(() => window.__apex.setBoost(1));
    for (let k = 0; k < 2; k++) {
      await tap("#zoneL", 1, "pointerdown"); await tap("#zoneR", 2, "pointerdown");
      await tap("#zoneL", 1, "pointerup"); await tap("#zoneR", 2, "pointerup");
    }
    await page.waitForFunction(() => window.__apex.player.boosting, null, { timeout: 5_000 });
    // the old buttons are gone
    await expect(page.locator("#padBoost")).toHaveCount(0);
    await expect(page.locator("#padDrift")).toHaveCount(0);
  });

  test("tilt: pick Tilt, calibrate, and tilting steers; no sensor falls back to Touch", async ({ page }) => {
    await openGame(page, "rivals=0");
    await page.click("#settingsBtn");
    // no readings arrive: clear message and back to Touch
    await page.click('#ctrlTabs [data-m="tilt"]');
    await expect(page.locator("#toast")).toContainText("back on Touch", { timeout: 5_000 });
    expect(await game(page, () => window.__apex.tiltOn)).toBe(false);
    // with readings: stays on Tilt
    await page.click('#ctrlTabs [data-m="tilt"]');
    for (let k = 0; k < 5; k++) { await page.evaluate(() => window.__apex.tilt(50, 0)); await page.waitForTimeout(100); }
    await page.waitForTimeout(1300);
    expect(await game(page, () => window.__apex.tiltOn)).toBe(true);
    await expect(page.locator("#tiltOpts")).toBeVisible();
    await page.evaluate(() => window.__apex.tilt(50, 4)); // holding it slightly turned...
    await page.click("#calBtn"); // ...is now straight ahead
    expect(await game(page, () => window.__apex.save.settings.tiltZero)).not.toBe(0);
    await page.click("#settingsBack");
    await startRace(page);
    await page.waitForFunction(() => window.__apex.player.vF > 20, null, { timeout: 30_000 });
    await page.evaluate(() => window.__apex.tilt(50, 30)); // turn the phone right
    await page.waitForFunction(() => window.__apex.player.hErr < -0.03, null, { timeout: 10_000 });
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("boosting just before GO gives a perfect start", async ({ page }) => {
    await openGame(page, "speed=1&rivals=0");
    await page.click("#raceBtn");
    await page.click("#startBtn");
    await page.waitForFunction(() => window.__apex.countT > 3.6, null, { timeout: 20_000 });
    await page.keyboard.press(" ");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 10_000 });
    await expect(page.locator("#toast")).toHaveText(/Perfect start|Too early/);
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
    await expect(page.locator("#carBlurb")).toContainText("Last Car Out");
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

  test("pro driving: the car only goes when you press accelerate, and the brake slows it", async ({ page }) => {
    const problems = await openGame(page, "rivals=0&track=oval");
    await page.click("#settingsBtn");
    await page.click('#driveTabs [data-d="pro"]');
    expect((await game(page, () => window.__apex.save)).settings.drive).toBe("pro");
    await page.click("#settingsBack");
    await startRace(page);
    await page.waitForTimeout(1500);
    expect((await game(page, () => window.__apex.player)).vF).toBeLessThan(1);
    await page.keyboard.down("ArrowUp");
    await page.waitForFunction(() => window.__apex.player.vF > 25, null, { timeout: 15_000 });
    await page.keyboard.up("ArrowUp");
    const fast = (await game(page, () => window.__apex.player)).vF;
    await page.keyboard.down("ArrowDown");
    await page.waitForFunction((f) => window.__apex.player.vF < f - 15, fast, { timeout: 10_000 });
    await page.keyboard.up("ArrowDown");
    expect(problems).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("split-screen: two players on one keyboard, each with their own car and view", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 915, height: 412 });
    const problems = await openGame(page, "track=oval&rivals=3");
    await page.click("#raceBtn");
    await page.click('#playersTabs [data-n="2"]');
    await expect(page.locator('#playersTabs [data-n="2"]')).toHaveAttribute("aria-pressed", "true");
    await page.click("#startBtn");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 30_000 });
    expect(await game(page, () => window.__apex.splitRace)).toBe(true);
    await expect(page.locator("#shud2")).toContainText("P2");
    await page.waitForFunction(() => window.__apex.p2.vF > 15 && window.__apex.player.vF > 15, null, { timeout: 20_000 });
    // player 2 steers with the arrows (moves across the road); player 1 is unaffected
    const l1 = (await game(page, () => window.__apex.player)).lat, l2 = (await game(page, () => window.__apex.p2)).lat;
    await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(1200); await page.keyboard.up("ArrowLeft");
    const d2 = Math.abs((await game(page, () => window.__apex.p2)).lat - l2), d1 = Math.abs((await game(page, () => window.__apex.player)).lat - l1);
    expect(d2).toBeGreaterThan(1.5);
    expect(d1).toBeLessThan(d2);
    await page.screenshot({ path: "screenshots/split-landscape.png" });
    expect(problems).toEqual([]);
  });

  test("career: a time trial event can be completed and is saved", async ({ page }) => {
    test.setTimeout(120_000);
    const problems = await openGame(page, "autopilot=1&speed=12");
    await page.click("#careerBtn");
    await expect(page.locator("#events .event:not(.daily)")).toHaveCount(22);
    await page.click("#ev-c2"); await page.click("#evGo");
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 90_000 });
    await expect(page.locator("#finish")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".evhead")).toBeVisible();
    expect(await game(page, () => window.__apex.eventOk)).toBe(true);
    const sv = await game(page, () => window.__apex.save);
    expect(sv.career.c2.done).toBe(true);
    await expect(page.locator("#nextBtn")).toHaveText(/Sideways 101/);
    await page.click("#menuBtn");
    await expect(page.locator("#career")).toBeVisible();
    expect(problems).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("career map: drift attack runs on a clock, and a boss battle is a 1v1 in the boss's own car", async ({ page }) => {
    test.setTimeout(200_000);
    const problems = await openGame(page, "autopilot=1&speed=12");
    await page.click("#careerBtn");
    await expect(page.locator(".chapter:not(.daily):not(.trophies):not(.stats)")).toHaveCount(4);
    await expect(page.locator(".chapter.trophies li")).toHaveCount(17);
    await page.click("#ev-a1");
    await expect(page.locator("#evDDesc")).toContainText("60 s");
    await page.click("#evGo");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 30_000 });
    await expect(page.locator("#eventTag")).toContainText(/Drift Attack · [01]:\d\d/);
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__apex.raceTime)).toBeLessThan(61);
    await page.click("#menuBtn");
    await page.click("#ev-b1"); await page.click("#evGo");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__apex.fieldSize)).toBe(1);
    expect(await page.evaluate(() => window.__apex.fieldCars)).toEqual(["brute"]);
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 120_000 });
    await expect(page.locator(".evhead")).toBeVisible();
    expect(problems).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("daily challenge: a dated event on the career map that starts on its own track", async ({ page }) => {
    test.setTimeout(150_000);
    const problems = await openGame(page, "autopilot=1&speed=12");
    await page.click("#careerBtn");
    await page.click("#ev-daily");
    await expect(page.locator("#evDName")).toHaveText("Daily Challenge");
    await expect(page.locator("#evDDesc")).toContainText("every day");
    await page.click("#evGo");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__apex.eventId)).toMatch(/^daily-\d{8}$/);
    expect(problems).toEqual([]);
  });

  test("photo mode: hides the HUD, orbits the camera, and back to the pause screen", async ({ page }) => {
    const problems = await openGame(page, "rivals=2");
    await startRace(page);
    await page.click("#pauseBtn");
    await page.click("#photoBtn");
    await expect(page.locator("#photoBar")).toBeVisible();
    await expect(page.locator("#hud")).toBeHidden();
    await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(380, 280, { steps: 5 }); await page.mouse.up();
    await page.screenshot({ path: "screenshots/photo-mode.png" });
    await page.click("#photoDone");
    await expect(page.locator("#pause")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("cup: a short championship with points after every race", async ({ page }) => {
    test.setTimeout(240_000);
    const problems = await openGame(page, "autopilot=1&speed=12&laps=1&rivals=3");
    await page.click("#raceBtn");
    await page.click("#modeCup");
    await expect(page.locator("#cupName")).toContainText("Sunset Cup");
    await expect(page.locator("#startBtn")).toHaveText("Start cup");
    await page.click("#startBtn");
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 90_000 });
    await expect(page.locator(".cuphead")).toContainText("race 1 of 3");
    await expect(page.locator("#nextBtn")).toContainText("Next race");
    await page.click("#nextBtn");
    await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 45_000 });
    expect(await page.evaluate(() => window.__apex.track)).toBe("gp");
    expect(problems).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("cameras: the camera button cycles high chase, low chase and bonnet", async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 412 });
    const problems = await openGame(page, "rivals=3");
    await startRace(page);
    await expect(page.locator("#camBtn")).toHaveText("Cam 1");
    await page.click("#camBtn"); await expect(page.locator("#camBtn")).toHaveText("Cam 2");
    await page.waitForTimeout(800);
    await page.screenshot({ path: "screenshots/lowcam-landscape.png" });
    await page.click("#camBtn"); await expect(page.locator("#camBtn")).toHaveText("Cam 3");
    await page.click("#camBtn"); await expect(page.locator("#camBtn")).toHaveText("Cam 1");
    expect((await game(page, () => window.__apex.save)).settings.camera).toBe("chase");
    expect(problems).toEqual([]);
  });

  test("an old save from before 2.0 still loads: progress kept, every screen opens, and it races", async ({ page }) => {
    test.setTimeout(150_000);
    // a 1.4-era save: old career ids only, no new fields (laps, trophies, stats, finishes, cups...)
    await page.addInitScript(() => localStorage.setItem("apexring.test.save", JSON.stringify({
      v: 1, coins: 12345, gems: 4, car: "kestrel", owned: ["vanta", "kestrel"], best: { gp: 50.1 }, ghosts: {},
      cars: { kestrel: { paint: 2, rims: 1, decal: 3, upgrades: { engine: 2, tyres: 1, handling: 1 } } },
      career: { c1: { done: true, stars: 3 }, c2: { done: true, stars: 2 }, c3: { done: true, stars: 1 }, c4: { done: true, stars: 2 }, c5: { done: true, stars: 1 }, c6: { done: true, stars: 1 } },
      settings: { quality: "", sound: true, tilt: false, camera: "bonnet", difficulty: "normal", assist: "auto", line: "auto" },
    })));
    const problems = await openGame(page, "autopilot=1&speed=12&laps=1");
    await expect(page.locator("#lobbyCar")).toHaveText(/Kestrel/);
    for (const [btn, back] of [["#garageBtn", "#garageBack"], ["#settingsBtn", "#settingsBack"], ["#careerBtn", "#careerBack"], ["#raceBtn", "#setupBack"]]) { await page.click(btn); await page.click(back); }
    await page.click("#careerBtn");
    // finished events stay finished; the new events slotted in before them don't lock them
    await expect(page.locator("#ev-c6")).not.toHaveClass(/lockd/);
    await expect(page.locator("#ev-a1")).not.toHaveClass(/lockd/);
    await page.click("#careerBack");
    await startRace(page);
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 90_000 });
    const sv = await game(page, () => window.__apex.save);
    expect(sv.coins).toBeGreaterThan(12345);
    expect(sv.career.c6.done).toBe(true);
    expect(problems).toEqual([]);
    await page.evaluate(() => localStorage.removeItem("apexring.test.save"));
  });

  test("career: elimination drops the last car each lap", async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page, "autopilot=1&speed=12&laps=3");
    await page.click("#careerBtn");
    await page.click("#ev-c7"); await page.click("#evGo");
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
    // speed units: km/h in test mode by default, mph on request
    await expect(page.locator("#unitV")).toHaveText("KM/H");
    await page.click('#unitTabs [data-u="mph"]');
    await expect(page.locator("#unitV")).toHaveText("MPH");
    expect((await game(page, () => window.__apex.save)).settings.units).toBe("mph");
    await page.click("#resetBtn");
    await expect(page.locator("#unitV")).toHaveText("KM/H");
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
    // the lap is on the local leaderboard, and the ghost can be shared as a code and loaded back as a friend's ghost
    await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 60_000 });
    await expect(page.locator("#results .medalres")).toBeVisible(); // medal (or the next one to aim for)
    await page.click("#menuBtn");
    await page.click("#raceBtn");
    await page.click("#modeTrial");
    await expect(page.locator("#medalLine .md")).toHaveCount(3);
    await expect(page.locator("#boardList li").first()).toContainText(/\d:\d\d\.\d\d/);
    await page.click("#ghostShare");
    await expect(page.locator("#ghostCode")).toHaveValue(/^APXG1/);
    await page.click("#ghostLoad");
    await expect(page.locator("#ghostMsg")).toContainText("Loaded");
    expect((await game(page, () => window.__apex.save)).friendGhosts.oval.s.length).toBeGreaterThan(40);
    // and the best lap can be watched back as a replay
    await page.click("#replayBtn");
    await page.waitForFunction(() => window.__apex.mode === "replay");
    await expect(page.locator("#replayTag")).toContainText("REPLAY");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "screenshots/replay-landscape.png" });
    await page.keyboard.press("x");
    await page.waitForFunction(() => window.__apex.mode === "menu");
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
