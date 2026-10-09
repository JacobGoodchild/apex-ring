import { expect } from "@playwright/test";

// Opens the game in test mode and fails the test on any console error or page error.
export async function openGame(page, query = "") {
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "localhost") problems.push("external request: " + r.url()); });
  await page.goto("/index.html?test=1" + (query ? "&" + query : ""));
  await page.waitForFunction(() => window.__apex && window.__apex.ready, null, { timeout: 30_000 });
  return problems;
}

export const game = (page, expr) => page.evaluate(expr);

export async function startRace(page) {
  await page.click("#startBtn");
  await expect(page.locator("#count")).toBeVisible();
  await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 20_000 });
}
