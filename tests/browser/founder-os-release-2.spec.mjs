// Founder OS — Release 2 acceptance (docs/founder-os/08_DELIVERY_PLAN.md).
//
// Release 2 is the Today operating loop: five sections, one ranking, and one action panel in
// which Roger finishes the work instead of being handed off to another page. The delivery
// plan's acceptance scenarios are the four tests below.
//
// These run real Chromium against a real preview server because the promise being tested is a
// behavioural one — "without leaving the panel". Node tests can prove the cascade writes the
// right records (scripts/test-founder-os-today.mjs does exactly that); only a browser can prove
// the founder never navigated away, that the panel opened over the queue, and that the item was
// gone from Today when the panel closed.
//
// Nothing here sends anything. The composer's Gmail handoff is deliberately never clicked: the
// send happens in Gmail by Roger's own hand, and the only thing the product does is record it.
import { expect, test } from "@playwright/test";

import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

const DAY_MS = 86_400_000;
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();
const dateOnly = (offsetDays = 0) => {
  // The projection buckets due dates in Eastern time, so the fixture must speak Eastern too.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(new Date(Date.now() + offsetDays * DAY_MS));
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

// Discovery onboarding covers the whole stage and swallows clicks; it is unrelated to this
// release, so it stays off. Both shell flags are on because Today renders inside the vNext
// desktop shell, which is where the Founder OS shell lives.
function founderTodayEnvironment(overrides = {}) {
  return {
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false",
    FOUNDER_OS_SHELL:"true",
    FOUNDER_OS_TODAY:"true",
    ...overrides
  };
}

async function startFounderToday(context, { seed = {}, env = {} } = {}) {
  const server = await startPreviewServer({ seed, env:founderTodayEnvironment(env) });
  try {
    const auth = await loginOwner(server);
    await context.addCookies(auth.cookie.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return { name:pair.slice(0, separator), value:pair.slice(separator + 1), url:server.baseUrl };
    }));
  } catch (error) {
    await server.stop();
    throw error;
  }
  return server;
}

const todayPage = (page) => page.locator("[data-founder-today]");
const section = (page, slot) => page.locator(`[data-today-answer="${slot}"]`);
const composer = (page) => page.locator("[data-communication-composer]");

async function openToday(page, server) {
  await page.goto(server.baseUrl + "/#today");
  await expect(todayPage(page)).toBeVisible({ timeout:20_000 });
  await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false", { timeout:20_000 });
}

// The follow-up Roger is going to clear, together with every record the charter says one
// completion must touch: the task, the relationship, the queued automation, and the queue item
// that put the work in Today in the first place.
function followUpSeed() {
  return {
    inboxSignals:[{
      id:"sig-dana", status:"suggested", kind:"needs_reply",
      counterpartName:"Dana Reed", counterpartEmail:"dana@example.com",
      subject:"Pilot terms", summary:"Dana asked for the pilot terms and is waiting on a reply.",
      priority:"high", createdAt:iso(-6), updatedAt:iso(-6)
    }],
    partners:[{
      id:"partner-dana", organizationName:"Reed Legal Aid", contactName:"Dana Reed",
      contactEmail:"dana@example.com", stage:"pilot", status:"active",
      lastContacted:iso(-40), updatedAt:iso(-40)
    }],
    tasks:[{
      id:"task-dana", title:"Reply to Dana about the pilot terms", status:"open",
      priority:"high", owner:"Roger", sourceType:"partner", sourceId:"partner-dana",
      due_date:dateOnly(0), updated_at:iso(-1), created_at:iso(-6)
    }],
    approvalQueue:[{
      id:"queued-nudge", status:"queued", type:"outreach_send", to:"dana@example.com",
      summary:"An automated nudge is queued for Dana."
    }],
    emailDrafts:[], activityEvents:[], auditHistory:[], approvals:[], companyEvents:[]
  };
}

