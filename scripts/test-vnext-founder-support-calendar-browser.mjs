import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  FOUNDER_SUPPORT_ACTION_ENDPOINT,
  FOUNDER_SUPPORT_ENDPOINT,
  FOUNDER_SUPPORT_STYLESHEET_PATH,
  founderSupportPageBrowserSource,
  renderFounderSupportPageShell
} from "./ui/pages/founder-support-page.mjs";
import {
  FOUNDER_CALENDAR_ACTION_ENDPOINT,
  FOUNDER_CALENDAR_CREATE_LINK_ENDPOINT,
  FOUNDER_CALENDAR_ENDPOINT,
  FOUNDER_CALENDAR_STYLESHEET_PATH,
  founderCalendarPageBrowserSource,
  renderFounderCalendarPageShell
} from "./ui/pages/founder-calendar-page.mjs";

const root = process.cwd();
let passed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

console.log("Founder Support and Calendar generated-browser tests");

const supportHtml = renderFounderSupportPageShell("page-section active");
const supportSource = founderSupportPageBrowserSource();
const calendarHtml = renderFounderCalendarPageShell("page-section active");
const calendarSource = founderCalendarPageBrowserSource();

{
  new vm.Script(supportSource, { filename:"founder-support-page.generated.js" });
  new vm.Script(calendarSource, { filename:"founder-calendar-page.generated.js" });
  assert.doesNotMatch(supportSource, /<\/script/iu);
  assert.doesNotMatch(calendarSource, /<\/script/iu);
  ok("both generated browser modules parse in V8 without closing their script block");
}

{
  assert.match(supportHtml, /id="support"/u);
  assert.match(supportHtml, /data-founder-support-page/u);
  assert.match(supportHtml, /data-support-drawer/u);
  assert.match(supportHtml, /Waiting on LegalEase/u);
  assert.match(supportHtml, /Waiting on customer/u);
  assert.doesNotMatch(supportHtml, /\son[a-z]+=/iu);
  assert.doesNotMatch(supportHtml, /<script/iu);
  assert.equal(FOUNDER_SUPPORT_ENDPOINT, "/api/ui/support");
  assert.equal(FOUNDER_SUPPORT_ACTION_ENDPOINT, "/api/ui/support/action");
  ok("Support shell has stable filters, summary, drawer, and no inline event handlers");
}

{
  assert.match(supportSource, /commandCenterOpenComposer/u);
  assert.match(supportSource, /create_task/u);
  assert.match(supportSource, /set_status/u);
  assert.match(supportSource, /link_relationship/u);
  assert.match(supportSource, /vnext:support-updated/u);
  assert.match(supportSource, /preserveScroll:true/u);
  assert.doesNotMatch(supportSource, /\b(?:prompt|alert|confirm)\s*\(/u);
  assert.doesNotMatch(supportSource, /\.send\s*\(/u);
  assert.doesNotMatch(supportSource, /api\/state|boot-state/u);
  ok("Support browser actions reuse the composer, remain scoped, and avoid native dialogs or sends");
}

{
  assert.match(calendarHtml, /id="meetings"/u);
  assert.match(calendarHtml, /data-founder-calendar-page/u);
  assert.match(calendarHtml, /Today/u);
  assert.match(calendarHtml, /This week/u);
  assert.match(calendarHtml, /Partner meetings/u);
  assert.match(calendarHtml, /Customer calls/u);
  assert.match(calendarHtml, /prefilled Google Calendar page/u);
  assert.doesNotMatch(calendarHtml, /\son[a-z]+=/iu);
  assert.doesNotMatch(calendarHtml, /<script/iu);
  assert.equal(FOUNDER_CALENDAR_ENDPOINT, "/api/ui/calendar");
  assert.equal(FOUNDER_CALENDAR_ACTION_ENDPOINT, "/api/ui/calendar/action");
  assert.equal(FOUNDER_CALENDAR_CREATE_LINK_ENDPOINT, "/api/ui/calendar/create-link");
  ok("Calendar shell exposes founder ranges, meeting categories, and an explicit read-only planning boundary");
}

{
  assert.match(calendarSource, /create_preparation_task/u);
  assert.match(calendarSource, /create_follow_up_task/u);
  assert.match(calendarSource, /safeCalendarHref/u);
  assert.match(calendarSource, /calendarChanged/u);
  assert.match(calendarSource, /preserveScroll:true/u);
  assert.doesNotMatch(calendarSource, /\b(?:prompt|alert|confirm)\s*\(/u);
  assert.doesNotMatch(calendarSource, /\.send\s*\(/u);
  assert.doesNotMatch(calendarSource, /gapi|calendar\.events\.|events\.insert|provider\/send/iu);
  assert.doesNotMatch(calendarSource, /api\/state|boot-state/u);
  ok("Calendar browser actions create only internal tasks and safe Google links without provider mutation code");
}

{
  const supportCss = readFileSync(`${root}/${FOUNDER_SUPPORT_STYLESHEET_PATH}`, "utf8");
  const calendarCss = readFileSync(`${root}/${FOUNDER_CALENDAR_STYLESHEET_PATH}`, "utf8");
  for (const css of [supportCss, calendarCss]) {
    assert.match(css, /@media \(max-width: 480px\)/u);
    assert.match(css, /min-width: 0/u);
    assert.match(css, /min-height: 2\.75rem/u);
    assert.match(css, /focus-visible/u);
    assert.match(css, /prefers-reduced-motion/u);
    assert.doesNotMatch(css, /\n\s*width:\s*[4-9][0-9]{2,}px/iu);
  }
  assert.match(supportCss, /founder-support__drawer-actions/u);
  assert.match(calendarCss, /founder-calendar__planner footer/u);
  ok("both visual layers provide 390px-safe controls, focus treatment, and stable mobile action areas");
}

console.log(`PASS test-vnext-founder-support-calendar-browser (${passed} checks)`);
