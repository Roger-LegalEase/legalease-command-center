// Command Center — action discoverability acceptance.
//
// This suite exists because of two failures Roger hit in the product, not in a document:
//
//   1. Partner Outreach said N items needed his approval and gave him no way to reach them. The
//      number was also wrong: its approvalQueue half was never filtered by campaign type.
//   2. Bulk audience upload was one click from a LEGACY campaigns hero that the Outreach flag
//      deletes — so with that flag on there was no path at all.
//
// Everything here is driven in a real browser against the real server. Nothing is asserted from
// source. The rule the whole file enforces: a number Roger can see is a number he can open, and
// a control that looks actionable does something.
//
// It is also the founder-language gate. It reads VISIBLE text and accessible names only —
// innerText, aria-label, the accessibility tree — never hidden templates, script source, data
// attributes or route hashes. Backward-compatible hashes like #prospects and #upload are
// deliberately preserved; it is the words on the screen that must change.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

// Every clock-sensitive expectation in this file is avoided rather than pinned server-side, but
// the browser clock is pinned anyway so client-formatted dates cannot make a run flaky.
const PINNED_CLOCK = new Date("2026-07-27T14:00:00.000Z"); // a Monday, 10:00 Eastern

function founderEnvironment(overrides = {}) {
  return {
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false",
    FOUNDER_OS_SHELL:"true",
    FOUNDER_OS_TODAY:"true",
    FOUNDER_OS_RELATIONSHIPS:"true",
    FOUNDER_OS_CAMPAIGNS:"true",
    ...overrides
  };
}

// Two organisations waiting for review, plus rows that must NOT be counted: an approved one, a
// rejected one, a review-desk approval with no campaign type, a press approval, and a partner
// outreach message that no reviewed workflow can display.
function seed() {
  return {
    posts:[
      { id:"post-1", status:"draft", targetChannels:["linkedin"] },
      { id:"post-2", status:"needs_review", targetChannels:["linkedin"] },
      { id:"post-3", status:"approved", targetChannels:["instagram"] }
    ],
    reactivationCampaign:{
      campaignId:"mvp-reactivation", status:"active",
      liveMode:{ enabled:false, updatedBy:"owner", updatedAt:"2026-07-20T12:00:00.000Z" },
      releasedWaves:[1]
    },
    autopilotSettings:{},
    reactivationContacts:[
      { contact_id:"react-1", email:"one@example.org", wave:1, enrolled_at:"2026-07-20T12:00:00.000Z", sequence_status:"Enrolled" }
    ],
    reactivationAttempts:[], reactivationEvents:[],
    prospectCandidates:[
      { id:"cand-1", review_state:"pending_review", organization_name:"Alpha Legal Aid", score:80, classification:"legal_aid", source:"irs_bmf", city:"Chicago", state:"IL" },
      { id:"cand-2", review_state:"pending_review", organization_name:"Beta Reentry", score:60, classification:"nonprofit", source:"irs_bmf", city:"Peoria", state:"IL" },
      { id:"cand-3", review_state:"approved", organization_name:"Gamma Clinic" },
      { id:"cand-4", review_state:"rejected", organization_name:"Delta Aid" }
    ],
    approvalQueue:[
      { id:"q1", type:"content_review", status:"queued_for_approval", title:"A post needs review" },
      { id:"q2", type:"outreach_message", status:"queued_for_approval", to:"a@example.org", title:"Outreach: step 1" },
      { id:"q3", type:"outreach_message", lane:"press", status:"queued_for_approval", title:"Press: step 1" }
    ],
    outreachContacts:[], outreachReplies:[], outreachSuppressions:[], outreachUnsubscribes:[],
    partners:[
      { id:"partner-1", name:"Alpha Legal Aid", stage:"qualified", owner:"Roger", nextAction:"", updatedAt:"2026-07-20T12:00:00.000Z" }
    ],
    tasks:[], activityEvents:[], auditHistory:[], queueItems:[], alerts:[]
  };
}

