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
  await page.click("#raceBtn");
  await page.click("#startBtn");
  // the countdown shows once the track has loaded (slow on a busy machine); at test speed it can be over between polls
  await page.waitForFunction(() => !document.getElementById("count").hidden || window.__apex.mode === "race", null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 45_000 }); // slow CI machines can take a while to get past the countdown
}
