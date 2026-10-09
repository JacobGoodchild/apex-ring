import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";

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
