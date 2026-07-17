import { expect, test as playwrightTest } from "@playwright/test";
import { consoleErrorBaseline } from "./baselines.mjs";

const criticalPaths = new Set([
  "/api/boot-state",
  "/api/state",
  "/api/today/summary",
  "/api/campaign/command",
  "/api/capture-inbox",
  "/api/daily-run/quick-capture",
  "/api/runway-inputs",
  "/api/ui/search",
  "/api/ui/today",
  "/api/ui/inbox",
  "/api/ui/inbox/action",
  "/api/ui/route-access"
]);

const expectedCriticalResponses = new WeakMap();
const expectedConsoleErrors = new WeakMap();
const expectedRequestFailures = new WeakMap();
let restrictedSessionCookies = null;

export function allowExpectedCriticalResponse(page, pathname, count = 1) {
  const current = expectedCriticalResponses.get(page) || new Map();
  current.set(pathname, (current.get(pathname) || 0) + Math.max(1, Number(count) || 1));
  expectedCriticalResponses.set(page, current);
}

export function allowExpectedConsoleError(page, pattern, count = 1) {
  const current = expectedConsoleErrors.get(page) || [];
  current.push({ pattern, remaining:Math.max(1, Number(count) || 1) });
  expectedConsoleErrors.set(page, current);
}

export function allowExpectedRequestFailure(page, pathname, pattern = /abort/i, count = 1) {
  const current = expectedRequestFailures.get(page) || [];
  current.push({ pathname, pattern, remaining:Math.max(1, Number(count) || 1) });
  expectedRequestFailures.set(page, current);
}

function consumeExpectedConsoleError(page, text) {
  const current = expectedConsoleErrors.get(page) || [];
  const expected = current.find((entry) => entry.remaining > 0 && entry.pattern.test(text));
  if (!expected) return false;
  expected.remaining -= 1;
  return true;
}

function consumeExpectedCriticalResponse(page, pathname) {
  const current = expectedCriticalResponses.get(page);
  const remaining = current?.get(pathname) || 0;
  if (!remaining) return false;
  if (remaining === 1) current.delete(pathname);
  else current.set(pathname, remaining - 1);
  return true;
}

function consumeExpectedRequestFailure(page, pathname, errorText) {
  const current = expectedRequestFailures.get(page) || [];
  const expected = current.find((entry) => entry.remaining > 0 && entry.pathname === pathname && entry.pattern.test(errorText));
  if (!expected) return false;
  expected.remaining -= 1;
  return true;
}

function allowedOrigins(baseURL) {
  return new Set([
    baseURL,
    process.env.BROWSER_TEST_VNEXT_BASE_URL,
    process.env.BROWSER_TEST_CREATE_BASE_URL,
    process.env.BROWSER_TEST_ACTIONS_BASE_URL,
    process.env.BROWSER_TEST_RESTRICTED_BASE_URL,
    process.env.BROWSER_TEST_TODAY_BASE_URL
  ].filter(Boolean).map((value) => new URL(value).origin));
}

export const test = playwrightTest.extend({
  page:async ({ page, baseURL }, use, testInfo) => {
    const failures = [];
    const origins = allowedOrigins(baseURL);

    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (origins.has(url.origin) || ["data:", "blob:"].includes(url.protocol)) {
        await route.continue();
        return;
      }
      await route.fulfill({ status:204, contentType:"text/plain", body:"" });
    });

    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (consumeExpectedConsoleError(page, text)) return;
      if (!consoleErrorBaseline.some((entry) => entry.pattern.test(text))) {
        failures.push(`console.error: ${text}`);
      }
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const errorText = request.failure()?.errorText || "unknown";
      if (origins.has(url.origin) && url.pathname === "/api/ui/search" && /abort/i.test(errorText)) return;
      if (origins.has(url.origin) && consumeExpectedRequestFailure(page, url.pathname, errorText)) return;
      if (origins.has(url.origin)) failures.push(`requestfailed: ${url.pathname} (${request.failure()?.errorText || "unknown"})`);
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (origins.has(url.origin) && criticalPaths.has(url.pathname) && response.status() >= 400) {
        if (consumeExpectedCriticalResponse(page, url.pathname)) return;
        failures.push(`critical response: ${response.status()} ${url.pathname}`);
      }
    });

    await use(page);
    if (failures.length) {
      await testInfo.attach("unexpected-client-errors", {
        body:Buffer.from(`${failures.join("\n")}\n`),
        contentType:"text/plain"
      });
    }
    expect(failures, "The rendered workflow must not emit unexpected client errors.").toEqual([]);
  }
});

export { expect };

export async function authenticateRestricted(page) {
  const restrictedURL = process.env.BROWSER_TEST_RESTRICTED_BASE_URL;
  const credential = process.env.BROWSER_TEST_RESTRICTED_CREDENTIAL;
  expect(restrictedURL, "The restricted browser fixture URL is required.").toBeTruthy();
  expect(credential, "The synthetic restricted fixture credential is required.").toBeTruthy();
  if (!restrictedSessionCookies) {
    const login = await page.request.post(`${restrictedURL}/api/auth/login`, { data:{ credential } });
    expect(login.ok(), "The restricted browser fixture must authenticate.").toBe(true);
    restrictedSessionCookies = await page.context().cookies(restrictedURL);
  } else {
    await page.context().addCookies(restrictedSessionCookies);
  }
  return restrictedURL;
}

export async function openToday(page, target = "/#today") {
  await page.goto(target, { waitUntil:"domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready)), {
    message:"The Command Center boot contract should reach ready."
  }).toBe(true);
  await expect(page.locator("main#app")).toBeVisible();
  await expect(page.locator("main#app").getByRole("heading", { level:1 }).first()).toBeVisible();
  await expect(page.locator("main#app")).not.toBeEmpty();
  await expect(page.getByText(/LegalEase did not finish rendering/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name:"Recovery Mode" })).toHaveCount(0);
}