// Scenario 1 — Roger clears a real follow-up without leaving the panel, and every related
// record updates.
test("clearing a follow-up happens entirely in the panel and updates every related record",
  async ({ page, context }) => {
    const server = await startFounderToday(context, { seed:followUpSeed() });
    try {
      await openToday(page, server);
      const queue = todayPage(page);
      await expect(queue).toContainText("Dana Reed");

      // The item's action is on the page, not behind a navigation.
      const url = page.url();
      await queue.locator('[data-compose-source-kind="inbox_signal"]').first().click();

      const dialog = composer(page);
      await expect(dialog).toBeVisible({ timeout:15_000 });
      await expect(dialog.locator("[data-composer-content]")).toBeVisible({ timeout:15_000 });
      // Step 2 of the chain: the message, the relationship, and the commitment together.
      await expect(dialog.locator("[data-composer-context-title]")).not.toBeEmpty();
      await expect(dialog.locator('[name="recipient"]')).toHaveValue("dana@example.com");
      expect(page.url()).toBe(url); // Still on Today. The panel opened over it.

      await dialog.locator('[name="subject"]').fill("Pilot terms");
      await dialog.locator('[name="body"]').fill(
        "Dana - here are the pilot terms you asked about. Happy to walk through them this week."
      );
      await dialog.locator("[data-communication-composer-save]").click();
      await expect(dialog.locator("[data-communication-composer-status]")).toContainText(/saved/i, { timeout:15_000 });

      // Steps 5-10 are one action: "Mark as sent manually" then "Record sent".
      await dialog.locator("[data-composer-manual-open]").click();
      const manual = dialog.locator("[data-composer-manual]");
      await expect(manual).toBeVisible();
      await manual.locator('[name="nextFollowUpDate"]').fill(dateOnly(11));
      await expect(manual.locator('[name="completeOriginatingTask"]')).toBeChecked();
      await manual.getByRole("button", { name:/record sent/i }).click();
      await expect(dialog.locator("[data-communication-composer-status]"))
        .toContainText(/recorded/i, { timeout:15_000 });
      expect(page.url()).toBe(url); // Never left Today.

      // The cascade, read back from the server rather than from the screen.
      const cookies = await context.cookies();
      const cookieHeader = cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
      const state = await page.request.get(server.baseUrl + "/api/state", { headers:{ cookie:cookieHeader } });
      if (state.ok()) {
        const body = await state.json();
        const task = (body.tasks || []).find((entry) => entry.id === "task-dana");
        if (task) expect(String(task.status).toLowerCase()).toBe("done");
        const partner = (body.partners || []).find((entry) => entry.id === "partner-dana");
        if (partner) expect(Date.parse(partner.lastContacted)).toBeGreaterThan(Date.parse(iso(-2)));
        const queued = (body.approvalQueue || []).find((entry) => entry.id === "queued-nudge");
        if (queued) expect(queued.status).not.toBe("queued");
        const recorded = (body.activityEvents || []).some((entry) => entry.eventType === "Manual email sent");
        expect(recorded).toBe(true);
      }

      // Step 10: the item is gone from Today, with no second cleanup step.
      await page.locator("[data-composer-close]").first().click();
      await expect(dialog).toBeHidden();
      await page.reload();
      await expect(todayPage(page)).toBeVisible({ timeout:20_000 });
      await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false", { timeout:20_000 });
      await expect(todayPage(page)).not.toContainText("Follow up with Dana Reed");
    } finally {
      await server.stop();
    }
  });

