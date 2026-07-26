// Founder OS Release 4 — the Campaigns lifecycle surface.
//
// Served as a LAZY RUNTIME FILE, not inline, so it costs the initial client-JavaScript budget
// nothing at all. That is the same mechanism Release 2 used for the action panel.
//
// It renders what /api/ui/campaigns returns and does nothing else. Every control is a link to
// the surface that already owns that action; this file performs no mutation and issues no POST,
// because Release 4 changes the interface over a live campaign and never the campaign.

import { escapeAttribute, escapeHtml } from "../html.mjs";
import { FOUNDER_CAMPAIGNS_ENDPOINT } from "../../founder-campaigns-api.mjs";

export const FOUNDER_CAMPAIGNS_STYLESHEET_PATH = "assets/ui/founder-campaigns.css";

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

function stageHtml(stage) {
  const action = stage.action;
  return `<li class="founder-campaign-stage" data-campaign-stage="${escapeAttribute(stage.id)}" data-stage-state="${escapeAttribute(stage.state)}">
    <p class="founder-campaign-stage-name">${escapeHtml(stage.label)}</p>
    <p class="founder-campaign-stage-state">${escapeHtml(stageStateLabel(stage.state))}</p>
    <p class="founder-campaign-stage-summary">${escapeHtml(stage.summary || "")}</p>
    ${stage.blockedReason ? `<p class="founder-campaign-stage-reason" role="note">${escapeHtml(stage.blockedReason)}</p>` : ""}
    ${action ? `<p class="founder-campaign-stage-action"><span data-campaign-action="${escapeAttribute(stage.id)}">${escapeHtml(action.label)}</span></p>` : ""}
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

export function founderCampaignsPageHtml(payload = null) {
  if (!payload) {
    return `<section class="founder-campaigns" data-founder-campaigns aria-busy="true"><p role="status">Loading campaigns</p></section>`;
  }
  if (payload.ok !== true) {
    return `<section class="founder-campaigns" data-founder-campaigns><div role="alert"><h2>Campaigns are unavailable</h2><p>${escapeHtml(clean(payload.message) || "Nothing was changed.")}</p></div></section>`;
  }
  return `<section class="founder-campaigns" data-founder-campaigns aria-labelledby="founder-campaigns-title" aria-busy="false">
    <header>
      <h2 id="founder-campaigns-title">Campaigns</h2>
      <p>Every campaign runs the same five steps: ${payload.lifecycle.map((entry) => escapeHtml(entry.label)).join(" → ")}.</p>
    </header>
    <div class="founder-campaign-lanes">${payload.lanes.map(laneHtml).join("")}</div>
  </section>`;
}

export function founderCampaignsBrowserSource() {
  const endpoint = JSON.stringify(FOUNDER_CAMPAIGNS_ENDPOINT);
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const stageStateLabel=${stageStateLabel.toString()};`,
    `const stageHtml=${stageHtml.toString()};`,
    `const laneHtml=${laneHtml.toString()};`,
    `const founderCampaignsPageHtml=${founderCampaignsPageHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    const endpoint=${endpoint}; ${renderer}
    // Read-only surface: one GET, no POST anywhere in this runtime.
    const metrics={requests:0,mutations:0,externalActions:0}; window.__LE_FOUNDER_CAMPAIGNS_METRICS=metrics;
    let active=null;
    function host(){return document.querySelector("main#app #campaigns.page-section.active, main#app #outreach.page-section.active");}
    function onRoute(){const r=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");return r?.kind==="page"&&["campaigns","outreach"].includes(r.canonicalRoute);}
    function mount(html){const target=host();if(!target)return;let slot=target.querySelector("[data-founder-campaigns-slot]");if(!slot){slot=document.createElement("div");slot.setAttribute("data-founder-campaigns-slot","");target.prepend(slot);}slot.innerHTML=html;}
    async function load(){if(!onRoute()||active)return null;active=true;metrics.requests+=1;mount(founderCampaignsPageHtml());
      try{const response=await fetch(endpoint,{credentials:"same-origin",headers:{accept:"application/json"}});
        const body=await response.json().catch(()=>({}));
        if(!onRoute())return null;
        mount(founderCampaignsPageHtml(response.ok&&body.ok===true?body:{ok:false,message:body.message||"Campaigns could not load. Nothing was changed."}));
        return body;}
      catch{if(onRoute())mount(founderCampaignsPageHtml({ok:false,message:"Campaigns could not load. Nothing was changed."}));return null;}
      finally{active=null;}}
    function routeChanged(){if(onRoute())void load();}
    window.addEventListener("hashchange",routeChanged);
    window.__LE_FOUNDER_CAMPAIGNS=Object.freeze({load:()=>load(),activate:routeChanged});
    routeChanged();
  })();`;
}
