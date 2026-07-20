import { escapeAttribute, escapeHtml } from "../html.mjs";

const clean = (value = "") => String(value ?? "").trim();
const display = (value, fallback = "Unavailable") => escapeHtml(clean(value) || fallback);
const date = (value) => value ? escapeHtml(new Intl.DateTimeFormat("en-US", { timeZone:"UTC", month:"short", day:"numeric", year:"numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`))) : "Unavailable";

export const PARTNER_RECORD_STYLESHEET_PATHS = Object.freeze([
  "assets/ui/partner-record.css",
  "assets/ui/partner-outreach.css",
  "assets/ui/partner-artifacts.css"
]);

function overview(view) {
  const relationship = view.overview.relationship;
  const contacts = view.overview.contacts.available
    ? view.overview.contacts.items.length ? `<ul>${view.overview.contacts.items.map((item) => `<li><strong>${display(item.name, "Contact")}</strong><span>${display(item.title, "Role unavailable")}</span>${item.email ? `<span>${escapeHtml(item.email)}</span>` : ""}</li>`).join("")}</ul>` : "<p>No contacts recorded.</p>"
    : "<p>Contact details require additional access.</p>";
  const notes = view.overview.notes.available
    ? view.overview.notes.items.length ? `<ul>${view.overview.notes.items.map((item) => `<li>${escapeHtml(item.summary)}</li>`).join("")}</ul>` : "<p>No relationship notes recorded.</p>"
    : "<p>Relationship notes require additional access.</p>";
  return `<div class="partner-record-grid"><section><h2>Relationship</h2><dl><div><dt>Type</dt><dd>${display(relationship.type)}</dd></div><div><dt>Geography</dt><dd>${display(relationship.geography)}</dd></div><div><dt>Opportunity</dt><dd>${display(relationship.opportunity)}</dd></div><div><dt>Blocker</dt><dd>${display(relationship.blocker)}</dd></div></dl></section><section><h2>Contacts</h2>${contacts}</section><section><h2>Notes</h2>${notes}</section><section><h2>Programs</h2>${view.overview.programs.length ? `<ul>${view.overview.programs.map((program) => `<li><strong>${display(program.name, "Program")}</strong><span>${display(program.status)}</span></li>`).join("")}</ul>` : "<p>No programs recorded.</p>"}</section></div>`;
}

function activity(view) {
  if (!view.activity.available) return "<div class=partner-record-state><h2>Activity unavailable</h2><p>This account cannot read Partner activity.</p></div>";
  if (!view.activity.events.length) return "<div class=partner-record-state><h2>No activity yet</h2><p>Log a reviewed interaction when one occurs.</p></div>";
  return `<ol class="partner-activity-list">${view.activity.events.map((event) => `<li><span>${escapeHtml(event.label)}</span><strong>${escapeHtml(event.summary)}</strong><time>${date(event.occurredAt)}</time>${event.sourceHref ? `<a href="${escapeAttribute(event.sourceHref)}">Open source</a>` : ""}</li>`).join("")}</ol>`;
}

function outreach(view) {
  if (!view.outreach.available) return `<div class="partner-record-state"><h2>Outreach unavailable</h2><p>This account cannot read related Campaigns.</p></div>`;
  const campaigns = view.outreach.campaigns.length ? `<ul class="partner-related-list">${view.outreach.campaigns.map((campaign) => `<li><div><strong>${escapeHtml(campaign.name)}</strong><span>${escapeHtml(campaign.status.label)}</span></div>${campaign.href ? `<a href="${escapeAttribute(campaign.href)}" aria-label="Open Campaign: ${escapeAttribute(campaign.name)}">Open Campaign</a>` : ""}</li>`).join("")}</ul>` : `<div class="partner-record-state"><h2>No Campaigns yet</h2><p>Create a draft when outreach is ready for review.</p></div>`;
  const suggestions = view.outreach.suggestions.length ? `<section class="partner-suggestions"><h2>Reviewed reply suggestions</h2>${view.outreach.suggestions.map((item) => `<article><p>${escapeHtml(item.evidence.summary)}</p><strong>${item.applied ? "Applied stage" : "Suggested stage"}: ${escapeHtml(item.proposedUiStage.label)}</strong>${item.applied ? '<span class="suggestion-applied">Applied</span>' : `<button type="button" data-stage-suggestion="${escapeAttribute(item.id)}">Review and apply</button>`}</article>`).join("")}</section>` : "";
  return `${campaigns}${suggestions}`;
}

function files(view) {
  if (!view.files.available) return `<div class="partner-record-state"><h2>Files unavailable</h2><p>This account cannot read Partner Files.</p></div>`;
  const actions = `<div class="partner-file-actions"><button type="button" data-partner-artifact="proposal">Create proposal</button><button type="button" data-partner-artifact="landing_page">Create co-branded landing page</button><button type="button" data-partner-artifact="weekly_report">Create weekly report</button><button type="button" data-partner-artifact="final_report">Create final impact report</button><button type="button" data-partner-artifact="program">Create program record</button></div>`;
  const items = view.files.items.length ? `<ul class="partner-file-list">${view.files.items.map((file) => `<li><div><strong>${display(file.name, "File")}</strong><span>${display(file.status?.label)} · ${display(file.fileType?.label)}</span></div><a href="${escapeAttribute(file.href)}" aria-label="Open File: ${escapeAttribute(file.name || "File")}">Open File</a></li>`).join("")}</ul>` : `<div class="partner-record-state"><h2>No Files yet</h2><p>Add a File record or create a reviewed program artifact.</p></div>`;
  return `${actions}${items}`;
}

function deferred(title, action) { return `<div class="partner-record-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(action)} integration is ready for shared-shell registration. No external action has occurred.</p></div>`; }

export function partnerRecordPageHtml(view = null) {
  if (!view) return `<section class="partner-record-page" data-partner-record aria-busy="true"><div role="status">Loading Partner record</div></section>`;
  if (!view.available) return `<section class="partner-record-page" data-partner-record><div class="partner-record-state" role="alert"><h1>Partner not available</h1><p>The record was not found or this account cannot view it.</p></div></section>`;
  const tabContent = view.selectedTab === "activity" ? activity(view) : view.selectedTab === "outreach" ? outreach(view) : view.selectedTab === "files" ? files(view) : overview(view);
  return `<section class="partner-record-page" data-partner-record aria-labelledby="partner-record-title" aria-busy="false">
    <a class="partner-record-back" href="#partners">← All Partners</a>
    <header class="partner-record-header"><div><p class="eyebrow">Partner</p><h1 id="partner-record-title">${escapeHtml(view.header.name)}</h1><div class="partner-record-badges"><span>${escapeHtml(view.header.stage.label)}</span><span>${escapeHtml(view.header.health.label)}</span><span>${display(view.header.owner)}</span></div></div><div class="partner-next-action"><p>Next action</p><strong>${display(view.header.nextAction.summary, "No next action recorded")}</strong><span>Due ${date(view.header.nextAction.dueAt)}</span>${view.header.nextAction.available ? `<button type="button" data-partner-action="complete_next_action" data-endpoint="${escapeAttribute(view.header.nextAction.completeEndpoint)}">Complete next action</button>` : ""}</div></header>
    <div class="partner-record-actions"><button type="button" data-partner-action="log_activity">Log activity</button><button type="button" data-partner-action="create_outreach">Create outreach</button><button type="button" data-partner-action="add_file">Add file</button></div>
    <nav class="partner-record-tabs" aria-label="Partner record sections">${view.tabs.map((tab) => `<a href="${escapeAttribute(view.href)}?tab=${tab.key}"${view.selectedTab === tab.key ? ' aria-current="page"' : ""}>${escapeHtml(tab.label)}</a>`).join("")}</nav>
    <div class="partner-record-content">${tabContent}</div><div class="partner-record-announcement" role="status" aria-live="polite"></div>
  </section>`;
}

export function partnerRecordBrowserSource() {
  const loadingHtml = JSON.stringify(partnerRecordPageHtml()).replaceAll("<", "\\u003c");
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const display=${display.toString()};`,
    `const date=${date.toString()};`,
    `const overview=${overview.toString()};`,
    `const activity=${activity.toString()};`,
    `const outreach=${outreach.toString()};`,
    `const files=${files.toString()};`,
    `const partnerRecordPageHtml=${partnerRecordPageHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    const loadingHtml=${loadingHtml}; ${renderer}
    const metrics={ requests:0, activeRequests:0, maximumActiveRequests:0, staleRequestsAborted:0, fullStateReads:0, mutations:0, externalActions:0, providerCalls:0, sends:0, enrollments:0, uploads:0, shares:0, silentStageChanges:0 }; window.__LE_PARTNER_RECORD_METRICS=metrics;
    let active=null; let sequence=0; let payload=null; let sessionEnded=false;
    function app(){ return document.querySelector("main#app #item.page-section.active"); }
    function resolution(){ return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today"); }
    function onRoute(){ const route=resolution(); return route?.kind==="object"&&route.objectType==="Partner"&&route.sourceKind==="partners"; }
    function routeState(){ const route=resolution(); const query=new URLSearchParams(String(location.hash||"").split("?")[1]||""); const tab=["overview","activity","outreach","files"].includes(query.get("tab"))?query.get("tab"):"overview"; return { partnerId:route?.sourceId||"", tab }; }
    function endpoint(){ const state=routeState(); return "/api/ui/partners/"+encodeURIComponent(state.partnerId)+"?tab="+encodeURIComponent(state.tab); }
    function csrf(){ const prefix="leos_csrf="; return String(document.cookie||"").split(";").map(value=>value.trim()).find(value=>value.startsWith(prefix))?.slice(prefix.length)||""; }
    function requestId(){ return "partner_"+(globalThis.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(16).slice(2)).replaceAll("-","_"); }
    const analyticsReference=Object.freeze({workflowId:"partner-action",destinationId:"partners"});
    function analyticsEvent(type,detail=analyticsReference){document.dispatchEvent(new CustomEvent(type,{detail}));}
    function announce(message){ const target=app()?.querySelector(".partner-record-announcement"); if(target) target.textContent=message; }
    function ensureLoading(){ const target=app(); if(!target||sessionEnded) return false; if(!target.querySelector("[data-partner-record]")) target.innerHTML=loadingHtml; return true; }
    function renderState(kind,title,message){ const target=app(); if(!target)return; const section=document.createElement("section"); section.className="partner-record-page"; section.dataset.partnerRecord=""; const state=document.createElement("div"); state.className="partner-record-state"; state.setAttribute("role",kind==="error"||kind==="unauthorized"?"alert":"status"); const heading=document.createElement("h1"); heading.textContent=title; if(kind==="error"||kind==="unauthorized")heading.tabIndex=-1; const copy=document.createElement("p"); copy.textContent=message; state.append(heading,copy); if(kind==="error"){ const retry=document.createElement("button"); retry.type="button"; retry.textContent="Try again"; retry.addEventListener("click",()=>load({force:true})); state.append(retry); } section.append(state); target.replaceChildren(section); if(heading.tabIndex===-1)setTimeout(()=>heading.focus(),0); }
    async function post(path,input={}){ metrics.mutations+=1; const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json","x-csrf-token":csrf()},body:JSON.stringify({requestId:requestId(),...input})}); const body=await response.json().catch(()=>({})); if(response.status===401){renderState("session","Session expired","Sign in again. No changes were made.");active=null;sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;} if(!response.ok||body.ok!==true)throw new Error(body.error||"Partner action could not be completed"); metrics.externalActions+=Number(body.externalActions||0); metrics.sends+=Number(body.sends||0); metrics.enrollments+=Number(body.enrollments||0); metrics.uploads+=Number(body.uploads||0); metrics.shares+=Number(body.shares||0); return body; }
    function activityDialog(returnTarget){ const root=document.createElement("div"); root.className="partner-activity-dialog"; root.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="partner-activity-title"><h2 id="partner-activity-title">Log activity</h2><form><label>Activity type<select name="type"><option value="note_added">Note added</option><option value="meeting_completed">Meeting completed</option><option value="reply_recorded">Reply recorded</option><option value="outreach_recorded">Outreach recorded</option></select></label><label>Summary<textarea name="summary" maxlength="500" required></textarea></label><div><button type="submit">Save activity</button><button type="button" data-cancel>Cancel</button></div></form></section>'; const close=()=>{root.remove();returnTarget?.focus();}; root.querySelector("[data-cancel]").addEventListener("click",()=>{analyticsEvent("vnext:workflow-abandoned",{...analyticsReference,reasonCode:"navigation"});close();}); root.querySelector("form").addEventListener("submit",async event=>{event.preventDefault();if(!event.currentTarget.reportValidity()){analyticsEvent("vnext:validation-blocked",{...analyticsReference,actionId:"update",reasonCode:"missing-required-field"});return;}const data=new FormData(event.currentTarget);try{await post("/api/ui/partners/"+encodeURIComponent(payload.partnerId)+"/activity",{type:data.get("type"),summary:data.get("summary")});analyticsEvent("vnext:workflow-completed");close();await load({force:true});announce("Partner activity saved.");}catch(error){analyticsEvent("vnext:action-failed",{...analyticsReference,actionId:"update",reasonCode:"write-unavailable"});announce(error.message);}}); document.body.append(root); root.querySelector("textarea").focus(); }
    async function runAction(action,button){ try{ if(action==="log_activity"){analyticsEvent("vnext:workflow-started");activityDialog(button);return;} if(action==="create_outreach"){analyticsEvent("vnext:workflow-started");const result=await post("/api/ui/partners/outreach/campaign",{partnerIds:[payload.partnerId],campaignName:"Follow up with "+payload.header.name,goal:"Continue this Partner conversation safely."});analyticsEvent("vnext:workflow-completed");if(result?.campaignHref){location.hash=(result.campaignHref+"?step=goal").slice(1);}return;} if(action==="add_file"){window.__LE_GLOBAL_CREATE?.openWorkflow("file-or-folder",{returnTarget:button});return;} if(action==="complete_next_action"){analyticsEvent("vnext:workflow-started");await post("/api/ui/partners/"+encodeURIComponent(payload.partnerId)+"/next-action/complete");analyticsEvent("vnext:workflow-completed");await load({force:true});announce("Next action completed.");} }catch(error){analyticsEvent("vnext:action-failed",{...analyticsReference,actionId:"update",reasonCode:"write-unavailable"});announce(error.message);} }
    function bind(){ const root=app()?.querySelector("[data-partner-record]"); if(!root||root.dataset.bound==="true")return; root.dataset.bound="true"; root.addEventListener("click",async event=>{ const action=event.target.closest("[data-partner-action]"); if(action){await runAction(action.dataset.partnerAction,action);return;} const suggestion=event.target.closest("[data-stage-suggestion]"); if(suggestion){ if(!confirm("Apply this reviewed Partner stage update?"))return; try{await post("/api/ui/partners/"+encodeURIComponent(payload.partnerId)+"/stage-suggestions/"+encodeURIComponent(suggestion.dataset.stageSuggestion)+"/apply",{confirmed:true});await load({force:true});announce("Reviewed Partner stage update applied.");}catch(error){announce(error.message);} return;} const artifact=event.target.closest("[data-partner-artifact]"); if(artifact){ const type=artifact.dataset.partnerArtifact; try{if(type==="program"){await post("/api/ui/partners/"+encodeURIComponent(payload.partnerId)+"/programs",{name:payload.header.name+" Program"});}else{const programId=payload.files?.programs?.[0]?.id;if(!programId){announce("Create a program record before generating this artifact.");return;}await post("/api/ui/partners/"+encodeURIComponent(payload.partnerId)+"/programs/"+encodeURIComponent(programId)+"/artifacts",{artifactType:type});}await load({force:true});announce("Partner File activity saved for review.");}catch(error){announce(error.message);} } }); }
    function render(next){payload=next;const target=app();if(!target)return;target.innerHTML=partnerRecordPageHtml(next);bind();}
    async function load({force=false}={}){if(!onRoute()||sessionEnded||!ensureLoading())return null;const path=endpoint();if(active){if(active.path===path&&!force)return active.promise;active.controller.abort();metrics.staleRequestsAborted+=1;}const controller=new AbortController();const currentSequence=++sequence;metrics.requests+=1;metrics.activeRequests+=1;metrics.maximumActiveRequests=Math.max(metrics.maximumActiveRequests,metrics.activeRequests);const promise=fetch(path,{credentials:"same-origin",headers:{accept:"application/json"},signal:controller.signal}).then(async response=>{const body=await response.json().catch(()=>({}));if(response.status===401){if(currentSequence===sequence)renderState("session","Session expired","Sign in again. No changes were made.");active=null;sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;}if(response.status===403){if(currentSequence===sequence)renderState("unauthorized","Partner needs additional access","No protected Partner details were loaded.");return null;}if(response.status===404){if(currentSequence===sequence)render(body);return body;}if(!response.ok||body.ok!==true)throw new Error("Partner could not load");if(currentSequence===sequence&&onRoute())render(body);return body;}).catch(error=>{if(error.name==="AbortError")return null;if(currentSequence===sequence&&onRoute())renderState("error","Partner could not load","No records were changed. Try again.");return null;}).finally(()=>{metrics.activeRequests-=1;if(active?.controller===controller)active=null;});active={path,controller,promise};return promise;}
    function routeChanged(){if(!onRoute()){sequence+=1;payload=null;return;}payload=null;ensureLoading();load();}
    window.addEventListener("hashchange",routeChanged);document.addEventListener("vnext:session-expired",()=>{sessionEnded=true;sequence+=1;active=null;payload=null;});const observed=document.querySelector("main#app");if(observed)new MutationObserver(()=>{if(onRoute()&&!app()?.querySelector("[data-partner-record]"))routeChanged();}).observe(observed,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});window.__LE_PARTNER_RECORD=Object.freeze({load:()=>load({force:true}),activate:routeChanged});routeChanged();
  })();`;
}
