import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// No secret keys anywhere in the repo: a Supabase secret key (sb_secret_...) or a service_role JWT would let anyone
// who opens the game take over the database. CI runs this before every deploy.
test("no secret keys are committed", () => {
  const skip = new Set(["node_modules", ".git", "vendor", "test-results", "playwright-report", "screenshots", "devassets"]);
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (skip.has(e.name)) continue; const f = join(dir, e.name); if (e.isDirectory()) walk(f); else if (!/\.(png|jpe?g|webp|mp3|woff2?|ico|glb|bin|hdr)$/i.test(e.name)) files.push(f); } };
  walk(".");
  const bad = [];
  for (const f of files) {
    let text; try { text = readFileSync(f, "utf8"); } catch (_) { continue; }
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) bad.push(f + ": sb_secret_ key");
    for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
      try { if (JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).role === "service_role") bad.push(f + ": service_role JWT"); } catch (_) {}
    }
  }
  expect(bad).toEqual([]);
});

test("the online config only ever holds a public key", () => {
  const src = readFileSync("src/onlineconfig.js", "utf8"), key = (src.match(/anonKey:\s*"([^"]*)"/) || [])[1] || "";
  expect(key === "" || /^sb_publishable_/.test(key) || key.startsWith("eyJ")).toBe(true);
});
