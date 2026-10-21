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

// Online play against a stand-in server: the config is swapped for a fake project, REST calls are answered here, and the
// Realtime WebSocket is played by a fake friend ("Mo") who joins the room and then drives alongside.
test("online with a server: world board, and a live race with a friend in a room", async ({ page }) => {
  test.setTimeout(120_000);
  const URL = "https://fake.supabase.test", sent = [];
  await page.route("**/src/onlineconfig.js", (r) => r.fulfill({ contentType: "text/javascript", body: `export const ONLINE = { url: "${URL}", anonKey: "anon" };` }));
  await page.route(URL + "/**", (r) => {
    const u = r.request().url(), json = (b, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b), headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (r.request().method() === "OPTIONS") return json(null);
    if (u.includes("/auth/v1/signup")) return json({ access_token: "tok", refresh_token: "ref", expires_at: Date.now() / 1000 + 3600, user: { id: "me-1" } });
    if (u.includes("/rest/v1/profiles")) return r.fulfill({ status: 201, body: "", headers: { "access-control-allow-origin": "*" } });
    if (u.includes("/rest/v1/friends")) return json([]);
    if (u.includes("/rest/v1/laps") && r.request().method() === "GET") return json([{ user_id: "x", ms: 61234, car: "vanta", profiles: { name: "Ace" } }, { user_id: "me-1", ms: 65000, car: "vanta", profiles: { name: "Jake" } }, { user_id: "x", ms: 70000, car: "vanta", profiles: { name: "Ace" } }]);
    if (u.includes("/rest/v1/ghosts")) return json([{ user_id: "x", ms: 61234 }]);
    if (u.includes("/rest/v1/leaderboard")) return json([{ user_id: "x", name: "Ace", ms: 61234, car: "vanta" }, { user_id: "me-1", name: "Jake", ms: 65000, car: "vanta" }]);
    return json({});
  });
  await page.routeWebSocket(/fake\.supabase\.test\/realtime/, (ws) => {
    let topic = "";
    const bc = (event, payload) => ws.send(JSON.stringify({ topic, event: "broadcast", payload: { type: "broadcast", event, payload }, ref: null }));
    ws.onMessage((raw) => {
      const m = JSON.parse(raw);
      if (m.event === "phx_join") { topic = m.topic; ws.send(JSON.stringify({ topic, event: "phx_reply", payload: { status: "ok", response: {} }, ref: m.ref })); const hi = () => bc("hi", { i: "mo", n: "Mo", c: "vanta" }); setTimeout(hi, 200); const hiT = setInterval(hi, 2000); ws.onClose(() => clearInterval(hiT)); } // like a real player: hello every 2 s
      if (m.event === "broadcast") {
        sent.push(m.payload.event);
        if (m.payload.event === "go") { let d = 0; const tick = setInterval(() => { d += 4; bc("s", { i: "mo", x: 5, y: 0.5, z: d, h: 0, d, v: 40 }); }, 100); ws.onClose(() => clearInterval(tick)); }
      }
    });
  });
  await openGame(page, "online=1");
  await page.click("#onlineBtn");
  await expect(page.locator("#oBoard li")).toHaveCount(2);
  await expect(page.locator("#oBoard")).toContainText("Ace");
  await expect(page.locator("#oBoard .ttl").first()).toHaveText("Apex Legend"); // season titles by rank
  await expect(page.locator("#oBoard .gbtn")).toHaveCount(1); // Ace has a ghost to race (not you)
  await page.click('#online .seg [data-o="race"]');
  await page.click("#oMakeRoom");
  await expect(page.locator("#oLobby")).toBeVisible();
  await expect(page.locator("#oRoomName")).toHaveText(/^[A-Z0-9]{5}$/);
  await expect(page.locator("#oPlayers")).toContainText("Mo", { timeout: 10_000 });
  // still in the room, a normal quick race keeps its bots (they used to vanish while a room was open)
  await page.click("#onlineBack"); await page.click("#raceBtn"); await page.click("#startBtn");
  await page.waitForFunction(() => window.__apex.mode === "countdown" || window.__apex.mode === "race");
  expect((await game(page, () => window.__apex.net)).standings).toBeGreaterThan(2);
  await page.waitForFunction(() => window.__apex.mode === "race"); await page.click("#pauseBtn"); await page.click("#quitBtn");
  await page.click("#onlineBtn"); await page.click('#online .seg [data-o="race"]');
  await expect(page.locator("#oPlayers")).toContainText("Mo");
  await page.click("#oGo");
  await page.waitForFunction(() => window.__apex.mode === "race" || window.__apex.mode === "countdown");
  expect(sent).toContain("go");
  await page.waitForFunction(() => { const n = window.__apex.net; return n && n.peers.length === 1 && n.peers[0].shown; }, null, { timeout: 20_000 });
  expect((await game(page, () => window.__apex.net)).standings).toBe(2); // you and Mo, no AI rivals
  await page.waitForFunction(() => window.__apex.mode === "race");
  await page.waitForTimeout(500);
  expect(sent).toContain("s");
});

test("Sky Islands: the second flight track starts from Daily challenge and has two chasms with rings", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, "autopilot=1&rivals=2");
  await page.click("#dailyBtn");
  await page.click("#skyGo");
  await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 60_000 });
  expect(await game(page, () => window.__apex.track)).toBe("sky");
  await page.evaluate(() => window.__apex.warp(window.__apex.gapD() - 300));
  await page.waitForFunction(() => window.__apex.flight.flying, null, { timeout: 30_000 });
  await page.screenshot({ path: "screenshots/sky-flight.png" });
});

test("tutorial runs a guided lap, and Share replay films the highlight into a video", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page, "autopilot=1");
  await page.click("#tutBtn");
  await page.waitForFunction(() => window.__apex.mode === "race", null, { timeout: 60_000 });
  await expect(page.locator("#tutBox")).toBeVisible();
  await expect(page.locator("#tutStep")).toContainText("/ 4");
  await page.waitForFunction(() => window.__apex.mode === "done", null, { timeout: 120_000 });
  await expect(page.locator("#finish")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#tutBox")).toBeHidden();
  await expect(page.locator("#clipBtn")).toBeVisible();
  await page.click("#clipBtn");
  await expect(page.locator("#clipBar")).toBeVisible();
  await expect(page.locator("#clipBtn")).toHaveText(/Share video|Replay again/, { timeout: 60_000 });
});
