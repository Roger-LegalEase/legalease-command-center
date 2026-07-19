import { GLOBAL_CREATE_ENDPOINTS } from "../../global-create-service.mjs";
import { PARTNERS_HOME_ENDPOINT } from "../../partners-home-service.mjs";
import { escapeAttribute, escapeHtml } from "../html.mjs";

const clean = (value = "") => String(value ?? "").trim();

function value(value, fallback = "Unavailable") { return escapeHtml(clean(value) || fallback); }
function date(value) { return value ? escapeHtml(new Intl.DateTimeFormat("en-US", { timeZone:"UTC", month:"short", day:"numeric", year:"numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`))) : "Unavailable"; }

function filters(payload) {
  const option = (item) => `<option value="${escapeAttribute(item.key)}">${escapeHtml(item.label)} (${item.count})</option>`;
  return `<form class="partners-filters" data-partners-filters aria-label="Partner filters">
    <label>Search <input type="search" name="search" autocomplete="off" placeholder="Partner, owner, or next action"></label>
    <label>Stage <select name="stage"><option value="">All stages</option>${payload.filters.stages.map(option).join("")}</select></label>
    <label>Owner <select name="owner"><option value="">All owners</option>${payload.filters.owners.map(option).join("")}</select></label>
    <label>Health <select name="health"><option value="">All health</option>${payload.filters.health.map(option).join("")}</select></label>
    <button type="button" data-partners-clear>Clear filters</button>
  </form>`;
}

function row(item) {
  return `<article class="partner-row${item.dueState.overdue ? " is-overdue" : ""}" data-partner-row>
    <div class="partner-identity"><a href="${escapeAttribute(item.partner.href)}" aria-label="Open Partner: ${escapeAttribute(item.partner.name)}"><strong>${escapeHtml(item.partner.name)}</strong></a><span class="stage stage-${escapeAttribute(item.stage.key)}">${escapeHtml(item.stage.label)}</span></div>
    <dl><div><dt>Health</dt><dd>${value(item.health.label)}</dd></div><div><dt>Owner</dt><dd>${value(item.owner)}</dd></div><div><dt>Next action</dt><dd>${value(item.nextAction)}</dd></div><div><dt>Due date</dt><dd>${date(item.dueAt)}${item.dueState.overdue ? '<span class="overdue-label">Overdue</span>' : ""}</dd></div><div><dt>Last contact</dt><dd>${date(item.lastContact.occurredAt)}</dd></div><div><dt>Program or opportunity</dt><dd>${value(item.programOrOpportunity)}</dd></div></dl>
  </article>`;
}

function empty(payload) {
  const filtered = payload.availability.state === "filtered_empty";
  return `<section class="partners-empty" role="status"><p class="eyebrow">${filtered ? "No matches" : "Start here"}</p><h2>${filtered ? "No Partners match these filters" : "No Partners yet"}</h2><p>${filtered ? "Clear a filter or try a broader search." : "Add a Partner to begin tracking the relationship and next action."}</p></section>`;
}

export function partnersHomePageHtml(payload = null) {
  if (!payload) return `<section class="partners-page" data-partners-page aria-busy="true"><div class="partners-loading" role="status"><span aria-hidden="true"></span><p>Loading Partners</p></div></section>`;
  if (payload.available !== true) return `<section class="partners-page" data-partners-page><div class="partners-state" role="alert"><p class="eyebrow">Unavailable</p><h1>Partners are unavailable</h1><p>Partner data could not be read. No changes were made.</p></div></section>`;
  const tabs = payload.views.map((view) => `<a href="#partners?view=${escapeAttribute(view.key)}"${payload.selectedView === view.key ? ' aria-current="page"' : ""}>${escapeHtml(view.label)}</a>`).join("");
  const content = payload.items.length ? payload.selectedView === "pipeline"
    ? payload.pipeline.map((group) => `<section class="pipeline-column"><header><h2>${escapeHtml(group.label)}</h2><span>${group.items.length}</span></header>${group.items.map(row).join("")}</section>`).join("")
    : `<div class="partners-list">${payload.items.map(row).join("")}</div>` : empty(payload);
  return `<section class="partners-page" data-partners-page aria-labelledby="partners-title" aria-busy="false">
    <header class="partners-header"><div><p class="eyebrow">Relationships</p><h1 id="partners-title">Partners</h1><p>Keep every relationship, next action, and active program in one truthful view.</p></div><button class="partners-primary" type="button" data-partners-add data-create-endpoint="${GLOBAL_CREATE_ENDPOINTS.partner}">Add Partner</button></header>
    <nav class="partners-tabs" aria-label="Partner views">${tabs}</nav>
    <dl class="partners-summary" aria-label="Partner summary"><div><dt>Partners</dt><dd>${payload.summary.authorizedPartners}</dd></div><div><dt>Needs follow-up</dt><dd>${payload.summary.overdueFollowUps}</dd></div><div><dt>Active programs</dt><dd>${payload.summary.activePrograms}</dd></div></dl>
    ${filters(payload)}<div class="partners-announcement" role="status" aria-live="polite">Showing ${payload.summary.matchingPartners} Partner${payload.summary.matchingPartners === 1 ? "" : "s"}.</div>
    <div class="${payload.selectedView === "pipeline" ? "partners-pipeline" : "partners-content"}">${content}</div>
    ${payload.pagination.nextCursor ? '<button class="partners-load-more" type="button" data-partners-load-more>Load more</button>' : ""}
  </section>`;
}

export function partnersHomeBrowserSource() {
  const endpoint = JSON.stringify(PARTNERS_HOME_ENDPOINT);
  return `(() => { "use strict";
    const endpoint=${endpoint}; let active=null; let requestCount=0;
    const metrics={ requests:0, maximumActiveRequests:0, fullStateReads:0, mutations:0, externalActions:0 }; window.__LE_PARTNERS_HOME_METRICS=metrics;
    function params(){ const query=new URLSearchParams(String(location.hash).split("?")[1]||""); if(!query.get("view")) query.set("view","list"); query.set("limit","24"); return query; }
    async function load(){ if(active) return active; requestCount+=1; metrics.maximumActiveRequests=Math.max(metrics.maximumActiveRequests,requestCount); metrics.requests+=1; active=fetch(endpoint+"?"+params().toString(),{headers:{Accept:"application/json"}}).then(async response=>{ if(!response.ok) throw new Error("Partners could not load"); const payload=await response.json(); document.dispatchEvent(new CustomEvent("vnext:partners-payload",{detail:payload})); return payload; }).finally(()=>{requestCount-=1;active=null;}); return active; }
    document.addEventListener("click",event=>{ const add=event.target.closest("[data-partners-add]"); if(add){ window.__LE_GLOBAL_CREATE?.openWorkflow("partner",{returnTarget:add}); } });
    window.addEventListener("hashchange",()=>{ if(location.hash.startsWith("#partners")) load(); });
    window.__LE_PARTNERS_HOME=Object.freeze({load}); if(location.hash.startsWith("#partners")) load();
  })();`;
}
