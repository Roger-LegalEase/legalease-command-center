import { readFileSync } from "node:fs";

import { buildAuthorizedPartnersHome } from "./partners-home-service.mjs";
import { buildPartnersTrainScenario, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, partnersFixtureState } from "./fixtures/vnext-partners-train.mjs";
import { partnerRecordPageHtml } from "./ui/pages/partner-record.mjs";
import { partnersHomePageHtml } from "./ui/pages/partners-home.mjs";
import { buildPartnerRecordView } from "./ui/view-models/partner-record.mjs";

const css = ["../assets/ui/partners-home.css", "../assets/ui/partner-record.css", "../assets/ui/partner-outreach.css", "../assets/ui/partner-artifacts.css", "../assets/ui/partners-accessibility.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

export function visualFixture() {
  const initial = partnersFixtureState();
  const scenario = buildPartnersTrainScenario();
  return {
    initial,
    scenario,
    home:(view = "list", query = {}) => buildAuthorizedPartnersHome(initial, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, { view, limit:50, ...query }),
    empty:buildAuthorizedPartnersHome({ ...initial, partners:[] }, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, { view:"list", limit:50 }),
    filteredEmpty:buildAuthorizedPartnersHome(initial, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, { view:"list", search:"no synthetic match", limit:50 }),
    record:(tab = "overview", state = initial, id = "partner-community") => buildPartnerRecordView(state, PARTNERS_FIXTURE_ACTOR, id, PARTNERS_FIXTURE_NOW, { tab })
  };
}

export function visualDocument(content, { overlay = "", announcement = "" } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LegalEase Partners</title><style>
    *{box-sizing:border-box}html,body{margin:0;min-width:0;background:#f3f5f9;color:#18213d;font-family:Inter,Arial,sans-serif}body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:100vh}.visual-nav{padding:24px 18px;background:#081a4b;color:#fff}.visual-brand{display:flex;align-items:center;gap:9px;margin-bottom:32px;font-weight:900}.visual-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#e85b0c}.visual-nav nav{display:grid;gap:6px}.visual-nav a{padding:10px 12px;border-radius:9px;color:#bdc9ec;text-decoration:none}.visual-nav a[aria-current=page]{background:#fff2;color:#fff}.visual-main{min-width:0}.visual-topbar{display:flex;align-items:center;justify-content:space-between;min-height:64px;padding:0 28px;border-bottom:1px solid #dce2ee;background:#fff}.visual-topbar strong{color:#0f1f5c}.visual-content{padding:24px;min-width:0}.visual-announcement{padding:9px 14px;border-radius:10px;background:#e8f7f5;color:#075f59}.visual-overlay{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:#06143f99}.visual-dialog{width:min(620px,100%);padding:24px;border-radius:18px;background:#fff;box-shadow:0 24px 80px #06143f55}.visual-dialog .eyebrow{color:#008f86;font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.visual-dialog h2{color:#0f1f5c}.visual-dialog .safe-note{padding:12px;border-left:4px solid #e85b0c;background:#fff7ed}.visual-dialog button{min-height:42px;padding:0 16px;border:0;border-radius:10px;background:#0f1f5c;color:#fff;font-weight:800}${css}
    @media(max-width:700px){body{display:block}.visual-nav{display:none}.visual-topbar{padding:0 16px}.visual-content{padding:14px}}
  </style></head><body><aside class="visual-nav"><div class="visual-brand"><span class="visual-mark">L</span>LegalEase</div><nav aria-label="Primary"><a href="#today">Today</a><a href="#queue">Social</a><a href="#outreach">Outreach</a><a href="#partners" aria-current="page">Partners</a><a href="#files">Files</a><a href="#inbox">Inbox</a></nav></aside><main class="visual-main"><header class="visual-topbar"><strong>Command Center</strong>${announcement ? `<span class="visual-announcement" role="status">${announcement}</span>` : "<span>Synthetic review fixture</span>"}</header><div class="visual-content">${content}</div></main>${overlay ? `<div class="visual-overlay">${overlay}</div>` : ""}</body></html>`;
}

export function visualDialog(title, body, note = "No external action has occurred.") {
  return `<section class="visual-dialog" role="dialog" aria-modal="true" aria-labelledby="visual-dialog-title"><p class="eyebrow">Review required</p><h2 id="visual-dialog-title">${title}</h2><p>${body}</p><p class="safe-note">${note}</p><button type="button">Close</button></section>`;
}

export { partnersHomePageHtml, partnerRecordPageHtml };