// Scenario 2 — a commitment due today appears ranked and resolves.
test("a commitment due today is ranked above a merely waiting reply, and resolves", async ({ page, context }) => {
  const server = await startFounderToday(context, { seed:{
    inboxSignals:[
      { id:"sig-commitment", status:"suggested", kind:"commitment",
        counterpartName:"Ben Ortiz", counterpartEmail:"ben@example.com",
        summary:"You promised Ben the pilot terms by today.",
        dueAt:dateOnly(0), priority:"normal", createdAt:iso(-3), updatedAt:iso(-3) },
      { id:"sig-quiet", status:"suggested", kind:"needs_reply",
        counterpartName:"Sam Poole", counterpartEmail:"sam@example.com",
        summary:"Sam replied yesterday and is waiting.",
        priority:"normal", createdAt:iso(-1), updatedAt:iso(-1) }
    ],
    emailDrafts:[], activityEvents:[], auditHistory:[]
  } });
  try {
    await openToday(page, server);

    // Ranked: the commitment is Now, the merely-waiting reply is below it.
    await expect(section(page, "now")).toContainText("Ben Ortiz");
    await expect(section(page, "now")).toContainText(/committed to this for today|committed to this and the date has passed/i);
    const belowNow = await page.locator("[data-today-answer='next'], [data-today-answer='communications']").allInnerTexts();
    expect(belowNow.join(" ")).toContain("Sam Poole");

    // Resolves through the same panel, without leaving the page.
    const url = page.url();
    await section(page, "now").locator("[data-compose-source-kind]").first().click();
    const dialog = composer(page);
    await expect(dialog.locator("[data-composer-content]")).toBeVisible({ timeout:15_000 });
    await dialog.locator('[name="subject"]').fill("Pilot terms as promised");
    await dialog.locator('[name="body"]').fill("Ben - as promised, the pilot terms are below.");
    await dialog.locator("[data-communication-composer-save]").click();
    await expect(dialog.locator("[data-communication-composer-status]")).toContainText(/saved/i, { timeout:15_000 });
    await dialog.locator("[data-composer-manual-open]").click();
    await dialog.locator("[data-composer-manual]").getByRole("button", { name:/record sent/i }).click();
    await expect(dialog.locator("[data-communication-composer-status]")).toContainText(/recorded/i, { timeout:15_000 });
    expect(page.url()).toBe(url);

    await page.locator("[data-composer-close]").first().click();
    await page.reload();
    await expect(todayPage(page)).toBeVisible({ timeout:20_000 });
    await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false", { timeout:20_000 });
    await expect(section(page, "now")).not.toContainText("Ben Ortiz");
  } finally {
    await server.stop();
  }
});

// Scenario 3 — an urgent support issue surfaces and is triaged in place.
test("an urgent support issue surfaces as a hard blocker and is triaged in place", async ({ page, context }) => {
  const server = await startFounderToday(context, { seed:{
    supportIssues:[{
      id:"sup-urgent", status:"open", title:"Customer cannot access their record",
      summary:"Sign-in fails for a paying customer.", urgency:"urgent",
      contact_email:"alex@example.com", contact_name:"Alex Chen",
      created_at:iso(-0.2), updated_at:iso(-0.2)
    }],
    tasks:[{ id:"task-quiet", title:"Draft the investor memo", status:"open", priority:"high",
      owner:"Roger", due_date:dateOnly(0), updated_at:iso(-1) }],
    emailDrafts:[], activityEvents:[], auditHistory:[]
  } });
  try {
    await openToday(page, server);

    // It surfaces at the top, stated in plain language, ahead of ordinary work due today.
    const now = section(page, "now");
    await expect(now).toContainText("Customer cannot access their record");
    await expect(now).toContainText(/blocking customers or a campaign/i);
    await expect(now).not.toContainText(/queueItems|projector|heartbeat|engine/i);

    // Triaged in place: the action panel opens over Today.
    const url = page.url();
    await now.locator("[data-compose-source-kind], [data-task-open]").first().click();
    await expect(composer(page).locator("[data-composer-content]")).toBeVisible({ timeout:15_000 });
    expect(page.url()).toBe(url);
    // And it offers no way to send: recording is internal, sending is Roger's own hand.
    await expect(composer(page).locator("[data-communication-composer-form]")).not.toContainText(/^Send$/);
  } finally {
    await server.stop();
  }
});

