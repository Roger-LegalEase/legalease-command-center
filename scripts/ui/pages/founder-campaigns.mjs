// Founder OS Release 4 — the Campaigns lifecycle surface.
//
// Served as a LAZY RUNTIME FILE, not inline, so it costs the initial client-JavaScript budget
// nothing at all. That is the same mechanism Release 2 used for the action panel.
//
// It renders what /api/ui/campaigns returns and does nothing else. Every control is either a
// link to the surface that already owns that action, or the one button that opens the existing
// sending controls. Nothing here performs a mutation or issues a POST, because Release 4
// changes the interface over a live campaign and never the campaign.
//
// OWNERSHIP. With FOUNDER_OS_CAMPAIGNS on, this surface OWNS the Campaigns page. It used to
// prepend itself above the legacy page, so Roger read "Campaign running." one screen above
// "Running — heartbeat is sending eligible reactivation emails", with two campaign summaries,
// two vocabularies and two sets of controls on one screen. It now replaces that content and
// carries exactly one legacy node forward: the reactivation control surface, which is the only
// place the Run, Stop, Pause, Preview and wave-release controls exist. It is kept out of sight
// behind a founder-labelled disclosure so the workspace reads in one voice, and kept in the DOM
// so the existing controls keep working rather than being rebuilt here.

import { escapeAttribute, escapeHtml } from "../html.mjs";
import { FOUNDER_CAMPAIGNS_ENDPOINT } from "../../founder-campaigns-api.mjs";

export const FOUNDER_CAMPAIGNS_STYLESHEET_PATH = "assets/ui/founder-campaigns.css";

// The legacy node this surface carries forward, and the disclosure it lives behind.
export const FOUNDER_CAMPAIGNS_PRESERVED_SELECTOR = "[data-reactivation-control-surface]";

// Every client operation a stage may drive. There is exactly one, and it opens the existing
// controls rather than calling anything: this surface has no write path, and a button that
// could stop or start a live campaign from here would be one. A control whose target is not
// on the page is NOT drawn — an action that cannot run must not look like one that can.
const FOUNDER_CAMPAIGN_CONTROLS = Object.freeze({ "reactivation-controls":"" });

const clean = (value = "") => String(value ?? "").trim();

// One visual treatment per stage state. "not_built" and "unavailable" are deliberately distinct
// so an unfinished lane never looks like a broken one.
function stageStateLabel(state) {
  return {
    ready:"Ready",
    attention:"Needs you",
    blocked:"Stopped for safety",
    running:"Running",
    stopped:"Stopped",
    unavailable:"Could not be read",
    not_built:"Not built yet"
  }[state] || "Unknown";
}

// A hash is drawn as a link only when the route resolver says that exact hash is where it
// goes. Anything else renders as no link at all, so a bad or stale destination degrades to
// plain text rather than to a control that lands somewhere unexpected.
function safeCampaignHref(href) {
  const value = clean(href);
  if (!value.startsWith("#")) return "";
  const resolver = typeof window === "undefined" ? null : window.__LE_VNEXT_ROUTE_COMPATIBILITY;
  if (!resolver) return /^#[a-z0-9?=&:/%_-]+$/i.test(value) ? value : "";
  const resolved = resolver.resolve(value);
  return resolved && ["page", "object"].includes(resolved.kind) && resolved.safeHash === value ? value : "";
}

function controlAvailable(name) {
  if (!Object.prototype.hasOwnProperty.call(FOUNDER_CAMPAIGN_CONTROLS, clean(name))) return false;
  const global = FOUNDER_CAMPAIGN_CONTROLS[clean(name)];
  if (!global) return typeof document !== "undefined" && Boolean(document.querySelector("[data-reactivation-control-surface]"));
  return typeof window !== "undefined" && typeof window[global] === "function";
}

// The one control a stage offers, or nothing. A stage with no runnable action renders its
// status and its explanation and stops there — never a control that does nothing.
function actionHtml(stage) {
  const action = stage.action;
  if (!action || !action.label) return "";
  const described = `${escapeHtml(action.label)}`;
  const name = `${escapeAttribute(action.label)} — ${escapeAttribute(stage.label)}`;
  if (action.kind === "link") {
    const href = safeCampaignHref(action.href);
    if (!href) return "";
    return `<p class="founder-campaign-stage-action"><a class="founder-campaign-action" href="${escapeAttribute(href)}" aria-label="${name}" data-campaign-action="${escapeAttribute(stage.id)}">${described}</a></p>`;
  }
  if (action.kind === "control" && controlAvailable(action.control)) {
    return `<p class="founder-campaign-stage-action"><button class="founder-campaign-action" type="button" aria-label="${name}" data-campaign-action="${escapeAttribute(stage.id)}" data-campaign-control="${escapeAttribute(action.control)}">${described}</button></p>`;
  }
  return "";
}

