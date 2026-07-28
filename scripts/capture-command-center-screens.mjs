#!/usr/bin/env node
// Implementation evidence for the Command Center concept-parity release.
//
// Drives the REAL server with the Founder OS flags on and captures every surface this release
// touches, at the three widths the acceptance suite tests. These are implementation screenshots:
// the concept PNGs in ../screens are a different artifact and may never stand in for them.
//
// Nothing here writes to the repository state — it starts a throwaway server on a temporary
// data file, like every browser test does.
//
//   node scripts/capture-command-center-screens.mjs
//
// Environment:
//   SHOT_OUT     output directory (default: the implementation-evidence folder beside the screens)
//   SHOT_ONLY    comma-separated screen ids, for iterating on one surface
//   SHOT_WIDTHS  comma-separated WIDTHxHEIGHT list
//   SHOT_FULL=1  full-page rather than viewport capture
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const OUT = process.env.SHOT_OUT || "docs/design/legalease-command-center-concept/implementation-evidence";
const ONLY = (process.env.SHOT_ONLY || "").split(",").filter(Boolean);
const WIDTHS = (process.env.SHOT_WIDTHS || "1600x1000").split(",").map((w) => {
  const [width, height] = w.split("x");
  return { label:w, width:Number(width), height:Number(height || 1000) };
});
const SCREENS = [
  { id:"01-today", hash:"#today", ready:"[data-today-page]" },
  { id:"03-relationships", hash:"#partners", ready:"[data-partners-page]" },
  { id:"05-campaigns", hash:"#campaigns", ready:"[data-founder-campaigns]" },
  { id:"05b-partner-outreach-approvals", hash:"#prospects", ready:"#prospects.page-section.active" },
  { id:"05c-import-audience", hash:"#upload", ready:"#upload.page-section.active" },
  { id:"07-scoreboard", hash:"#revenue", ready:"[data-kpi-registry]" },
  { id:"08-search", hash:"#partners", ready:"[data-partners-page]", open:"search" },
  { id:"09-create", hash:"#today", ready:"[data-today-page]", open:"create" },
  { id:"10-lee", hash:"#today", ready:"[data-today-page]", open:"lee" }
].filter((s) => !ONLY.length || ONLY.includes(s.id));

const seed = {
  posts:[
    { id:"post-1", status:"draft", targetChannels:["linkedin"] },
    { id:"post-2", status:"needs_review", targetChannels:["linkedin"] },
    { id:"post-3", status:"approved", targetChannels:["instagram"] }
  ],
  reactivationCampaign:{ campaignId:"mvp-reactivation", status:"active", liveMode:{ enabled:false, updatedBy:"owner", updatedAt:"2026-07-20T12:00:00.000Z" }, releasedWaves:[1] },
  autopilotSettings:{},
  reactivationContacts:[{ contact_id:"react-1", email:"one@example.org", wave:1, enrolled_at:"2026-07-20T12:00:00.000Z", sequence_status:"Enrolled" }],
  reactivationAttempts:[], reactivationEvents:[],
  prospectCandidates:[
    { id:"cand-1", review_state:"pending_review", organization_name:"Alpha Legal Aid", score:80, classification:"legal_aid", source:"irs_bmf", city:"Chicago", state:"IL" },
    { id:"cand-2", review_state:"pending_review", organization_name:"Beta Reentry", score:60, classification:"nonprofit", source:"irs_bmf", city:"Peoria", state:"IL" },
    { id:"cand-3", review_state:"approved", organization_name:"Gamma Clinic" }
  ],
  approvalQueue:[
    { id:"q1", type:"content_review", status:"queued_for_approval", title:"A post needs review" },
    { id:"q2", type:"outreach_message", status:"queued_for_approval", to:"a@example.org", title:"Outreach: step 1" }
  ],
  outreachContacts:[], outreachReplies:[], outreachSuppressions:[], outreachUnsubscribes:[],
  partners:[
    { id:"partner-1", name:"Alpha Legal Aid", stage:"qualified", owner:"Roger", nextAction:"", updatedAt:"2026-07-20T12:00:00.000Z" },
    { id:"partner-2", name:"Beta Reentry", stage:"proposal", owner:"Roger", nextAction:"Send the pilot agreement", updatedAt:"2026-07-24T12:00:00.000Z" }
  ],
  tasks:[{ id:"task-1", title:"Send the partner agreement", status:"open", important:true, priority:"urgent", dueDate:"2026-07-27", owner:"Roger", updatedAt:"2026-07-26T12:00:00.000Z" }],
  activityEvents:[], auditHistory:[], queueItems:[], alerts:[]
};

const server = await startPreviewServer({ seed, env:{
  COMMAND_CENTER_UX_VNEXT:"true", COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false",
  FOUNDER_OS_SHELL:"true", FOUNDER_OS_TODAY:"true", FOUNDER_OS_RELATIONSHIPS:"true",
  FOUNDER_OS_CAMPAIGNS:"true", FOUNDER_OS_SCOREBOARD:"true", FOUNDER_OS_LEE_PANEL:"true"
}});
const browser = await chromium.launch();
try {
  const auth = await loginOwner(server);
  const context = await browser.newContext();
  await context.addCookies(auth.cookie.split("; ").map((pair) => {
    const i = pair.indexOf("=");
    return { name:pair.slice(0, i), value:pair.slice(i + 1), url:server.baseUrl };
  }));
  await mkdir(OUT, { recursive:true });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  const written = [];
  for (const size of WIDTHS) {
    await page.setViewportSize({ width:size.width, height:size.height });
    for (const screen of SCREENS) {
      await page.goto(`${server.baseUrl}/${screen.hash}`);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForSelector(screen.ready, { state:"visible", timeout:20_000 });
      await page.waitForTimeout(700);
      if (screen.open === "search") { await page.click(".vnext-search-trigger"); await page.waitForTimeout(500); }
      if (screen.open === "create") { await page.click(".vnext-create-trigger"); await page.waitForTimeout(500); }
      if (screen.open === "lee") { const pill = page.locator(".lee-pill"); if (await pill.count() && await pill.first().isVisible()) await pill.first().click(); else { const t = page.locator(".vnext-navigation-trigger"); if (await t.isVisible()) await t.click(); await page.locator('[data-shell-action="open-lee"]').first().click(); } await page.waitForTimeout(900); }
      const file = path.join(OUT, `${screen.id}-${size.label}.png`);
      await page.screenshot({ path:file, fullPage:process.env.SHOT_FULL === "1" });
      written.push(file);
    }
  }
  console.log(written.join("\n"));
} finally { await browser.close(); await server.stop(); }