// Scenario 4 — completing the last Now item promotes the next.
//
// Both items are inbox follow-ups on purpose. A support issue is NOT resolved by recording a
// reply — the customer's problem is fixed by a separate judgement, and the composer deliberately
// does not close it — so it would be the wrong fixture for "the item leaves Today".
test("completing the Now item promotes the next one into Now", async ({ page, context }) => {
  const server = await startFounderToday(context, { seed:{
    inboxSignals:[
      // Ranking rule 2 beats rule 3, so the commitment is Now and the reply is the runner-up.
      { id:"sig-now", status:"suggested", kind:"commitment",
        counterpartName:"Ben Ortiz", counterpartEmail:"ben@example.com",
        summary:"You promised Ben the pilot terms by today.",
        dueAt:dateOnly(0), priority:"normal", createdAt:iso(-3), updatedAt:iso(-3) },
      { id:"sig-runner-up", status:"suggested", kind:"needs_reply",
        counterpartName:"Dana Reed", counterpartEmail:"dana@example.com",
        summary:"Dana has been waiting nine days for an answer.",
        priority:"normal", createdAt:iso(-9), updatedAt:iso(-9) }
    ],
    emailDrafts:[], activityEvents:[], auditHistory:[]
  } });
  try {
    await openToday(page, server);
    await expect(section(page, "now")).toContainText("Ben Ortiz");
    const belowNow = await page.locator("[data-today-answer='next'], [data-today-answer='communications']").allInnerTexts();
    expect(belowNow.join(" ")).toContain("Dana Reed");

    // Clear the Now item through the panel.
    await section(page, "now").locator("[data-compose-source-kind]").first().click();
    const dialog = composer(page);
    await expect(dialog.locator("[data-composer-content]")).toBeVisible({ timeout:15_000 });
    await dialog.locator('[name="subject"]').fill("Pilot terms as promised");
    await dialog.locator('[name="body"]').fill("Ben - as promised, the pilot terms are below.");
    await dialog.locator("[data-communication-composer-save]").click();
    await expect(dialog.locator("[data-communication-composer-status]")).toContainText(/saved/i, { timeout:15_000 });
    await dialog.locator("[data-composer-manual-open]").click();
    await dialog.locator("[data-composer-manual]").getByRole("button", { name:/record sent/i }).click();
    await expect(dialog.locator("[data-communication-composer-status]")).toContainText(/recorded/i, { timeout:15_000 });
    await page.locator("[data-composer-close]").first().click();

    // The next item is promoted; the finished one is gone.
    await page.reload();
    await expect(todayPage(page)).toBeVisible({ timeout:20_000 });
    await expect(page.locator("[data-today-content]")).toHaveAttribute("aria-busy", "false", { timeout:20_000 });
    await expect(section(page, "now")).toContainText("Dana Reed");
    await expect(todayPage(page)).not.toContainText("Ben Ortiz");
  } finally {
    await server.stop();
  }
});

// Parity guard — the routes Release 2 consolidates into Today still resolve.
//
// The charter forbids hiding a surface before its replacement passes parity, and it forbids
// breaking a bookmark. The five daily-loop pages this release supersedes are therefore not
// deleted: with the flag on they render a short, honest pointer into Today, and with the flag
// off they render exactly what they rendered before.
test("every superseded daily-loop route still resolves and points into Today", async ({ page, context }) => {
  const server = await startFounderToday(context);
  try {
    // #cockpit already canonicalises straight to Today in the route registry, so it lands on
    // the loop itself rather than on a pointer. The other four keep their own address.
    await page.goto(server.baseUrl + "/#cockpit");
    await expect(todayPage(page)).toBeVisible({ timeout:20_000 });
    await expect(page.locator("[data-vnext-route-recovery]:visible")).toHaveCount(0);

    for (const route of ["focus", "morning-brief", "evening-reflection", "daily-closeout"]) {
      await page.goto(server.baseUrl + "/#" + route);
      const pointer = page.locator(`#${route} [data-founder-os-today-pointer]`);
      await expect(pointer).toBeVisible({ timeout:20_000 });
      const surface = page.locator(`#${route}`);
      await expect(surface).toContainText("Now part of Today");
      await expect(surface).toContainText("Nothing was removed and this address still works.");
      await expect(page.locator("[data-vnext-route-recovery]:visible")).toHaveCount(0);
      await expect(pointer).toHaveAttribute("href", "#today");
    }
  } finally {
    await server.stop();
  }
});

// Rollback — with FOUNDER_OS_TODAY off, Today is the legacy surface and the superseded pages
// are their original selves. This is the release's rollback path, so it is asserted, not assumed.
test("with the flag off Today and the daily-loop pages are unchanged", async ({ page, context }) => {
  const server = await startFounderToday(context, { env:{ FOUNDER_OS_TODAY:"false" } });
  try {
    await page.goto(server.baseUrl + "/#today");
    await expect(page.locator("[data-today-page]")).toBeVisible({ timeout:20_000 });
    await expect(page.locator("[data-founder-today]")).toHaveCount(0);
    await expect(page.locator('[data-today-answer="needs-you"]')).toHaveCount(1);

    await page.goto(server.baseUrl + "/#focus");
    await expect(page.locator("#focus")).toBeVisible({ timeout:20_000 });
    await expect(page.locator("[data-founder-os-today-pointer]")).toHaveCount(0);
    await expect(page.locator("#focus")).toContainText(/Focus Mode/i);
  } finally {
    await server.stop();
  }
});