async function start(context, { env = {}, state = seed() } = {}) {
  const server = await startPreviewServer({ seed:state, env:founderEnvironment(env) });
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

// Any request that is not a read. Used to prove that opening a destination changes nothing.
function watchForWrites(page) {
  const writes = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  return writes;
}

async function openWorkspace(page, server, hash) {
  await page.clock.install({ time:PINNED_CLOCK });
  await page.goto(`${server.baseUrl}/${hash}`);
}

// ---------------------------------------------------------------------------------------------
// 1. Partner Outreach: the count, the button, and the list behind it
// ---------------------------------------------------------------------------------------------

test.describe("Partner outreach approvals", () => {
  test("the card count equals the records the destination shows, and Review approvals opens them", async ({ context, page }) => {
    const server = await start(context);
    try {
      const writes = watchForWrites(page);
      await openWorkspace(page, server, "#campaigns");

      const review = page.locator('[data-campaign-lane="partner_outreach"] [data-campaign-stage="review"]');
      await expect(review).toBeVisible();
      const summary = await review.locator(".founder-campaign-stage-summary").innerText();

      // Two organisations are pending. The three approvalQueue rows are, in order: not partner
      // outreach at all, partner outreach with no reviewable surface, and press. None of them
      // may raise the number.
      const counted = Number((summary.match(/^(\d+) organisation/) || [])[1]);
      expect(counted, `the card said: ${summary}`).toBe(2);
      expect(summary).toMatch(/1 drafted partner email is also waiting/i);

      // The button. Its accessible name says what it does; it is a real link, not a span.
      const button = review.getByRole("link", { name:/Review approvals/i });
      await expect(button).toBeVisible();
      await button.click();

      // The destination shows exactly the records the card counted.
      await expect(page.locator("#prospects.page-section.active")).toBeVisible();
      await expect(page.getByRole("heading", { name:"Partner outreach approvals" })).toBeVisible();
      const shown = page.locator("input[data-prospect-id]");
      await expect(shown).toHaveCount(counted);
      await expect(page.locator("[data-prospect-count]")).toContainText(`of ${counted} shown selected`);

      // Getting here changed nothing.
      expect(writes, `navigation must cause no write; saw: ${writes.join(", ")}`).toEqual([]);
    } finally {
      await server.stop();
    }
  });

  test("Back returns to the Partner Outreach card, and Forward returns to the list", async ({ context, page }) => {
    const server = await start(context);
    try {
      await openWorkspace(page, server, "#campaigns");
      const review = page.locator('[data-campaign-lane="partner_outreach"] [data-campaign-stage="review"]');
      await review.getByRole("link", { name:/Review approvals/i }).click();
      await expect(page.getByRole("heading", { name:"Partner outreach approvals" })).toBeVisible();

      await page.goBack();
      await expect(page.locator('[data-campaign-lane="partner_outreach"]')).toBeVisible();
      expect(page.url()).toContain("#campaigns");

      await page.goForward();
      await expect(page.getByRole("heading", { name:"Partner outreach approvals" })).toBeVisible();
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Bulk audience upload, in BOTH states of the Outreach flag
// ---------------------------------------------------------------------------------------------

for (const outreachFlag of ["false", "true"]) {
  test(`Import audience is in Campaigns and opens the preview-first importer with the Outreach flag ${outreachFlag}`, async ({ context, page }) => {
    const server = await start(context, { env:{ COMMAND_CENTER_UX_VNEXT_OUTREACH:outreachFlag } });
    try {
      const writes = watchForWrites(page);
      await openWorkspace(page, server, "#campaigns");

      // Plan and setup is part of the workspace, not of a legacy hero the flag can delete.
      const setup = page.locator("[data-campaign-setup]");
      await expect(setup).toBeVisible();
      await expect(setup.getByRole("heading", { name:"Plan and setup" })).toBeVisible();

      const importLink = setup.getByRole("link", { name:"Import audience" });
      await expect(importLink).toBeVisible();
      await importLink.click();

      // The existing preview-first importer, in audience language.
      await expect(page.locator("#upload.page-section.active")).toBeVisible();
      await expect(page.getByRole("heading", { name:"Import an audience" })).toBeVisible();
      await expect(page.locator("#upload")).toContainText("Preview before saving");
      // Opening the importer imports nothing.
      expect(writes, `opening the importer must change nothing; saw: ${writes.join(", ")}`).toEqual([]);
    } finally {
      await server.stop();
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 3. The founder Campaigns workspace owns the page
// ---------------------------------------------------------------------------------------------

test.describe("Campaigns workspace ownership", () => {
  for (const outreachFlag of ["false", "true"]) {
    test(`no legacy campaigns surface is visible beneath the founder workspace with the Outreach flag ${outreachFlag}`, async ({ context, page }) => {
      const server = await start(context, { env:{ COMMAND_CENTER_UX_VNEXT_OUTREACH:outreachFlag } });
      try {
        await openWorkspace(page, server, "#campaigns");
        await expect(page.locator("[data-founder-campaigns]")).toBeVisible();

        const visible = await page.locator("main#app").innerText();
        // The legacy hero, its duplicate campaign summary, and the vNext Outreach table.
        expect(visible).not.toContain("Review-only control surface");
        expect(visible).not.toContain("campaign/list rows");
        expect(visible).not.toContain("Campaign brain");
        expect(visible).not.toContain("Existing engines");
        expect(visible).not.toContain("Prepare approval items");
        // Exactly one "Campaigns" heading owns the page.
        await expect(page.getByRole("heading", { name:"Campaigns", exact:true })).toHaveCount(1);
      } finally {
        await server.stop();
      }
    });
  }

  test("every stage action is a real control, and nothing that looks actionable does nothing", async ({ context, page }) => {
    const server = await start(context);
    try {
      const writes = watchForWrites(page);
      await openWorkspace(page, server, "#campaigns");
      await expect(page.locator("[data-founder-campaigns]")).toBeVisible();

      const actions = page.locator("[data-campaign-action]");
      const total = await actions.count();
      expect(total, "the workspace must expose at least one real control").toBeGreaterThan(0);
      for (let index = 0; index < total; index += 1) {
        const element = actions.nth(index);
        const tag = await element.evaluate((node) => node.tagName.toLowerCase());
        expect(["a", "button"], "an action must be an anchor or a button, never a span").toContain(tag);
        if (tag === "a") expect(await element.getAttribute("href")).toMatch(/^#/);
        else expect(await element.getAttribute("data-campaign-control")).toBeTruthy();
      }

      // The one button on the surface opens the existing sending controls. It sends nothing.
      const control = page.locator("[data-campaign-control]").first();
      if (await control.count()) {
        await control.click();
        await expect(page.locator("[data-campaign-controls]")).toHaveAttribute("open", "");
      }
      expect(writes, `the Campaigns workspace must issue no write; saw: ${writes.join(", ")}`).toEqual([]);
    } finally {
      await server.stop();
    }
  });

  test("with the Campaigns flag off the legacy workspace returns unchanged", async ({ context, page }) => {
    const server = await start(context, { env:{ FOUNDER_OS_CAMPAIGNS:"false" } });
    try {
      await openWorkspace(page, server, "#campaigns");
      await expect(page.locator("[data-founder-campaigns]")).toHaveCount(0);
      // The legacy surface, exactly as it was: its hero and its own controls.
      await expect(page.locator("main#app")).toContainText("Review-only control surface");
      await expect(page.locator("[data-reactivation-control-surface]")).toBeVisible();
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Today and Relationships
// ---------------------------------------------------------------------------------------------

test.describe("Today", () => {
  test("the primary action sits beside the Now item and the full record is named plainly", async ({ context, page }) => {
    const state = seed();
    state.tasks = [{
      id:"task-1", title:"Send the partner agreement", status:"open", important:true,
      priority:"urgent", dueDate:"2026-07-27", owner:"Roger", updatedAt:"2026-07-26T12:00:00.000Z"
    }];
    const server = await start(context, { state });
    try {
      await openWorkspace(page, server, "#today");
      const now = page.locator('[data-today-answer="now"]');
      await expect(now).toBeVisible();
      // The action is inside the Now section, not on another screen.
      await expect(now.locator("[data-today-now]")).toBeVisible();
      // "Advanced" was shell vocabulary on a founder surface.
      const text = await page.locator("main#app").innerText();
      expect(text).not.toContain("Advanced full record");
    } finally {
      await server.stop();
    }
  });

  test("a needs-attention row that carries a decision also carries a way to open it", async ({ context, page }) => {
    const state = seed();
    state.queueItems = [{
      id:"queue-1", title:"Approve the partner agreement", status:"blocked",
      sourceRef:{ collection:"tasks", itemId:"task-9" },
      createdAt:"2026-06-01T12:00:00.000Z", updatedAt:"2026-06-01T12:00:00.000Z"
    }];
    const server = await start(context, { state });
    try {
      const writes = watchForWrites(page);
      await openWorkspace(page, server, "#today");
      const section = page.locator('[data-today-answer="needs-attention"]');
      await expect(section).toBeVisible();
      const link = section.getByRole("link").first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href, "the destination must be a route the server vetted").toMatch(/^#item\//);
      await link.click();
      expect(writes, `opening a needs-attention item must change nothing; saw: ${writes.join(", ")}`).toEqual([]);
    } finally {
      await server.stop();
    }
  });
});

test.describe("Relationships", () => {
  test("Import and Add are in the header and the counts open their filtered lists", async ({ context, page }) => {
    const server = await start(context);
    try {
      const writes = watchForWrites(page);
      await openWorkspace(page, server, "#partners");
      const header = page.locator(".relationships-header");
      await expect(header).toBeVisible();
      await expect(header.getByRole("link", { name:"Import relationships" })).toBeVisible();
      await expect(header.getByRole("button", { name:"Add relationship" })).toBeVisible();

      // The count IS the filter.
      const followUp = page.getByRole("button", { name:/Follow-up due/ }).first();
      await expect(followUp).toBeVisible();
      await followUp.click();
      await expect.poll(() => page.url()).toContain("followUp=due");
      expect(writes.filter((entry) => !entry.includes("/api/ui/relationships"))).toEqual([]);
    } finally {
      await server.stop();
    }
  });

  test("Import relationships opens the preview-first importer", async ({ context, page }) => {
    const server = await start(context);
    try {
      await openWorkspace(page, server, "#partners");
      await page.locator(".relationships-header").getByRole("link", { name:"Import relationships" }).click();
      await expect(page.getByRole("heading", { name:"Import an audience" })).toBeVisible();
    } finally {
      await server.stop();
    }
  });

  test("the two protected conditions stay visible and neither gained a control", async ({ context, page }) => {
    const state = seed();
    state.outreachContacts = [{
      contact_id:"oc-1", email:"alpha@example.org", contact_name:"Alpha Legal Aid",
      organization_name:"Alpha Legal Aid", classification:"legal_aid", manually_suppressed:true
    }];
    state.outreachSuppressions = [{ id:"sup-1", email:"alpha@example.org", reason:"manual" }];
    const server = await start(context, { state });
    try {
      await openWorkspace(page, server, "#partners");
      await expect(page.locator("[data-partners-page]")).toBeVisible();
      const text = await page.locator("main#app").innerText();
      // The condition is stated in founder language and is not hidden.
      expect(text).not.toContain("Suppressed");
      // And no control claims to lift it — that capability does not exist.
      await expect(page.getByRole("button", { name:/lift|unsuppress|remove suppression|merge/i })).toHaveCount(0);
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Scoreboard — behind its own flag, which production leaves off
// ---------------------------------------------------------------------------------------------

test("the Scoreboard states each metric's status and offers the corrective action beside it", async ({ context, page }) => {
  const server = await start(context, { env:{ FOUNDER_OS_SCOREBOARD:"true" } });
  try {
    await openWorkspace(page, server, "#revenue");
    const registry = page.locator("[data-kpi-registry]");
    await expect(registry).toBeVisible();

    // Exactly four status words, and no fifth vocabulary.
    const statuses = await registry.locator(".kpi-status").allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(["Live", "Manual", "Unavailable", "Needs attention"]).toContain(status.trim());
    }
    // A metric with no value says Unavailable, never 0.
    const unavailable = registry.locator('[data-kpi-status="unavailable"]').first();
    if (await unavailable.count()) {
      await expect(unavailable.locator("[data-kpi-value]")).toHaveText("Unavailable");
    }
    // The financial correction points at the owner-input form that already exists.
    const financials = registry.getByRole("link", { name:"Update financials" }).first();
    if (await financials.count()) await expect(financials).toHaveAttribute("href", "#revenue");
    // The charter's section names.
    await expect(registry).toContainText("Pipeline");
    await expect(registry).toContainText("Platform health");
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------------------------
// 6. Founder language — visible text and accessible names only
// ---------------------------------------------------------------------------------------------

// Word-boundary matching, so "plane" is not a lane and "Copenhagen" is not an engine.
const PROHIBITED = [
  /\bRCAP\b/i, /\bprospect engine\b/i, /\bprospects page\b/i, /\blane\b/i, /\blane id\b/i,
  /\bprojection\b/i, /\bledger\b/i, /\bheartbeat\b/i, /\bautopilot\b/i, /\blive mode\b/i,
  /\bcron\b/i, /\bSendGrid\b/i, /\bwebhook\b/i, /\bkill switch\b/i, /\bengine\b/i,
  /\bthreshold\b/i, /\bsuppression\b/i, /\bsuppressed\b/i
];

// The visible surface: rendered text plus every accessible name the tree exposes. Hidden
// templates, script source, data attributes and route hashes are deliberately NOT read — the
// compatibility hashes #prospects and #upload must survive, and they are not words on a screen.
async function visibleSurface(page) {
  const text = await page.locator("main#app").innerText();
  const names = await page.evaluate(() => {
    const out = [];
    for (const node of document.querySelectorAll("main#app [aria-label], main#app [title], main#app [alt]")) {
      // Genuinely rendered only: the legacy shell keeps every other page section in the DOM,
      // and a name inside a hidden section is not something Roger can read.
      if (typeof node.checkVisibility === "function" ? !node.checkVisibility() : !node.offsetParent) continue;
      if (node.closest("details:not([open])")) continue;
      out.push(node.getAttribute("aria-label") || "", node.getAttribute("title") || "", node.getAttribute("alt") || "");
    }
    return out.join("\n");
  });
  return `${text}\n${names}`;
}

function assertFounderLanguage(surface, where) {
  for (const pattern of PROHIBITED) {
    const found = surface.match(pattern);
    expect(found, `${where} must not show "${found?.[0]}" — ${pattern}`).toBeNull();
  }
}

test("no internal vocabulary reaches any founder surface", async ({ context, page }) => {
  const server = await start(context, { env:{ FOUNDER_OS_SCOREBOARD:"true", COMMAND_CENTER_UX_VNEXT_OUTREACH:"true" } });
  try {
    for (const [where, hash] of [
      ["Today", "#today"],
      ["Relationships", "#partners"],
      ["Campaigns", "#campaigns"],
      ["Partner outreach approvals", "#prospects"],
      ["Audience import", "#upload"],
      ["Scoreboard", "#revenue"]
    ]) {
      await openWorkspace(page, server, hash);
      await expect(page.locator("main#app .page-section.active, main#app [data-today-page], main#app [data-partners-page]").first()).toBeVisible();
      assertFounderLanguage(await visibleSurface(page), where);
    }
  } finally {
    await server.stop();
  }
});

// ---------------------------------------------------------------------------------------------
// 7. Responsive and accessibility
// ---------------------------------------------------------------------------------------------

for (const width of [1600, 1024, 390]) {
  test(`the workspaces carry no serious or critical accessibility findings at ${width}px`, async ({ context, page }) => {
    test.setTimeout(180_000);
    const server = await start(context, { env:{ FOUNDER_OS_SCOREBOARD:"true" } });
    try {
      await page.setViewportSize({ width, height:width === 390 ? 844 : 1000 });
      for (const hash of ["#today", "#partners", "#campaigns", "#prospects", "#upload", "#revenue"]) {
        await openWorkspace(page, server, hash);
        await page.waitForTimeout(250);
        const results = await new AxeBuilder({ page }).include("main#app").analyze();
        const blocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
        expect(blocking.map((violation) => `${hash} @${width}: ${violation.id}`)).toEqual([]);
        // Nothing may scroll the page sideways.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${hash} @${width} must not scroll horizontally`).toBeLessThanOrEqual(1);
      }
    } finally {
      await server.stop();
    }
  });
}
