// The rendered Prospect Profile workspace (Wave 2, Packet 7).
//
// Fifteen sections down the page, a section index on the left, and a source panel that makes
// every sentence traceable to the document it came from in one step.
//
// The renderers are pure functions of the payload the profile endpoint returns, so the whole
// surface can be proven without a browser. They are also serialised with `.toString()` into the
// lazy runtime, which is why they take everything they need as arguments and close over nothing.
//
// A separate lazy asset from rcap-prospects, and a separate stylesheet, for two reasons: the
// profile is only ever wanted on one tab, and the list runtime is already most of the 64KB
// budget. When this runtime is active the list runtime stands down, the same ownership rule that
// stops the legacy Partners page and the RCAP view from rendering over each other.

const clean = (value = "") => String(value ?? "").trim();

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function shortDate(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const RCAP_PROFILE_STYLESHEET_PATH = "/assets/ui/rcap-profile.css";
export const RCAP_PROFILE_ENDPOINT = "/api/ui/rcap-profile";

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function profileStateHtml(profile) {
  const availability = profile?.availability || {};
  const heading = availability.state === "feature_off"
    ? "The RCAP prospect workspace is not enabled"
    : availability.state === "not_found_or_unauthorized"
      ? "That organization is not available"
      : "Research is unavailable";
  return `<section class="rcap-profile-page" data-rcap-profile data-rcap-profile-state="${escapeHtml(availability.state || "unavailable")}">
    <div class="rcap-state">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(availability.reason || "This surface could not be loaded. Nothing has been changed.")}</p>
    </div>
  </section>`;
}

function sourcePanelHtml(panel) {
  const sources = Array.isArray(panel?.sources) ? panel.sources : [];
  const blocker = panel?.blocker || null;
  return `<section class="rcap-card rcap-sources" aria-labelledby="rcap-sources-title">
    <div class="rcap-card-head">
      <h2 id="rcap-sources-title">Sources</h2>
      <small>${escapeHtml(String(panel?.readable || 0))} of ${escapeHtml(String(panel?.total || 0))} read</small>
    </div>
    <div class="rcap-card-body">
      ${blocker
        ? `<div class="rcap-source-blocker" role="note" data-rcap-source-blocker>
            <strong>${escapeHtml(blocker.whatIsBlocked)}</strong>
            <dl>
              <dt>Why</dt><dd>${escapeHtml(blocker.whyBlocked)}</dd>
              <dt>Still possible</dt><dd>${escapeHtml(blocker.whatCanContinue)}</dd>
              <dt>Owner</dt><dd>${escapeHtml(blocker.owner)}</dd>
              <dt>Needed</dt><dd>${escapeHtml(blocker.requiredDecision)}</dd>
            </dl>
          </div>`
        : ""}
      ${sources.length
        ? `<ul class="rcap-source-list">${sources.map((source) => `<li data-rcap-source="${escapeHtml(source.id)}" data-rcap-access="${escapeHtml(source.accessState)}">
            <span class="rcap-source-title">${source.ref && source.readable
              ? `<a href="${escapeHtml(source.ref)}" rel="noreferrer noopener" target="_blank">${escapeHtml(source.title)}</a>`
              : escapeHtml(source.title)}</span>
            <span class="rcap-pill ${source.readable ? "is-good" : source.blocking ? "is-warn" : ""}">${escapeHtml(source.accessLabel)}</span>
            <span class="rcap-source-meta">${escapeHtml(source.kindLabel)}${source.retrievedAt ? ` · read ${escapeHtml(shortDate(source.retrievedAt))}` : ""}</span>
            ${source.unreadableReason ? `<p class="rcap-source-reason">${escapeHtml(source.unreadableReason)}</p>` : ""}
          </li>`).join("")}</ul>`
        : `<p class="rcap-empty-note">No documents have been linked to this organization yet.</p>`}
    </div>
  </section>`;
}

function claimHtml(claim) {
  return `<li class="rcap-claim" data-rcap-claim="${escapeHtml(claim.id)}" data-rcap-fact="${escapeHtml(claim.factClass)}">
    <span class="rcap-factlabel ${escapeHtml(claim.factStyle)}">${escapeHtml(claim.factLabel)}</span>
    <p class="rcap-claim-text">${escapeHtml(claim.text)}</p>
    ${claim.sources.length
      ? `<p class="rcap-claim-sources">From ${claim.sources.map((source) => source.ref && source.readable
        ? `<a href="${escapeHtml(source.ref)}" rel="noreferrer noopener" target="_blank">${escapeHtml(source.title)}</a>`
        : escapeHtml(source.title)).join(", ")}</p>`
      : claim.citationMissing
        ? `<p class="rcap-claim-warning">This states something about the organization but cites no source.</p>`
        : ""}
  </li>`;
}

function sectionActionsHtml(section) {
  return `<div class="rcap-section-actions">${section.actions.map((action) => action.available
    ? `<button type="button" class="${action.destructive ? "rcap-secondary is-destructive" : "rcap-secondary"}" data-rcap-profile-action="${escapeHtml(action.key)}" data-rcap-target-section="${escapeHtml(section.key)}"${action.confirm ? ` data-rcap-confirm="${escapeHtml(action.confirm)}"` : ""}>${escapeHtml(action.label)}</button>`
    : `<span class="rcap-action-unavailable"><button type="button" class="rcap-secondary" disabled>${escapeHtml(action.label)}</button><small>${escapeHtml(action.reason)}</small></span>`).join("")}</div>`;
}

function sectionHtml(section) {
  return `<article class="rcap-section" id="rcap-section-${escapeHtml(section.key)}" data-rcap-section="${escapeHtml(section.key)}" data-rcap-section-state="${escapeHtml(section.state)}" aria-labelledby="rcap-section-title-${escapeHtml(section.key)}">
    <div class="rcap-section-head">
      <h3 id="rcap-section-title-${escapeHtml(section.key)}"><span class="rcap-section-number">${escapeHtml(String(section.number))}</span>${escapeHtml(section.label)}</h3>
      <span class="rcap-pill ${section.state === "approved" ? "is-good" : section.state === "conflict" ? "is-urgent" : section.state === "stale" || section.state === "blocked" ? "is-warn" : ""}">${escapeHtml(section.stateLabel)}</span>
    </div>

    ${section.conflict
      ? `<div class="rcap-conflict" role="note" data-rcap-conflict>
          <strong>Edited by ${escapeHtml(section.conflict.editedBy)}, and the sources have moved since</strong>
          <p>${escapeHtml(section.conflict.reason)}</p>
          <ul>${section.conflict.choices.map((choice) => `<li><b>${escapeHtml(choice.label)}</b> — ${escapeHtml(choice.consequence)}</li>`).join("")}</ul>
          <div class="rcap-section-actions">
            <button type="button" class="rcap-secondary" data-rcap-profile-action="keep_human_edit" data-rcap-target-section="${escapeHtml(section.key)}">Keep the edit</button>
          </div>
        </div>`
      : ""}

    ${section.present
      ? `<div class="rcap-section-body">${section.body.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>`
      : `<p class="rcap-empty-note" data-rcap-empty>${escapeHtml(section.emptyReason)}</p>`}

    ${section.humanEdited && !section.conflict
      ? `<p class="rcap-section-note">Edited by ${escapeHtml(section.editedBy || "a person")}${section.editedAt ? ` on ${escapeHtml(shortDate(section.editedAt))}` : ""}. Regenerating would replace it.</p>`
      : ""}
    ${section.blockedReason ? `<p class="rcap-section-note">${escapeHtml(section.blockedReason)}</p>` : ""}

    ${section.claims.length
      ? `<details class="rcap-evidence"${section.state === "conflict" ? " open" : ""}>
          <summary>${escapeHtml(String(section.claims.length))} claim${section.claims.length === 1 ? "" : "s"}${section.sourceCount ? ` from ${escapeHtml(String(section.sourceCount))} source${section.sourceCount === 1 ? "" : "s"}` : ""}</summary>
          <ul class="rcap-claims">${section.claims.map(claimHtml).join("")}</ul>
        </details>`
      : ""}

    ${section.unknowns.length
      ? `<div class="rcap-unknowns">
          <h4>Open questions</h4>
          <ul>${section.unknowns.map((unknown) => `<li>
            <span class="rcap-unknown-question">${escapeHtml(unknown.question)}</span>
            <span class="rcap-unknown-meta">Why it matters: ${escapeHtml(unknown.whyItMatters)}</span>
            <span class="rcap-unknown-meta">How to resolve: ${escapeHtml(unknown.howToResolve)}</span>
          </li>`).join("")}</ul>
        </div>`
      : ""}

    ${sectionActionsHtml(section)}
  </article>`;
}

function correctionsHtml(corrections) {
  if (!corrections.length) return "";
  return `<section class="rcap-card rcap-corrections" aria-labelledby="rcap-corrections-title">
    <div class="rcap-card-head">
      <h2 id="rcap-corrections-title">Proposed CRM corrections</h2>
      <small>${escapeHtml(String(corrections.length))} proposed</small>
    </div>
    <div class="rcap-card-body">
      <p class="rcap-empty-note">Accepting a correction records the decision. Applying it to the account record is a separate step and does not happen here.</p>
      <ul class="rcap-correction-list">${corrections.map((correction) => `<li data-rcap-correction="${escapeHtml(correction.id)}" data-rcap-correction-state="${escapeHtml(correction.state)}">
        <span class="rcap-correction-field">${escapeHtml(correction.field.replaceAll("_", " "))}</span>
        <span class="rcap-correction-change"><s>${escapeHtml(correction.currentValue)}</s> → <b>${escapeHtml(correction.proposedValue)}</b></span>
        ${correction.rationale ? `<span class="rcap-correction-why">${escapeHtml(correction.rationale)}</span>` : ""}
        ${correction.state === "conflict"
          ? `<p class="rcap-claim-warning">The account now reads “${escapeHtml(correction.conflictValue)}”, which is newer than this research. Re-run the research before deciding.</p>`
          : correction.state !== "proposed"
            ? `<span class="rcap-pill">${escapeHtml(correction.state === "accepted" ? "Accepted — not applied to the account" : "Rejected")}</span>`
            : correction.decidable
              ? `<span class="rcap-section-actions">
                  <button type="button" class="rcap-secondary" data-rcap-profile-action="accept_correction" data-rcap-correction="${escapeHtml(correction.id)}">Accept</button>
                  <button type="button" class="rcap-secondary" data-rcap-profile-action="reject_correction" data-rcap-correction="${escapeHtml(correction.id)}">Reject</button>
                </span>`
              : `<span class="rcap-action-unavailable"><small>Your role cannot decide corrections.</small></span>`}
      </li>`).join("")}</ul>
    </div>
  </section>`;
}

function runBannerHtml(profile) {
  const run = profile.run;
  if (!run) return "";
  if (run.status === "blocked") {
    return `<div class="rcap-run-banner is-blocked" role="note" data-rcap-run-state="blocked">
      <strong>Research is blocked</strong>
      <p>${escapeHtml(run.reason)}</p>
    </div>`;
  }
  if (run.status === "failed") {
    return `<div class="rcap-run-banner is-failed" role="note" data-rcap-run-state="failed">
      <strong>The last research run failed</strong>
      <p>${escapeHtml(run.reason)} Attempt ${escapeHtml(String(run.attempt))}.</p>
    </div>`;
  }
  if (run.status === "queued" || run.status === "running") {
    return `<div class="rcap-run-banner" role="status" data-rcap-run-state="${escapeHtml(run.status)}">
      <strong>${escapeHtml(run.status === "queued" ? "Research is queued" : "Research is running")}</strong>
      <p>Nothing on this page changes until it finishes.</p>
    </div>`;
  }
  return "";
}

function comparisonHtml(comparison) {
  if (!comparison?.available) return "";
  const changed = comparison.sections.filter((entry) => entry.change !== "unchanged");
  return `<details class="rcap-card rcap-comparison" data-rcap-comparison>
    <summary>Compare with version ${escapeHtml(String(comparison.fromVersion))}${comparison.identical ? " — no sections changed" : ` — ${escapeHtml(String(comparison.changedCount))} section${comparison.changedCount === 1 ? "" : "s"} changed`}</summary>
    <div class="rcap-card-body">
      ${comparison.identical
        ? `<p class="rcap-empty-note">Version ${escapeHtml(String(comparison.toVersion))} is identical to version ${escapeHtml(String(comparison.fromVersion))}.</p>`
        : `<ul class="rcap-diff">${changed.map((entry) => `<li data-rcap-diff="${escapeHtml(entry.sectionKey)}" data-rcap-change="${escapeHtml(entry.change)}">
            <span class="rcap-diff-section">${escapeHtml(String(entry.sectionNumber))}. ${escapeHtml(entry.sectionLabel)}</span>
            <span class="rcap-pill ${entry.change === "added" ? "is-good" : entry.change === "removed" ? "is-urgent" : "is-info"}">${escapeHtml(entry.change)}</span>
            ${entry.before ? `<p class="rcap-diff-before">${escapeHtml(entry.before)}</p>` : ""}
            ${entry.after ? `<p class="rcap-diff-after">${escapeHtml(entry.after)}</p>` : ""}
          </li>`).join("")}</ul>`}
    </div>
  </details>`;
}

function sectionIndexHtml(groups) {
  return `<nav class="rcap-section-index" aria-label="Profile sections">
    ${groups.map((group) => `<div class="rcap-index-group">
      <h2>${escapeHtml(group.label)}</h2>
      <ul>${group.sections.map((section) => `<li><a href="#rcap-section-${escapeHtml(section.key)}" data-rcap-index="${escapeHtml(section.key)}" data-rcap-index-state="${escapeHtml(section.state)}">
        <span class="rcap-index-number">${escapeHtml(String(section.number))}</span>
        <span class="rcap-index-label">${escapeHtml(section.label)}</span>
        <span class="rcap-index-state">${escapeHtml(section.present ? section.stateLabel : "Not started")}</span>
      </a></li>`).join("")}</ul>
    </div>`).join("")}
  </nav>`;
}

// ---------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------

export function rcapProfileWorkspaceHtml(profile) {
  if (!profile || profile.available !== true) return profileStateHtml(profile);

  const status = profile.status || {};
  const completeness = profile.completeness || {};
  const conflicts = Array.isArray(profile.conflicts) ? profile.conflicts : [];

  return `<section class="rcap-page rcap-profile-page" data-rcap-profile data-rcap-profile-state="ready" data-rcap-account="${escapeHtml(profile.account.id)}"${profile.version ? ` data-rcap-version="${escapeHtml(profile.version.contentHash)}"` : ""}${conflicts.length ? ' data-rcap-has-conflict="true"' : ""}>
    <p class="rcap-announcement" role="status" aria-live="polite" data-rcap-announce></p>

    <header class="rcap-header">
      <div>
        <p class="rcap-eyebrow">Research profile</p>
        <h1>${escapeHtml(profile.account.name)}</h1>
        <p class="rcap-subtitle">${escapeHtml(String(completeness.present || 0))} of ${escapeHtml(String(completeness.total || 15))} sections have content${profile.version ? ` · version ${escapeHtml(String(profile.version.number))}` : ""}.</p>
      </div>
      <div class="rcap-header-actions">
        <a class="rcap-secondary" href="${escapeHtml(profile.account.overviewHref)}">Back to Overview</a>
      </div>
    </header>

    <p class="rcap-status-line">
      <span class="rcap-pill ${status.successful ? "is-good" : status.key === "blocked" || status.key === "failed" ? "is-urgent" : "is-info"}" data-rcap-profile-status="${escapeHtml(status.key || "not_started")}">${escapeHtml(status.label || "Not started")}</span>
      ${status.key === "disqualified" && status.disqualificationReason
        ? `<span class="rcap-status-reason">${escapeHtml(status.disqualificationReason)} This is a completed research outcome, not a gap.</span>`
        : ""}
    </p>

    ${runBannerHtml(profile)}

    ${conflicts.length
      ? `<div class="rcap-conflict-summary" role="note" data-rcap-conflict-summary>
          <strong>${escapeHtml(String(conflicts.length))} section${conflicts.length === 1 ? " needs" : "s need"} a decision</strong>
          <p>Someone edited ${conflicts.length === 1 ? "it" : "them"} by hand and the sources have changed since. Nothing has been overwritten.</p>
          <ul>${conflicts.map((conflict) => `<li><a href="#rcap-section-${escapeHtml(conflict.sectionKey)}">${escapeHtml(conflict.sectionLabel)}</a> — ${escapeHtml(conflict.reason)}</li>`).join("")}</ul>
        </div>`
      : ""}

    <div class="rcap-profile-layout">
      ${sectionIndexHtml(profile.groups)}
      <div class="rcap-profile-main">
        ${comparisonHtml(profile.comparison)}
        ${correctionsHtml(profile.corrections)}
        ${profile.groups.map((group) => `<section class="rcap-section-group" aria-labelledby="rcap-group-${escapeHtml(group.key)}">
          <h2 class="rcap-group-title" id="rcap-group-${escapeHtml(group.key)}">${escapeHtml(group.label)}</h2>
          ${group.sections.map(sectionHtml).join("")}
        </section>`).join("")}
      </div>
      <aside class="rcap-profile-rail">${sourcePanelHtml(profile.sourcePanel)}</aside>
    </div>
  </section>`;
}

export function rcapProfileLoadingHtml() {
  return `<section class="rcap-page rcap-profile-page" data-rcap-profile data-rcap-profile-state="loading" aria-busy="true">
    <p class="rcap-announcement" role="status" aria-live="polite">Loading the research profile.</p>
    <div class="rcap-state"><h2>Loading the research profile</h2><p>Reading the recorded sources and sections.</p></div>
  </section>`;
}

// ---------------------------------------------------------------------------------------------
// Browser runtime
// ---------------------------------------------------------------------------------------------

export function rcapProfileBrowserSource() {
  const loadingHtml = JSON.stringify(rcapProfileLoadingHtml()).replaceAll("<", "\\u003c");
  const renderer = [
    `const escapeHtml=${escapeHtml.toString()};`,
    `const shortDate=${shortDate.toString()};`,
    `const profileStateHtml=${profileStateHtml.toString()};`,
    `const sourcePanelHtml=${sourcePanelHtml.toString()};`,
    `const claimHtml=${claimHtml.toString()};`,
    `const sectionActionsHtml=${sectionActionsHtml.toString()};`,
    `const sectionHtml=${sectionHtml.toString()};`,
    `const correctionsHtml=${correctionsHtml.toString()};`,
    `const runBannerHtml=${runBannerHtml.toString()};`,
    `const comparisonHtml=${comparisonHtml.toString()};`,
    `const sectionIndexHtml=${sectionIndexHtml.toString()};`,
    `const rcapProfileWorkspaceHtml=${rcapProfileWorkspaceHtml.toString()};`
  ].join("\n");

  return `(() => { "use strict";
    const loadingHtml=${loadingHtml};
    ${renderer}
    const endpoint=${JSON.stringify(RCAP_PROFILE_ENDPOINT)};
    const metrics={ requests:0, mutations:0, externalActions:0, sends:0, fullStateReads:0 };
    window.__LE_RCAP_PROFILE_METRICS=metrics;
    let inFlight=false; let sessionEnded=false; let loadingUrl="";

    function section(){ return document.querySelector("main#app #partners.page-section.active") || document.querySelector("main#app #partners"); }
    function host(){
      const root=section(); if(!root) return null;
      let slot=root.querySelector("[data-rcap-profile-slot]");
      if(!slot){ slot=document.createElement("div"); slot.setAttribute("data-rcap-profile-slot",""); root.prepend(slot); }
      return slot;
    }
    // OWNERSHIP. The list runtime stands down on this pane, so hiding the legacy Partners content
    // becomes this runtime's job. Without it the old page renders underneath the profile and the
    // founder reads two surfaces at once -- which axe notices first, as the old page's contrast.
    function setLegacyHidden(hidden){
      const root=section(); if(!root) return;
      for(const child of [...root.children]){
        if(child.hasAttribute&&(child.hasAttribute("data-rcap-profile-slot")||child.hasAttribute("data-rcap-slot"))) continue;
        if(hidden) child.setAttribute("hidden",""); else child.removeAttribute("hidden");
      }
    }
    function hashQuery(){ return new URLSearchParams(String(location.hash||"").split("?")[1]||""); }
    function onRoute(){
      const resolved=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");
      const route=resolved?.kind==="page"?resolved.canonicalRoute:"";
      const query=hashQuery();
      return route==="partners" && query.get("view")==="rcap-prospects" && query.get("pane")==="profile" && Boolean(query.get("account"));
    }
    function accountId(){ return hashQuery().get("account")||""; }
    function csrf(){ const prefix="leos_csrf="; return String(document.cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith(prefix))?.slice(prefix.length)||""; }
    function requestId(){ return "rcapprof_"+(globalThis.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(16).slice(2)).replaceAll("-","_"); }
    function announce(message){ const node=host()?.querySelector("[data-rcap-announce]"); if(node) node.textContent=message; }
    function leaveRoute(){ const root=section(); if(!root) return; const slot=root.querySelector("[data-rcap-profile-slot]"); if(slot) slot.remove(); if(hashQuery().get("view")!=="rcap-prospects") setLegacyHidden(false); }

    function render(html){ const slot=host(); if(slot){ slot.innerHTML=html; setLegacyHidden(true); } }

    async function load(){
      if(sessionEnded||!onRoute()) return;
      const id=accountId(); if(!id) return;
      const url=endpoint+"?account="+encodeURIComponent(id);
      if(loadingUrl===url) return;
      loadingUrl=url;
      render(loadingHtml);
      try{
        metrics.requests+=1;
        const response=await fetch(url,{ headers:{ "accept":"application/json" }, credentials:"same-origin" });
        if(response.status===401||response.status===403){ sessionEnded=response.status===401; render(profileStateHtml({ availability:{ state:"unauthorized", reason:"You do not have access to RCAP prospect research." } })); return; }
        const payload=await response.json();
        if(!onRoute()) return;
        render(rcapProfileWorkspaceHtml(payload&&payload.profile));
      }catch{
        render(profileStateHtml({ availability:{ state:"unavailable", reason:"The research profile could not be loaded. Nothing has been changed." } }));
      }finally{ loadingUrl=""; }
    }

    async function act(button){
      if(inFlight) return;
      const root=host()?.querySelector("[data-rcap-profile]");
      const expectedVersion=root?.getAttribute("data-rcap-version")||"";
      const action=button.getAttribute("data-rcap-profile-action");
      const confirmText=button.getAttribute("data-rcap-confirm")||"";
      if(confirmText && !window.confirm(confirmText)) return;
      const payload={ action, accountId:accountId(), expectedVersion, requestId:requestId() };
      const sectionKey=button.getAttribute("data-rcap-target-section"); if(sectionKey) payload.sectionKey=sectionKey;
      const correctionId=button.getAttribute("data-rcap-correction"); if(correctionId) payload.correctionId=correctionId;
      if(action==="reject_section"){
        const reason=window.prompt("What is wrong with this section?")||"";
        if(!reason.trim()) return;
        payload.reason=reason.trim();
      }
      if(action==="edit_section"){
        const current=root?.querySelector('[data-rcap-section="'+sectionKey+'"] .rcap-section-body')?.textContent||"";
        const next=window.prompt("Edit this section.",current.trim());
        if(next===null||!next.trim()) return;
        payload.body=next.trim();
      }
      if(action==="regenerate_section" && confirmText) payload.replaceHumanEdits=true;

      inFlight=true; button.disabled=true;
      try{
        metrics.mutations+=1;
        const response=await fetch(endpoint,{
          method:"POST",
          headers:{ "content-type":"application/json", "accept":"application/json", "x-csrf-token":csrf() },
          credentials:"same-origin",
          body:JSON.stringify(payload)
        });
        const result=await response.json().catch(()=>({}));
        if(response.status===409){ announce(result.error||"This profile changed since you read it."); loadingUrl=""; await load(); return; }
        if(!response.ok){ announce(result.error||"That action did not complete. Nothing has been changed."); return; }
        announce(result.note||"Done.");
        loadingUrl="";
        await load();
      }catch{
        announce("That action did not complete. Nothing has been changed.");
      }finally{ inFlight=false; button.disabled=false; }
    }

    function mount(){ if(onRoute()) load(); else leaveRoute(); }

    document.addEventListener("click",(event)=>{
      if(!onRoute()) return;
      // The section index is made of real links, because a list of destinations should be
      // announced as links and reachable by keyboard. But this application routes on the hash,
      // so letting the browser follow "#rcap-section-x" would replace the route and unmount the
      // page the reader is trying to scroll. The link scrolls instead, and moves focus with it.
      const jump=event.target.closest?.("[data-rcap-index]");
      if(jump){
        const key=jump.getAttribute("data-rcap-index");
        const target=host()?.querySelector('article[data-rcap-section="'+key+'"]');
        if(target){
          event.preventDefault();
          target.scrollIntoView({ block:"start", behavior:"auto" });
          const heading=target.querySelector("h3");
          if(heading){ heading.setAttribute("tabindex","-1"); heading.focus({ preventScroll:true }); }
        }
        return;
      }
      const button=event.target.closest?.("[data-rcap-profile-action]");
      if(!button) return;
      event.preventDefault();
      act(button);
    });

    window.addEventListener("hashchange",()=>{ loadingUrl=""; mount(); });
    const observed=document.querySelector("main#app");
    if(observed) new MutationObserver(()=>{ if(onRoute()&&!host()?.querySelector("[data-rcap-profile]")) mount(); })
      .observe(observed,{ childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    mount();
  })();`;
}
