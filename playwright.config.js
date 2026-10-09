import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT || 4173);

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "chromium",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: `node scripts/serve.mjs ${port}`,
    url: `http://localhost:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