function stageHtml(stage) {
  // Proposed press campaigns are clickable: each link opens the campaign detail page where
  // the drafted pitch (Messages), the assigned journalists (Audience) and the one run
  // approval live. A running campaign links the same way. Links only — this surface still
  // performs no mutation and issues no POST.
  const proposed = Array.isArray(stage.detail?.proposedCampaigns) ? stage.detail.proposedCampaigns : [];
  const running = stage.detail?.runningCampaign;
  const campaignLinks = [...proposed, ...(running ? [running] : [])]
    .filter((entry) => entry && safeCampaignHref(entry.href))
    .map((entry) => `<li><a href="${escapeAttribute(safeCampaignHref(entry.href))}">${escapeHtml(entry.label || entry.angleId || "Campaign")}</a>${Number.isFinite(entry.assigned) ? ` — ${escapeHtml(String(entry.assigned))} assigned` : ""}</li>`)
    .join("");
  return `<li class="founder-campaign-stage" data-campaign-stage="${escapeAttribute(stage.id)}" data-stage-state="${escapeAttribute(stage.state)}">
    <p class="founder-campaign-stage-name">${escapeHtml(stage.label)}</p>
    <p class="founder-campaign-stage-state" data-campaign-status="${escapeAttribute(stage.state)}">${escapeHtml(stageStateLabel(stage.state))}</p>
    <p class="founder-campaign-stage-summary">${escapeHtml(stage.summary || "")}</p>
    ${stage.blockedReason ? `<p class="founder-campaign-stage-reason" role="note">${escapeHtml(stage.blockedReason)}</p>` : ""}
    ${campaignLinks ? `<ul class="founder-campaign-stage-campaigns" aria-label="Campaigns">${campaignLinks}</ul>` : ""}
    ${actionHtml(stage)}
  </li>`;
}

function laneHtml(lane) {
  return `<section class="founder-campaign-lane" data-campaign-lane="${escapeAttribute(lane.id)}" data-lane-built="${lane.built ? "true" : "false"}" aria-labelledby="campaign-lane-${escapeAttribute(lane.id)}">
    <header>
      <h3 id="campaign-lane-${escapeAttribute(lane.id)}">${escapeHtml(lane.label)}</h3>
      ${lane.unavailableReason ? `<p class="founder-campaign-lane-note" role="note">${escapeHtml(lane.unavailableReason)}</p>` : ""}
    </header>
    ${lane.exceptions.length ? `<ul class="founder-campaign-exceptions" aria-label="Needs attention">${lane.exceptions.map((exception) => `<li data-campaign-exception="${escapeAttribute(exception.id)}"><strong>${escapeHtml(exception.summary)}</strong>${exception.detail ? ` ${escapeHtml(exception.detail)}` : ""}</li>`).join("")}</ul>` : ""}
    <ol class="founder-campaign-stages">${lane.stages.map(stageHtml).join("")}</ol>
  </section>`;
}

function setupHtml(payload) {
  const entries = (Array.isArray(payload.setup) ? payload.setup : [])
    .map((entry) => ({ ...entry, href:safeCampaignHref(entry.href) }))
    .filter((entry) => entry.href);
  if (!entries.length) return "";
  return `<section class="founder-campaign-setup" data-campaign-setup aria-labelledby="founder-campaigns-setup-title">
    <h3 id="founder-campaigns-setup-title">Plan and setup</h3>
    <p>Bring a list of people into the Command Center before you plan a campaign for them. You see a preview and confirm before anything is saved, and nothing is contacted by importing.</p>
    <p class="founder-campaign-setup-actions">${entries.map((entry) => `<a class="founder-campaign-action" href="${escapeAttribute(entry.href)}" data-campaign-setup-action="import-audience">${escapeHtml(entry.label)}</a>`).join("")}</p>
  </section>`;
}

export function founderCampaignsPageHtml(payload = null) {
  if (!payload) {
    return `<section class="founder-campaigns" data-founder-campaigns aria-busy="true"><p role="status">Loading campaigns</p><div data-founder-campaigns-preserved></div></section>`;
  }
  if (payload.ok !== true) {
    return `<section class="founder-campaigns" data-founder-campaigns><div role="alert"><h2>Campaigns are unavailable</h2><p>${escapeHtml(clean(payload.message) || "Nothing was changed.")}</p></div><div data-founder-campaigns-preserved></div></section>`;
  }
  return `<section class="founder-campaigns" data-founder-campaigns aria-labelledby="founder-campaigns-title" aria-busy="false">
    <header>
      <h2 id="founder-campaigns-title">Campaigns</h2>
      <p>Every campaign runs the same five steps: ${payload.lifecycle.map((entry) => escapeHtml(entry.label)).join(" → ")}.</p>
    </header>
    ${setupHtml(payload)}
    <div class="founder-campaign-lanes">${payload.lanes.map(laneHtml).join("")}</div>
    <div data-founder-campaigns-preserved></div>
  </section>`;
}

