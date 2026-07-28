import { GLOBAL_CREATE_ENDPOINTS } from "../../global-create-service.mjs";
import { PARTNERS_HOME_ENDPOINT } from "../../partners-home-service.mjs";
import { escapeAttribute, escapeHtml } from "../html.mjs";
import { buildGuidedEmptyState } from "../../discovery-empty-states.mjs";
import { renderGuidedEmptyState } from "../components/guided-empty-state.mjs";

const clean = (value = "") => String(value ?? "").trim();
const partnersEmptyHtml = renderGuidedEmptyState(buildGuidedEmptyState("partners", { state:"empty" }));
const partnersFilteredEmptyHtml = renderGuidedEmptyState(buildGuidedEmptyState("partners", { state:"filtered-empty" }));

export const PARTNERS_HOME_STYLESHEET_PATH = "assets/ui/partners-home.css";
export const PARTNERS_ACCESSIBILITY_STYLESHEET_PATH = "assets/ui/partners-accessibility.css";

function value(input, fallback = "Unavailable") { return escapeHtml(clean(input) || fallback); }
function date(input, fallback = "Not recorded") {
  const text = clean(input);
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00.000Z` : text);
  return Number.isFinite(parsed)
    ? escapeHtml(new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric" }).format(new Date(parsed)))
    : fallback;
}
function relationshipView(payload = {}) {
  if (payload.relationships) return payload.relationships;
  const items = (payload.items || []).map((item) => ({
    id:`partner:${item.id}`,
    name:item.partner?.name,
    organization:item.partner?.name,
    category:{ key:"partner", label:"Partner" },
    stage:item.stage,
    owner:item.owner,
    nextAction:item.nextAction,
    nextFollowUpAt:item.dueAt,
    followUpDue:item.dueState?.overdue === true,
    openTaskCount:0,
    waitingState:{ key:"none", label:"No waiting follow-up" },
    eligibility:{ key:"unavailable", label:"Unavailable" },
    href:item.partner?.href,
    partnerId:item.id
  }));
  return {
    available:payload.available === true,
    availability:payload.availability,
    items,
    summary:{
      totalRelationships:payload.summary?.authorizedPartners || 0,
      matchingRelationships:payload.summary?.matchingPartners || 0,
      followUpsDue:payload.summary?.overdueFollowUps || 0,
      waitingOnThem:0,
      waitingOnRoger:0,
      automatedOutreach:0,
      suppressedOrIneligible:0
    },
    filters:{ categories:[{ key:"partner", label:"Partner", count:items.length }], stages:payload.filters?.stages || [], owners:payload.filters?.owners || [], waitingStates:[], eligibility:[] },
    query:payload.query || {},
    pagination:payload.pagination || {}
  };
}
function selected(view, key, candidate) { return clean(view.query?.[key]) === clean(candidate) ? " selected" : ""; }
function option(view, key, item) { return `<option value="${escapeAttribute(item.key)}"${selected(view, key, item.key)}>${escapeHtml(item.label)} (${Number(item.count || 0)})</option>`; }
function relationshipFilters(view) {
  return `<form class="partners-filters relationships-filters" data-partners-filters aria-label="Relationship filters">
    <label class="relationships-search">Search<input type="search" name="search" value="${escapeAttribute(view.query?.search || "")}" autocomplete="off" placeholder="Name, organization, email, or next action"></label>
    <label>Category<select name="category"><option value="">All relationships</option>${(view.filters?.categories || []).map((item) => option(view, "category", item)).join("")}</select></label>
    <label>Stage<select name="stage"><option value="">All stages</option>${(view.filters?.stages || []).map((item) => option(view, "stage", item)).join("")}</select></label>
    <label>Waiting<select name="waiting"><option value="">Any next move</option>${(view.filters?.waitingStates || []).map((item) => option(view, "waiting", item)).join("")}</select></label>
    <label>Outreach<select name="automation"><option value="">Any outreach</option><option value="automated"${selected(view, "automation", "automated")}>Automated outreach</option><option value="manual"${selected(view, "automation", "manual")}>Manual follow-up</option></select></label>
    <label>Eligibility<select name="eligibility"><option value="">Any eligibility</option>${(view.filters?.eligibility || []).map((item) => option(view, "eligibility", item)).join("")}</select></label>
    <button type="button" data-partners-clear>Clear</button>
  </form>`;
}
function quickFilters(view) {
  const active = (key, candidate) => clean(view.query?.[key]) === candidate ? " is-active" : "";
  return `<div class="relationship-quick-filters" aria-label="Quick relationship filters">
    <button type="button" class="${active("followUp", "due")}" data-relationship-filter="followUp" data-relationship-filter-value="due">Follow-up due <span>${Number(view.summary?.followUpsDue || 0)}</span></button>
    <button type="button" class="${active("waiting", "on_them")}" data-relationship-filter="waiting" data-relationship-filter-value="on_them">Waiting on them <span>${Number(view.summary?.waitingOnThem || 0)}</span></button>
    <button type="button" class="${active("waiting", "on_roger")}" data-relationship-filter="waiting" data-relationship-filter-value="on_roger">Waiting on Roger <span>${Number(view.summary?.waitingOnRoger || 0)}</span></button>
    <button type="button" class="${active("automation", "automated")}" data-relationship-filter="automation" data-relationship-filter-value="automated">Automated outreach <span>${Number(view.summary?.automatedOutreach || 0)}</span></button>
    <button type="button" class="${active("eligibility", "suppressed")}" data-relationship-filter="eligibility" data-relationship-filter-value="suppressed">Not eligible to contact <span>${Number(view.summary?.suppressedOrIneligible || 0)}</span></button>
  </div>`;
}
function statusChip(item, kind = "neutral") {
  if (!item?.label) return "";
  return `<span class="relationship-status-chip" data-kind="${escapeAttribute(kind)}">${escapeHtml(item.label)}</span>`;
}
function relationshipRow(item) {
  const name = clean(item.name || item.organization) || "Unnamed relationship";
  const organization = clean(item.organization) && clean(item.organization) !== name ? item.organization : "";
  const dueClass = item.followUpDue ? " is-due" : "";
  const outreach = item.campaign?.name || (item.automatedOutreach ? "Automated sequence" : "No active sequence");
  const result = item.replyState?.label || item.result?.label || "No recent result";
  return `<article class="relationship-row${dueClass}" data-relationship-row>
    <div class="relationship-identity">
      <div class="relationship-row-chips">${statusChip(item.category, "category")}${statusChip(item.stage, "stage")}</div>
      <button type="button" class="relationship-name" data-relationship-open="${escapeAttribute(item.id)}" data-relationship-id="${escapeAttribute(item.id)}">${escapeHtml(name)}</button>
      ${organization ? `<p>${escapeHtml(organization)}</p>` : ""}
      <p>${value(item.primaryContact, "No primary contact")}${item.email ? ` · <a href="mailto:${escapeAttribute(item.email)}">${escapeHtml(item.email)}</a>` : ""}</p>
      ${item.roles ? founderOsRoles(item) : ""}${item.needsIdentityConfirmation ? founderOsDuplicateNotice(item) : ""}
    </div>
    <dl class="relationship-row-details">
      <div class="relationship-next"><dt>Next action</dt><dd>${value(item.nextAction, "No next action set")}<small class="${item.followUpDue ? "is-overdue" : ""}">${item.nextFollowUpAt ? `${item.followUpDue ? "Due " : "Follow-up "}${date(item.nextFollowUpAt)}` : "No follow-up date"}</small></dd></div>
      <div><dt>Last inbound</dt><dd>${date(item.lastInboundAt)}</dd></div>
      <div><dt>Last outbound</dt><dd>${date(item.lastOutboundAt)}</dd></div>
      <div><dt>Owner</dt><dd>${value(item.owner, "Unassigned")}</dd></div>
      <div><dt>Open tasks</dt><dd>${Number(item.openTaskCount || 0)}</dd></div>
      <div><dt>Outreach</dt><dd>${escapeHtml(outreach)}<small>${escapeHtml(result)}</small></dd></div>
      <div><dt>Next move</dt><dd>${value(item.waitingState?.label, "Not set")}</dd></div>
      <div><dt>Eligibility</dt><dd>${statusChip(item.eligibility, ["suppressed", "ineligible"].includes(item.eligibility?.key) ? "attention" : "eligible")}</dd></div>
      ${item.roles ? founderOsRowDetails(item) : ""}
    </dl>
    <div class="relationship-row-actions">
      <button type="button" class="is-primary" data-compose-source-kind="relationship" data-compose-source-id="${escapeAttribute(item.id)}">Draft follow-up</button>
      <button type="button" data-relationship-open="${escapeAttribute(item.id)}" data-relationship-id="${escapeAttribute(item.id)}">${item.nextAction ? "Open relationship" : "Set next action"}</button>
      ${item.partnerId && item.href ? `<a href="${escapeAttribute(item.href)}">Full Partner record</a>` : ""}
    </div>
  </article>`;
}
// Release 3 (FOUNDER_OS_RELATIONSHIPS). These render only when the projection actually
// carries the Release 3 fields, which it does only when the flag is on. The renderer keys
// off the payload's shape rather than a second flag, so there is exactly one source of
// truth for whether the Founder OS behaviour is live, and the flag-off bundle never ships
// the helpers at all (see partnersHomeBrowserSource).
// Import and Add belong in the header (relationships.md). Import did not exist anywhere in
// this workspace: the audience importer was reachable only from a legacy campaigns hero.
// Both reuse the workflows that already exist — the create workflow and the #upload importer.
function founderOsHeaderActions() {
  return `<div class="relationships-header-actions">
      <a class="partners-secondary" href="#upload" data-relationships-import>Import relationships</a>
      <button class="partners-primary" type="button" data-partners-add data-create-endpoint="${escapeAttribute(GLOBAL_CREATE_ENDPOINTS.partner)}">Add relationship</button>
    </div>`;
}
// The summary counts were read-only numbers with a separate filter control elsewhere on the
// page. Each count IS its filter now: one click, from the number Roger is looking at.
function founderOsSummary(view) {
  const tile = (label, count, query) => `<div><dt>${escapeHtml(label)}</dt><dd><button type="button" class="relationship-summary-count" data-relationship-view="${escapeAttribute(JSON.stringify(query))}"><span>${Number(count || 0)}</span> <small>${escapeHtml(label)}</small></button></dd></div>`;
  return `<dl class="partners-summary relationships-summary" aria-label="Relationship summary">
    <div><dt>Relationships</dt><dd>${Number(view.summary?.totalRelationships || 0)}</dd></div>
    ${tile("Follow-up due", view.summary?.followUpsDue, { followUp:"due" })}
    ${tile("Waiting on me", view.summary?.waitingOnRoger, { waiting:"on_roger" })}
    ${tile("In automated outreach", view.summary?.automatedOutreach, { automation:"automated" })}
  </dl>`;
}
function founderOsViewTabs(view) {
  return `<nav class="relationship-views" aria-label="Relationship views">${(view.filters?.views || []).map((item) => `<button type="button" class="${item.active ? "is-active" : ""}" data-relationship-view="${escapeAttribute(JSON.stringify(item.query))}" aria-current="${item.active ? "page" : "false"}">${escapeHtml(item.label)} <span>${Number(item.count || 0)}</span></button>`).join("")}</nav>`;
}
function founderOsSavedFilters(view) {
  return `<div class="relationship-saved-filters" aria-label="Saved filters">${(view.filters?.savedFilters || []).map((item) => `<button type="button" class="${item.active ? "is-active" : ""}" data-relationship-view="${escapeAttribute(JSON.stringify(item.query))}">${escapeHtml(item.label)} <span>${Number(item.count || 0)}</span></button>`).join("")}</div>`;
}
function founderOsRoles(item) {
  const roles = item.roles || [];
  if (!roles.length) return "";
  // Every role this one person holds, on the one record. Never one row per role.
  return `<div class="relationship-roles" aria-label="Roles">${roles.map((role) => `<span class="relationship-role-chip">${escapeHtml(role.label)}</span>`).join("")}</div>`;
}
function founderOsRowDetails(item) {
  if (!item.roles) return "";
  const commitments = Number(item.openCommitmentCount || 0);
  const overdue = (item.openCommitments || []).filter((commitment) => commitment.overdue).length;
  const contact = item.daysSinceContact === null || item.daysSinceContact === undefined
    ? "No contact recorded"
    : `${Number(item.daysSinceContact)} day${Number(item.daysSinceContact) === 1 ? "" : "s"} ago`;
  return `<div><dt>Strength</dt><dd>${escapeHtml(item.relationshipStrength?.label || "Not set")}</dd></div>
      <div><dt>Strategic priority</dt><dd>${escapeHtml(item.strategicPriority?.label || "Not set")}</dd></div>
      <div><dt>Open commitments</dt><dd>${commitments}${overdue ? `<small class="is-overdue">${overdue} overdue</small>` : ""}</dd></div>
      <div><dt>Last contact</dt><dd>${escapeHtml(contact)}</dd></div>`;
}
function founderOsDuplicateNotice(item) {
  if (!item.needsIdentityConfirmation) return "";
  const count = (item.possibleDuplicates || []).length;
  // Surfaced for confirmation, never merged automatically (relationships.md:65-66).
  return `<p class="relationship-duplicate-notice" role="note">Possible duplicate: this may be the same person as ${count} other record${count === 1 ? "" : "s"}. Nothing has been merged.</p>`;
}
function relationshipEmpty(view) {
  const filtered = view.availability?.state === "filtered_empty";
  return `<section class="partners-empty" role="status">${filtered ? partnersFilteredEmptyHtml : partnersEmptyHtml}</section>`;
}

export function partnersHomePageHtml(payload = null) {
  if (!payload) return `<section class="partners-page" data-partners-page aria-busy="true"><div class="partners-loading" role="status"><span aria-hidden="true"></span><p>Loading relationships</p></div></section>`;
  const view = relationshipView(payload);
  if (view.available !== true) return `<section class="partners-page" data-partners-page><div class="partners-state" role="alert"><p class="eyebrow">Unavailable</p><h1>Relationships are unavailable</h1><p>Relationship data could not be read. No changes were made.</p></div></section>`;
  const items = view.items || [];
  return `<section class="partners-page relationships-page" data-partners-page aria-labelledby="partners-title" aria-busy="false">
    <header class="partners-header relationships-header"><div><p class="eyebrow">Founder CRM</p><h1 id="partners-title">Relationships</h1><p>Keep people, conversations, commitments, and outreach moving from one truthful view.</p></div>${view.filters?.views ? founderOsHeaderActions() : `<button class="partners-primary" type="button" data-partners-add data-create-endpoint="${GLOBAL_CREATE_ENDPOINTS.partner}">Add Partner</button>`}</header>
    ${view.filters?.views ? founderOsSummary(view) : `<dl class="partners-summary relationships-summary" aria-label="Relationship summary"><div><dt>Relationships</dt><dd>${Number(view.summary?.totalRelationships || 0)}</dd></div><div><dt>Follow-ups due</dt><dd>${Number(view.summary?.followUpsDue || 0)}</dd></div><div><dt>Waiting on Roger</dt><dd>${Number(view.summary?.waitingOnRoger || 0)}</dd></div><div><dt>Automated outreach</dt><dd>${Number(view.summary?.automatedOutreach || 0)}</dd></div></dl>`}
    ${view.filters?.views ? founderOsViewTabs(view) : quickFilters(view)}${relationshipFilters(view)}${view.filters?.savedFilters ? founderOsSavedFilters(view) : ""}
    <div class="partners-announcement" role="status" aria-live="polite">Showing ${Number(view.summary?.matchingRelationships || 0)} relationship${Number(view.summary?.matchingRelationships || 0) === 1 ? "" : "s"}.</div>
    <div class="partners-content relationships-list">${items.length ? items.map(relationshipRow).join("") : relationshipEmpty(view)}</div>
    ${payload.pagination?.nextCursor ? '<button class="partners-load-more" type="button" data-partners-load-more>Next relationships</button>' : ""}
  </section>`;
}

export function partnersHomeBrowserSource(options = {}) {
  const founderOs = options.founderOsRelationships === true;
  const endpoint = JSON.stringify(PARTNERS_HOME_ENDPOINT);
  const loadingHtml = JSON.stringify(partnersHomePageHtml()).replaceAll("<", "\\u003c");
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const value=${value.toString()};`,
    `const date=${date.toString()};`,
    `const relationshipView=${relationshipView.toString()};`,
    `const selected=${selected.toString()};`,
    `const option=${option.toString()};`,
    `const relationshipFilters=${relationshipFilters.toString()};`,
    `const quickFilters=${quickFilters.toString()};`,
    `const statusChip=${statusChip.toString()};`,
    `const relationshipRow=${relationshipRow.toString()};`,
    `const partnersEmptyHtml=${JSON.stringify(partnersEmptyHtml).replaceAll("<", "\\u003c")};`,
    `const partnersFilteredEmptyHtml=${JSON.stringify(partnersFilteredEmptyHtml).replaceAll("<", "\\u003c")};`,
    `const relationshipEmpty=${relationshipEmpty.toString()};`,
    ...(founderOs ? [
      `const founderOsHeaderActions=${founderOsHeaderActions.toString()};`,
      `const founderOsSummary=${founderOsSummary.toString()};`,
      `const founderOsViewTabs=${founderOsViewTabs.toString()};`,
      `const founderOsSavedFilters=${founderOsSavedFilters.toString()};`,
      `const founderOsRoles=${founderOsRoles.toString()};`,
      `const founderOsRowDetails=${founderOsRowDetails.toString()};`,
      `const founderOsDuplicateNotice=${founderOsDuplicateNotice.toString()};`
    ] : []),
    `const GLOBAL_CREATE_ENDPOINTS={partner:"/api/ui/create/partner"};`,
    `const partnersHomePageHtml=${partnersHomePageHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    const endpoint=${endpoint}; const loadingHtml=${loadingHtml}; ${renderer}
    ${founderOs ? `const FOUNDER_OS_RESET={category:"",stage:"",followUp:"",waiting:"",automation:"",eligibility:"",owner:"",role:"",pipeline:"",replied:"",meeting:"",noContactDays:""};` : ""}
    const metrics={requests:0,activeRequests:0,maximumActiveRequests:0,staleRequestsAborted:0,fullStateReads:0,mutations:0,externalActions:0,providerCalls:0}; window.__LE_PARTNERS_HOME_METRICS=metrics;
    let active=null;let sequence=0;let payload=null;let sessionEnded=false;
    function app(){return document.querySelector("main#app #partners.page-section.active");}
    function resolution(){return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");}
    function onRoute(){const route=resolution();return route?.kind==="page"&&route.canonicalRoute==="partners";}
    function routeQuery(){const query=new URLSearchParams(String(location.hash||"").split("?")[1]||"");query.set("view","list");query.set("limit","50");return query;}
    function routeHash(next={}){const current=routeQuery();current.delete("limit");for(const [key,value] of Object.entries(next)){if(value)current.set(key,value);else current.delete(key);}current.set("view","list");return "#partners?"+current.toString();}
    function navigate(next){const target=routeHash(next);if(location.hash===target)load({force:true});else location.hash=target.slice(1);}
    function ensureLoading(){const target=app();if(!target||sessionEnded)return false;if(!target.querySelector("[data-partners-page]"))target.innerHTML=loadingHtml;return true;}
    function renderState(kind,title,message){const target=app();if(!target)return;const section=document.createElement("section");section.className="partners-page";section.dataset.partnersPage="";const state=document.createElement("div");state.className="partners-state";state.setAttribute("role",kind==="error"||kind==="unauthorized"?"alert":"status");const heading=document.createElement("h1");heading.textContent=title;if(kind==="error"||kind==="unauthorized")heading.tabIndex=-1;const copy=document.createElement("p");copy.textContent=message;state.append(heading,copy);if(kind==="error"){const retry=document.createElement("button");retry.type="button";retry.textContent="Try again";retry.addEventListener("click",()=>load({force:true}));state.append(retry);}section.append(state);target.replaceChildren(section);if(heading.tabIndex===-1)setTimeout(()=>heading.focus(),0);}
    function clearFilters(){navigate({search:"",category:"",stage:"",owner:"",health:"",waiting:"",automation:"",eligibility:"",followUp:"",cursor:""});}
    function bind(){const root=app()?.querySelector("[data-partners-page]");if(!root||root.dataset.bound==="true")return;root.dataset.bound="true";root.querySelector("[data-partners-add]")?.addEventListener("click",event=>window.__LE_GLOBAL_CREATE?.openWorkflow("partner",{returnTarget:event.currentTarget}));root.addEventListener("vnext:guided-clear-filters",clearFilters);root.addEventListener("vnext:guided-retry",()=>load({force:true}));const form=root.querySelector("[data-partners-filters]");form?.addEventListener("change",event=>{const control=event.target.closest("select");if(control)navigate({[control.name]:control.value,cursor:""});});form?.addEventListener("submit",event=>{event.preventDefault();const data=new FormData(form);navigate({search:String(data.get("search")||"").trim(),cursor:""});});form?.querySelector("input[name=search]")?.addEventListener("search",event=>navigate({search:event.currentTarget.value.trim(),cursor:""}));root.querySelector("[data-partners-clear]")?.addEventListener("click",clearFilters);root.querySelectorAll("[data-relationship-filter]").forEach(control=>control.addEventListener("click",()=>{const key=control.dataset.relationshipFilter;const requested=control.dataset.relationshipFilterValue;const current=routeQuery().get(key)||"";navigate({[key]:current===requested?"":requested,cursor:""});}));${founderOs ? `root.querySelectorAll("[data-relationship-view]").forEach(control=>control.addEventListener("click",()=>{let requested={};try{requested=JSON.parse(control.dataset.relationshipView||"{}");}catch{requested={};}navigate({...FOUNDER_OS_RESET,...requested,cursor:""});}));` : ""}root.querySelector("[data-partners-load-more]")?.addEventListener("click",()=>{if(payload?.pagination?.nextCursor)navigate({cursor:payload.pagination.nextCursor});});}
    function render(next){payload=next;const target=app();if(!target)return;target.innerHTML=partnersHomePageHtml(next);bind();}
    async function load({force=false}={}){if(!onRoute()||sessionEnded||!ensureLoading())return null;const query=routeQuery().toString();if(active){if(active.query===query&&!force)return active.promise;active.controller.abort();metrics.staleRequestsAborted+=1;}const controller=new AbortController();const currentSequence=++sequence;metrics.requests+=1;metrics.activeRequests+=1;metrics.maximumActiveRequests=Math.max(metrics.maximumActiveRequests,metrics.activeRequests);const promise=fetch(endpoint+"?"+query,{credentials:"same-origin",headers:{accept:"application/json"},signal:controller.signal}).then(async response=>{const body=await response.json().catch(()=>({}));if(response.status===401){if(currentSequence===sequence)renderState("session","Session expired","Sign in again. No changes were made.");active=null;sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;}if(response.status===403){if(currentSequence===sequence)renderState("unauthorized","Relationships need additional access","No protected relationship details were loaded.");return null;}if(!response.ok||body.ok!==true)throw new Error("Relationships could not load");if(currentSequence===sequence&&onRoute())render(body);return body;}).catch(error=>{if(error.name==="AbortError")return null;if(currentSequence===sequence&&onRoute())renderState("error","Relationships could not load","No records were changed. Try again.");return null;}).finally(()=>{metrics.activeRequests-=1;if(active?.controller===controller)active=null;});active={query,controller,promise};return promise;}
    function routeChanged(){if(!onRoute()){sequence+=1;payload=null;return;}payload=null;ensureLoading();load();}
    window.addEventListener("hashchange",routeChanged);document.addEventListener("vnext:communication-sent-recorded",()=>{if(onRoute())load({force:true});});document.addEventListener("vnext:relationship-updated",()=>{if(onRoute())load({force:true});});document.addEventListener("vnext:session-expired",()=>{sessionEnded=true;sequence+=1;active=null;payload=null;});const observed=document.querySelector("main#app");if(observed)new MutationObserver(()=>{if(onRoute()&&!app()?.querySelector("[data-partners-page]"))routeChanged();}).observe(observed,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});window.__LE_PARTNERS_HOME=Object.freeze({load:()=>load({force:true}),activate:routeChanged});routeChanged();
  })();`;
}
