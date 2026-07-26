// Founder OS — Release 4 acceptance (docs/founder-os/08_DELIVERY_PLAN.md).
//
// Release 4 puts one lifecycle — Plan, Review, Run, Monitor, Stop — over the campaign lanes.
//
// Reactivation is live in production, so the acceptance test that matters most is a negative
// one: the surface must be incapable of changing the campaign. That is asserted here by driving
// the real page in Chromium and proving no request leaves it except a GET.
//
// Nothing here sends, publishes, releases an audience or flips a gate.
import { expect, test } from "@playwright/test";

import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

function founderCampaignsEnvironment(overrides = {}) {
  return {
    COMMAND_CENTER_UX_VNEXT:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false",
    FOUNDER_OS_SHELL:"true",
    FOUNDER_OS_CAMPAIGNS:"true",
    ...overrides
  };
}

async function startFounderCampaigns(context, { seed = {}, env = {} } = {}) {
  const server = await startPreviewServer({ seed, env:founderCampaignsEnvironment(env) });
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

const surface = (page) => page.locator("[data-founder-campaigns]");
const lane = (page, id) => page.locator(`[data-campaign-lane="${id}"]`);

function seedWithLiveCampaign() {
  return {
    posts:[
      { id:"post-1", status:"draft", targetChannels:["linkedin"] },
      { id:"post-2", status:"needs_review", targetChannels:["linkedin"] },
      { id:"post-3", status:"approved", targetChannels:["instagram"] }
    ],
    reactivationCampaign:{
      campaignId:"mvp-reactivation",
      status:"active",
      liveMode:{ enabled:true, updatedBy:"owner", updatedAt:"2026-07-20T12:00:00.000Z" },
      releasedWaves:[1, 2]
    },
    autopilotSettings:{ "reactivation-sequencer":{ enabled:true } },
    reactivationContacts:[
      { contact_id:"react-1", email:"one@example.org", wave:1, enrolled_at:"2026-07-20T12:00:00.000Z", sequence_status:"Enrolled" },
      { contact_id:"react-2", email:"two@example.org", wave:3, sequence_status:"Not Enrolled" }
    ],
    reactivationAttempts:[], reactivationEvents:[],
    prospectCandidates:[
      { id:"cand-1", review_state:"pending_review", organization_name:"Alpha Legal Aid" }
    ],
    outreachContacts:[], outreachReplies:[], outreachSuppressions:[], outreachUnsubscribes:[],
    approvalQueue:[], tasks:[], activityEvents:[], auditHistory:[], queueItems:[]
  };
}

test.describe("Founder OS Release 4 — Campaigns", () => {
  test("every lane shows the same five lifecycle steps in the same order", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, { seed:seedWithLiveCampaign() });
    try {
      await page.goto(`${server.baseUrl}/#campaigns`);
      await expect(surface(page)).toBeVisible();

      // Four lanes, the charter's four.
      await expect(page.locator("[data-campaign-lane]")).toHaveCount(4);
      for (const id of ["social", "reactivation", "partner_outreach", "press"]) {
        const stages = lane(page, id).locator("[data-campaign-stage]");
        await expect(stages).toHaveCount(5);
        const names = await stages.locator(".founder-campaign-stage-name").allTextContents();
        expect(names.map((name) => name.trim())).toEqual(["Plan", "Review", "Run", "Monitor", "Stop"]);
      }
    } finally {
      await server.stop();
    }
  });

  test("the surface cannot change the campaign — it issues only GET requests", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, { seed:seedWithLiveCampaign() });
    try {
      const writes = [];
      page.on("request", (request) => {
        if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
      });

      await page.goto(`${server.baseUrl}/#campaigns`);
      await expect(surface(page)).toBeVisible();
      // Click every stage action label on the page. None of them may cause a write.
      const actions = page.locator("[data-campaign-action]");
      for (let index = 0; index < await actions.count(); index += 1) {
        await actions.nth(index).click({ force:true }).catch(() => {});
      }
      await page.waitForTimeout(500);

      expect(writes, `the Campaigns surface must never issue a write; saw: ${writes.join(", ")}`).toEqual([]);
    } finally {
      await server.stop();
    }
  });

  test("Roger sees no engine vocabulary anywhere on the surface", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, { seed:seedWithLiveCampaign() });
    try {
      await page.goto(`${server.baseUrl}/#campaigns`);
      await expect(surface(page)).toBeVisible();
      const text = (await surface(page).innerText()).toLowerCase();
      for (const term of ["heartbeat", "autopilot", "live mode", "kill_switch", "threshold_tripped", "sendgrid", "webhook", "cron"]) {
        expect(text, `"${term}" must never appear on the founder surface`).not.toContain(term);
      }
    } finally {
      await server.stop();
    }
  });

  test("the Press lane says it is not built rather than showing an empty campaign", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, { seed:seedWithLiveCampaign() });
    try {
      await page.goto(`${server.baseUrl}/#campaigns`);
      await expect(surface(page)).toBeVisible();
      const press = lane(page, "press");
      await expect(press).toHaveAttribute("data-lane-built", "false");
      await expect(press).toContainText("not built yet");
      await expect(press).toContainText("nothing can be sent");
      // A not-built lane offers no actions at all.
      await expect(press.locator("[data-campaign-action]")).toHaveCount(0);
    } finally {
      await server.stop();
    }
  });

  test("the Social lane offers no publish affordance", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, { seed:seedWithLiveCampaign() });
    try {
      await page.goto(`${server.baseUrl}/#campaigns`);
      await expect(surface(page)).toBeVisible();
      const social = lane(page, "social");
      const text = (await social.innerText()).toLowerCase();
      expect(text).not.toContain("publish now");
      await expect(social).toContainText(/copy or export/i);
    } finally {
      await server.stop();
    }
  });

  test("with the flag off the Campaigns surface is absent and its route 404s", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, {
      seed:seedWithLiveCampaign(),
      env:{ FOUNDER_OS_CAMPAIGNS:"false" }
    });
    try {
      await page.goto(`${server.baseUrl}/#campaigns`);
      // The legacy Campaigns page still renders; the Founder OS surface does not exist.
      await expect(page.locator("main#app .page-section.active")).toBeVisible();
      await expect(surface(page)).toHaveCount(0);
      // And the read endpoint is not served at all — the rollback removes the surface, not just
      // its rendering.
      const response = await page.request.get(`${server.baseUrl}/api/ui/campaigns`);
      expect(response.status()).toBe(404);
      // The lazy runtime file is not served either.
      const runtime = await page.request.get(`${server.baseUrl}/assets/ui/runtime/founder-campaigns.js`);
      expect(runtime.status()).toBe(404);
    } finally {
      await server.stop();
    }
  });

  test("the read endpoint refuses every verb except GET", async ({ context, page }) => {
    const server = await startFounderCampaigns(context, { seed:seedWithLiveCampaign() });
    try {
      const get = await page.request.get(`${server.baseUrl}/api/ui/campaigns`);
      expect(get.status()).toBe(200);
      const body = await get.json();
      expect(body.ok).toBe(true);
      expect(body.safety).toMatchObject({ mutations:0, externalActions:0, publishAffordances:0 });

      for (const verb of ["post", "put", "patch", "delete"]) {
        const response = await page.request[verb](`${server.baseUrl}/api/ui/campaigns`, { data:{} });
        expect(response.status(), `${verb.toUpperCase()} must not be accepted`).not.toBe(200);
      }
    } finally {
      await server.stop();
    }
  });
});
