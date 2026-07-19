import { GLOBAL_CREATE_ENDPOINTS } from "../../global-create-service.mjs";
import { PARTNERS_HOME_ENDPOINT } from "../../partners-home-service.mjs";
import { escapeAttribute, escapeHtml } from "../html.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const PARTNERS_HOME_STYLESHEET_PATH = "assets/ui/partners-home.css";
export const PARTNERS_ACCESSIBILITY_STYLESHEET_PATH = "assets/ui/partners-accessibility.css";

function value(value, fallback = "Unavailable") { return escapeHtml(clean(value) || fallback); }
function date(value) { return value ? escapeHtml(new Intl.DateTimeFormat("en-US", { timeZone:"UTC", month:"short", day:"numeric", year:"numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`))) : "Unavailable"; }

function filters(payload) {
  const selected = (key, value) => clean(payload.query?.[key]) === clean(value) ? " selected" : "";
  const option = (key, item) => `<option value="${escapeAttribute(item.key)}"${selected(key, item.key)}>${escapeHtml(item.label)} (${item.count})</option>`;
  return `<form class="partners-filters" data-partners-filters aria-label="Partner filters">
    <label>Search <input type="search" name="search" value="${escapeAttribute(payload.query?.search || "")}" autocomplete="off" placeholder="Partner, owner, or next action"></label>
    <label>Stage <select name="stage"><option value="">All stages</option>${payload.filters.stages.map((item) => option("stage", item)).join("")}</select></label>
    <label>Owner <select name="owner"><option value="">All owners</option>${payload.filters.owners.map((item) => option("owner", item)).join("")}</select></label>
    <label>Health <select name="health"><option value="">All health</option>${payload.filters.health.map((item) => option("health", item)).join("")}</select></label>
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
  const loadingHtml = JSON.stringify(partnersHomePageHtml()).replaceAll("<", "\\u003c");
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const value=${value.toString()};`,
    `const date=${date.toString()};`,
    `const filters=${filters.toString()};`,
    `const row=${row.toString()};`,
    `const empty=${empty.toString()};`,
    `const GLOBAL_CREATE_ENDPOINTS={partner:"/api/ui/create/partner"};`,
    `const partnersHomePageHtml=${partnersHomePageHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    const endpoint=${endpoint}; const loadingHtml=${loadingHtml}; ${renderer}
    const metrics={ requests:0, activeRequests:0, maximumActiveRequests:0, staleRequestsAborted:0, fullStateReads:0, mutations:0, externalActions:0, providerCalls:0 }; window.__LE_PARTNERS_HOME_METRICS=metrics;
    let active=null; let sequence=0; let payload=null; let sessionEnded=false;
    function app(){ return document.querySelector("main#app #partners.page-section.active"); }
    function resolution(){ return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today"); }
    function onRoute(){ const route=resolution(); return route?.kind==="page"&&route.canonicalRoute==="partners"; }
    function routeQuery(){ const query=new URLSearchParams(String(location.hash||"").split("?")[1]||""); if(!query.get("view")) query.set("view","list"); query.set("limit","24"); return query; }
    function routeHash(next={}){ const current=routeQuery(); current.delete("limit"); for(const [key,value] of Object.entries(next)){ if(value) current.set(key,value); else current.delete(key); } if(!current.get("view")) current.set("view","list"); return "#partners?"+current.toString(); }
    function navigate(next){ const target=routeHash(next); if(location.hash===target) load({force:true}); else location.hash=target.slice(1); }
    function ensureLoading(){ const target=app(); if(!target||sessionEnded) return false; if(!target.querySelector("[data-partners-page]")) target.innerHTML=loadingHtml; return true; }
    function renderState(kind,title,message){ const target=app(); if(!target) return; const section=document.createElement("section"); section.className="partners-page"; section.dataset.partnersPage=""; const state=document.createElement("div"); state.className="partners-state"; state.setAttribute("role",kind==="error"||kind==="unauthorized"?"alert":"status"); const heading=document.createElement("h1"); heading.textContent=title; if(kind==="error"||kind==="unauthorized") heading.tabIndex=-1; const copy=document.createElement("p"); copy.textContent=message; state.append(heading,copy); if(kind==="error"){ const retry=document.createElement("button"); retry.type="button"; retry.textContent="Try again"; retry.addEventListener("click",()=>load({force:true})); state.append(retry); } section.append(state); target.replaceChildren(section); if(heading.tabIndex===-1) setTimeout(()=>heading.focus(),0); }
    function bind(){ const root=app()?.querySelector("[data-partners-page]"); if(!root||root.dataset.bound==="true") return; root.dataset.bound="true"; root.querySelector("[data-partners-add]")?.addEventListener("click",event=>window.__LE_GLOBAL_CREATE?.openWorkflow("partner",{returnTarget:event.currentTarget})); const form=root.querySelector("[data-partners-filters]"); form?.addEventListener("change",event=>{ const control=event.target.closest("select"); if(control) navigate({[control.name]:control.value,cursor:""}); }); form?.addEventListener("submit",event=>{ event.preventDefault(); const data=new FormData(form); navigate({search:String(data.get("search")||"").trim(),cursor:""}); }); form?.querySelector("input[name=search]")?.addEventListener("search",event=>navigate({search:event.currentTarget.value.trim(),cursor:""})); root.querySelector("[data-partners-clear]")?.addEventListener("click",()=>navigate({search:"",stage:"",owner:"",health:"",cursor:""})); root.querySelector("[data-partners-load-more]")?.addEventListener("click",()=>{ if(payload?.pagination?.nextCursor) navigate({cursor:payload.pagination.nextCursor}); }); }
    function render(next){ payload=next; const target=app(); if(!target) return; target.innerHTML=partnersHomePageHtml(next); bind(); }
    async function load({force=false}={}){ if(!onRoute()||sessionEnded||!ensureLoading()) return null; const query=routeQuery().toString(); if(active){ if(active.query===query&&!force) return active.promise; active.controller.abort(); metrics.staleRequestsAborted+=1; }
      const controller=new AbortController(); const currentSequence=++sequence; metrics.requests+=1; metrics.activeRequests+=1; metrics.maximumActiveRequests=Math.max(metrics.maximumActiveRequests,metrics.activeRequests);
      const promise=fetch(endpoint+"?"+query,{credentials:"same-origin",headers:{accept:"application/json"},signal:controller.signal}).then(async response=>{ const body=await response.json().catch(()=>({})); if(response.status===401){ if(currentSequence===sequence) renderState("session","Session expired","Sign in again. No changes were made."); active=null; sessionEnded=true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; } if(response.status===403){ if(currentSequence===sequence) renderState("unauthorized","Partners need additional access","No protected Partner details were loaded."); return null; } if(!response.ok||body.ok!==true) throw new Error("Partners could not load"); if(currentSequence===sequence&&onRoute()) render(body); return body; }).catch(error=>{ if(error.name==="AbortError") return null; if(currentSequence===sequence&&onRoute()) renderState("error","Partners could not load","No records were changed. Try again."); return null; }).finally(()=>{ metrics.activeRequests-=1; if(active?.controller===controller) active=null; }); active={query,controller,promise}; return promise; }
    function routeChanged(){ if(!onRoute()){ sequence+=1; payload=null; return; } payload=null; ensureLoading(); load(); }
    window.addEventListener("hashchange",routeChanged); document.addEventListener("vnext:session-expired",()=>{sessionEnded=true;sequence+=1;active=null;payload=null;}); const observed=document.querySelector("main#app"); if(observed)new MutationObserver(()=>{if(onRoute()&&!app()?.querySelector("[data-partners-page]"))routeChanged();}).observe(observed,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]}); window.__LE_PARTNERS_HOME=Object.freeze({load:()=>load({force:true}),activate:routeChanged}); routeChanged();
  })();`;
}
