import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";

// The installable-app pieces: manifest, icons, and a service worker that caches every shipped file.
test("manifest and icons are valid", async ({ page, request }) => {
  await page.goto("/index.html?test=1");
  const href = await page.getAttribute('link[rel="manifest"]', "href");
  const m = await (await request.get("/" + href)).json();
  expect(m.name).toBe("Apex Ring");
  expect(m.icons.some((i) => i.sizes === "512x512")).toBe(true);
  for (const i of m.icons) expect((await request.get("/" + i.src)).ok()).toBe(true);
});

test("service worker caches every game file and installs", async ({ page }) => {
  const sw = readFileSync("sw.js", "utf8");
  for (const f of ["index.html", "styles.css", ...readdirSync("src").map((f) => "src/" + f), "vendor/three/three.module.js"]) expect(sw).toContain("./" + f);
  await page.goto("/index.html");
  const ok = await page.evaluate(async () => { const r = await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready; return !!r.active || !!r.installing || !!r.waiting; });
  expect(ok).toBe(true);
});

test("game works offline after the first visit", async ({ page, context }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => { await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#raceBtn")).toBeVisible({ timeout: 20_000 });
  await context.setOffline(false);
});

// Updates: serve a service worker whose content changes on every fetch, like a new deploy would.
// The test writes sw-test.js next to sw.js and changes it between "deploys" (it's git-ignored and removed after).
let deployN = 0;
function deploy() { writeFileSync("sw-test.js", readFileSync("sw.js", "utf8") + `\n// deploy ${++deployN}\n`); }
test.afterAll(() => { try { unlinkSync("sw-test.js"); } catch { /* already gone */ } });

test("a new version shows an 'Update ready' banner and tapping it reloads", async ({ page }) => {
  deploy();
  await page.goto("/index.html?test=1&sw=sw-test.js");
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 20_000 });
  deploy();
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await expect(page.locator("#updateBanner")).toBeVisible({ timeout: 20_000 });
  const reloaded = page.waitForEvent("load", { timeout: 20_000 });
  await page.click("#updateBanner");
  await reloaded;
  await page.waitForFunction(() => window.__apex && window.__apex.ready);
  await expect(page.locator("#updateBanner")).toBeHidden();
});

test("a waiting update is applied automatically on the next launch", async ({ page }) => {
  deploy();
  await page.goto("/index.html?test=1&sw=sw-test.js");
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 20_000 });
  deploy();
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r.waiting), null, { timeout: 20_000 });
  // "next launch": open the app again with the normal launch window
  await page.goto("/index.html?test=1&sw=sw-test.js&launchwin=60000");
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !r.waiting), null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__apex && window.__apex.ready);
});

test("settings show the version number", async ({ page }) => {
  await page.goto("/index.html?test=1");
  await page.waitForFunction(() => window.__apex && window.__apex.ready);
  await page.click("#settingsBtn");
  await expect(page.locator("#versionV")).toHaveText(/^Apex Ring v\d+\.\d+\.\d+ · /);
});
