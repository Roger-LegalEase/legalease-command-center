import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BROWSER_TEST_BASE_URL || "http://127.0.0.1:4173";

export default defineConfig({
  testDir:"./tests/browser",
  fullyParallel:false,
  workers:1,
  timeout:30_000,
  globalTimeout:40 * 60_000,
  expect:{ timeout:10_000 },
  forbidOnly:Boolean(process.env.CI),
  failOnFlakyTests:Boolean(process.env.CI),
  retries:process.env.CI ? 1 : 0,
  reporter:[
    ["line"],
    ["html", { outputFolder:"playwright-report", open:"never" }]
  ],
  outputDir:"test-results/playwright",
  use:{
    baseURL,
    ...devices["Desktop Chrome"],
    viewport:{ width:1440, height:900 },
    locale:"en-US",
    timezoneId:"America/New_York",
    serviceWorkers:"block",
    screenshot:"only-on-failure",
    trace:"retain-on-first-failure",
    video:"retain-on-failure"
  },
  projects:[
    { name:"chromium", use:{ ...devices["Desktop Chrome"], browserName:"chromium" } }
  ]
});