export function founderCampaignsBrowserSource() {
  const endpoint = JSON.stringify(FOUNDER_CAMPAIGNS_ENDPOINT);
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const FOUNDER_CAMPAIGN_CONTROLS=${JSON.stringify(FOUNDER_CAMPAIGN_CONTROLS)};`,
    `const stageStateLabel=${stageStateLabel.toString()};`,
    `const safeCampaignHref=${safeCampaignHref.toString()};`,
    `const controlAvailable=${controlAvailable.toString()};`,
    `const actionHtml=${actionHtml.toString()};`,
    `const stageHtml=${stageHtml.toString()};`,
    `const laneHtml=${laneHtml.toString()};`,
    `const setupHtml=${setupHtml.toString()};`,
    `const founderCampaignsPageHtml=${founderCampaignsPageHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    const endpoint=${endpoint}; ${renderer}
    // Read-only surface: one GET, no POST anywhere in this runtime.
    const metrics={requests:0,mutations:0,externalActions:0}; window.__LE_FOUNDER_CAMPAIGNS_METRICS=metrics;
    let active=null; let lastHtml="";
    function host(){return document.querySelector("main#app #campaigns.page-section.active, main#app #outreach.page-section.active");}
    function onRoute(){const r=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");return r?.kind==="page"&&["campaigns","outreach"].includes(r.canonicalRoute);}
    // The one legacy node carried forward: the Run / Stop / Pause / Preview / wave-release
    // controls. Detached before the section is cleared so it keeps whatever it has loaded.
    function detachPreserved(target){const node=target.querySelector("[data-reactivation-control-surface]");if(node)node.remove();return node;}
    function attachPreserved(target,node){if(!node)return;const slot=target.querySelector("[data-founder-campaigns-preserved]");if(!slot){target.append(node);return;}
      // Its own heading and standfirst are the legacy page's voice; the disclosure below
      // supplies the founder one, so they are removed rather than shown twice.
      node.querySelector(".growth-card-head")?.remove();
      const details=document.createElement("details");details.className="founder-campaign-controls";details.setAttribute("data-campaign-controls","");
      const summary=document.createElement("summary");summary.textContent="Detailed sending controls";details.append(summary,node);
      const note=document.createElement("p");note.className="founder-campaign-controls-note";note.textContent="Run, stop, pause and audience release for the reactivation campaign. Opening this changes nothing.";
      slot.replaceChildren(note,details);}
    function mount(html){const target=host();if(!target)return;const preserved=detachPreserved(target);target.innerHTML=html;target.dataset.founderCampaignsOwned="true";attachPreserved(target,preserved);bind(target);}
    function bind(target){const root=target.querySelector("[data-founder-campaigns]");if(!root||root.dataset.bound==="true")return;root.dataset.bound="true";
      root.addEventListener("click",event=>{const button=event.target.closest?.("[data-campaign-control]");if(!button)return;
        const name=button.getAttribute("data-campaign-control");const global=FOUNDER_CAMPAIGN_CONTROLS[name];
        const details=root.querySelector("[data-campaign-controls]");if(details)details.open=true;
        if(global&&typeof window[global]==="function")window[global]();});}
    function ownedAndCurrent(){const target=host();return Boolean(target&&target.dataset.founderCampaignsOwned==="true"&&target.querySelector("[data-founder-campaigns]"));}
    async function load(){if(!onRoute()||active)return null;active=true;metrics.requests+=1;if(!ownedAndCurrent())mount(lastHtml||founderCampaignsPageHtml());
      try{const response=await fetch(endpoint,{credentials:"same-origin",headers:{accept:"application/json"}});
        const body=await response.json().catch(()=>({}));
        if(!onRoute())return null;
        lastHtml=founderCampaignsPageHtml(response.ok&&body.ok===true?body:{ok:false,message:body.message||"Campaigns could not load. Nothing was changed."});
        mount(lastHtml);
        return body;}
      catch{if(onRoute()){lastHtml=founderCampaignsPageHtml({ok:false,message:"Campaigns could not load. Nothing was changed."});mount(lastHtml);}return null;}
      finally{active=null;}}
    function routeChanged(){if(onRoute())void load();}
    window.addEventListener("hashchange",routeChanged);
    // The legacy renderer and, when its flag is on, the vNext Outreach page both rewrite this
    // section. Re-taking ownership on mutation is what stops either of them re-appearing
    // underneath the founder workspace.
    const appRoot=document.querySelector("main#app");
    if(appRoot)new MutationObserver(()=>{if(onRoute()&&!ownedAndCurrent()&&lastHtml)mount(lastHtml);}).observe(appRoot,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    window.__LE_FOUNDER_CAMPAIGNS=Object.freeze({load:()=>load(),activate:routeChanged});
    routeChanged();
  })();`;
}
