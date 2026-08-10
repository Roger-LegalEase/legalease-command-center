// The rendered Prospect Activity workspace (Wave 3, Packet 8).
//
// One column, newest first, with filter chips above it and a page control below. The renderers
// are pure functions of the payload the activity endpoint returns, so the surface can be proven
// without a browser; they are also serialised into the lazy runtime, so they close over nothing.
//
// The page's only real opinion is that it never rounds a truth state up. "Prepared" is rendered
// as prepared, an ambiguous provider outcome as "outcome unknown", and an open task as still
// open -- so a reader scanning the column cannot mistake work that was started for work that
// landed.

const clean = (value = "") => String(value ?? "").trim();

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export const RCAP_ACTIVITY_STYLESHEET_PATH = "/assets/ui/rcap-activity.css";
export const RCAP_ACTIVITY_ENDPOINT = "/api/ui/rcap-activity";

// An outcome that means the thing did NOT land gets the cautious register. Rule 15: no fake
// success, and "sent" must not look like "prepared".
const LANDED = new Set(["sent", "delivered", "replied", "received", "completed"]);
const CAUTION = new Set(["unknown", "failed", "bounced", "unsubscribed", "open"]);

function outcomeClass(outcome) {
  if (!outcome) return "";
  if (LANDED.has(outcome.key)) return "is-good";
  if (CAUTION.has(outcome.key)) return "is-warn";
  return "is-info";
}

function activityStateHtml(activity) {
  const availability = activity?.availability || {};
  const heading = availability.state === "feature_off"
    ? "The RCAP prospect workspace is not enabled"
    : availability.state === "not_found_or_unauthorized"
      ? "That organization is not available"
      : "Activity is unavailable";
  return `<section class="rcap-activity-page" data-rcap-activity data-rcap-activity-state="${escapeHtml(availability.state || "unavailable")}">
    <div class="rcap-state">
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(availability.reason || "This surface could not be loaded. Nothing has been changed.")}</p>
    </div>
  </section>`;
}

function filtersHtml(filters) {
  const chip = (entry, active, showCount) => `<a href="${escapeHtml(entry.href)}" data-rcap-activity-filter="${escapeHtml(entry.key)}"${active ? ' class="is-active" aria-current="true"' : ""}>${escapeHtml(entry.label)}${showCount ? `<span>${escapeHtml(String(entry.count))}</span>` : ""}</a>`;
  return `<nav class="rcap-activity-filters" aria-label="Filter activity">
    <div class="rcap-filter-row">
      <a href="${escapeHtml(filters.clearHref)}" data-rcap-activity-filter="all"${!filters.kind && !filters.direction ? ' class="is-active" aria-current="true"' : ""}>Everything</a>
      ${filters.kinds.map((entry) => chip(entry, filters.kind === entry.key, true)).join("")}
    </div>
    <div class="rcap-filter-row">
      ${filters.directions.map((entry) => chip(entry, filters.direction === entry.key, false)).join("")}
    </div>
  </nav>`;
}

function entryHtml(entry) {
  return `<li class="rcap-activity-entry" data-rcap-entry="${escapeHtml(entry.id)}" data-rcap-entry-kind="${escapeHtml(entry.kind)}"${entry.outcome ? ` data-rcap-outcome="${escapeHtml(entry.outcome.key)}"` : ""}>
    <span class="rcap-entry-when">${entry.dateKnown
      ? escapeHtml(entry.dateLabel)
      : `<span class="rcap-unknown">No date recorded</span>`}</span>
    <div class="rcap-entry-body">
      <p class="rcap-entry-title">${escapeHtml(entry.title)}</p>
      <p class="rcap-entry-meta">
        <span class="rcap-pill">${escapeHtml(entry.kindLabel)}</span>
        ${entry.directionLabel ? `<span class="rcap-entry-direction">${escapeHtml(entry.directionLabel)}</span>` : ""}
        ${entry.outcome ? `<span class="rcap-pill ${escapeHtml(outcomeClass(entry.outcome))}">${escapeHtml(entry.outcome.label)}</span>` : ""}
        ${entry.actor ? `<span class="rcap-entry-actor">${escapeHtml(entry.actor)}</span>` : ""}
      </p>
      ${entry.summary ? `<p class="rcap-entry-summary">${escapeHtml(entry.summary)}</p>` : ""}
      ${entry.linked
        ? `<p class="rcap-entry-link"><a href="${escapeHtml(entry.href)}" rel="noreferrer noopener" target="_blank">Open the thread in Gmail</a></p>`
        : ""}
    </div>
  </li>`;
}

function paginationHtml(pagination) {
  if (!pagination.previousHref && !pagination.nextHref) return "";
  const from = pagination.total === 0 ? 0 : pagination.offset + 1;
  const to = Math.min(pagination.offset + pagination.limit, pagination.total);
  return `<nav class="rcap-activity-pages" aria-label="Activity pages">
    <p>${escapeHtml(String(from))}–${escapeHtml(String(to))} of ${escapeHtml(String(pagination.total))}</p>
    <span>
      ${pagination.previousHref ? `<a class="rcap-secondary" href="${escapeHtml(pagination.previousHref)}" data-rcap-activity-page="previous">Newer</a>` : ""}
      ${pagination.nextHref ? `<a class="rcap-secondary" href="${escapeHtml(pagination.nextHref)}" data-rcap-activity-page="next">Older</a>` : ""}
    </span>
  </nav>`;
}

export function rcapActivityWorkspaceHtml(activity) {
  if (!activity || activity.available !== true) return activityStateHtml(activity);

  const pagination = activity.pagination || {};
  return `<section class="rcap-page rcap-activity-page" data-rcap-activity data-rcap-activity-state="ready" data-rcap-account="${escapeHtml(activity.account.id)}">
    <p class="rcap-announcement" role="status" aria-live="polite" data-rcap-announce></p>

    <header class="rcap-header">
      <div>
        <p class="rcap-eyebrow">Activity</p>
        <h1>${escapeHtml(activity.account.name)}</h1>
        <p class="rcap-subtitle">${escapeHtml(String(pagination.totalUnfiltered || 0))} recorded ${pagination.totalUnfiltered === 1 ? "entry" : "entries"}. Newest first.</p>
      </div>
      <div class="rcap-header-actions">
        <a class="rcap-secondary" href="${escapeHtml(activity.account.overviewHref)}">Back to Overview</a>
      </div>
    </header>

    ${filtersHtml(activity.filters)}

    ${activity.entries.length
      ? `<ol class="rcap-activity-list">${activity.entries.map(entryHtml).join("")}</ol>`
      : `<div class="rcap-state" data-rcap-activity-empty="${escapeHtml(activity.emptyState.state)}">
          <h2>${escapeHtml(activity.emptyState.state === "no_history" ? "Nothing recorded yet" : activity.emptyState.state === "filtered_out" ? "Nothing matches this filter" : "Nothing further back")}</h2>
          <p>${escapeHtml(activity.emptyState.reason)}</p>
        </div>`}

    ${paginationHtml(pagination)}
  </section>`;
}

export function rcapActivityLoadingHtml() {
  return `<section class="rcap-page rcap-activity-page" data-rcap-activity data-rcap-activity-state="loading" aria-busy="true">
    <p class="rcap-announcement" role="status" aria-live="polite">Loading recorded activity.</p>
    <div class="rcap-state"><h2>Loading recorded activity</h2><p>Reading the correspondence, tasks, notes and files already on record.</p></div>
  </section>`;
}

export function rcapActivityBrowserSource() {
  const loadingHtml = JSON.stringify(rcapActivityLoadingHtml()).replaceAll("<", "\\u003c");
  const renderer = [
    `const escapeHtml=${escapeHtml.toString()};`,
    `const LANDED=new Set(${JSON.stringify([...LANDED])});`,
    `const CAUTION=new Set(${JSON.stringify([...CAUTION])});`,
    `const outcomeClass=${outcomeClass.toString()};`,
    `const activityStateHtml=${activityStateHtml.toString()};`,
    `const filtersHtml=${filtersHtml.toString()};`,
    `const entryHtml=${entryHtml.toString()};`,
    `const paginationHtml=${paginationHtml.toString()};`,
    `const rcapActivityWorkspaceHtml=${rcapActivityWorkspaceHtml.toString()};`
  ].join("\n");

  return `(() => { "use strict";
    const loadingHtml=${loadingHtml};
    ${renderer}
    const endpoint=${JSON.stringify(RCAP_ACTIVITY_ENDPOINT)};
    const metrics={ requests:0, mutations:0, externalActions:0, sends:0 };
    window.__LE_RCAP_ACTIVITY_METRICS=metrics;
    let sessionEnded=false; let loadingUrl="";

    function section(){ return document.querySelector("main#app #partners.page-section.active") || document.querySelector("main#app #partners"); }
    function host(){
      const root=section(); if(!root) return null;
      let slot=root.querySelector("[data-rcap-activity-slot]");
      if(!slot){ slot=document.createElement("div"); slot.setAttribute("data-rcap-activity-slot",""); root.prepend(slot); }
      return slot;
    }
    // OWNERSHIP. The list runtime stands down on this pane, so hiding the legacy Partners content
    // is this runtime's job -- otherwise the old page renders underneath the timeline.
    function setLegacyHidden(hidden){
      const root=section(); if(!root) return;
      for(const child of [...root.children]){
        if(child.hasAttribute&&(child.hasAttribute("data-rcap-activity-slot")||child.hasAttribute("data-rcap-slot")||child.hasAttribute("data-rcap-profile-slot"))) continue;
        if(hidden) child.setAttribute("hidden",""); else child.removeAttribute("hidden");
      }
    }
    function hashQuery(){ return new URLSearchParams(String(location.hash||"").split("?")[1]||""); }
    function onRoute(){
      const resolved=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");
      const route=resolved?.kind==="page"?resolved.canonicalRoute:"";
      const query=hashQuery();
      return route==="partners" && query.get("view")==="rcap-prospects" && query.get("pane")==="activity" && Boolean(query.get("account"));
    }
    function leaveRoute(){ const root=section(); if(!root) return; const slot=root.querySelector("[data-rcap-activity-slot]"); if(slot) slot.remove(); if(hashQuery().get("view")!=="rcap-prospects") setLegacyHidden(false); }
    function render(html){ const slot=host(); if(slot){ slot.innerHTML=html; setLegacyHidden(true); } }

    function queryString(){
      const query=hashQuery();
      const out=new URLSearchParams();
      out.set("account", query.get("account")||"");
      for(const key of ["kind","direction","offset","limit"]){ const value=query.get(key); if(value) out.set(key, value); }
      return out.toString();
    }

    async function load(){
      if(sessionEnded||!onRoute()) return;
      const url=endpoint+"?"+queryString();
      if(loadingUrl===url) return;
      loadingUrl=url;
      render(loadingHtml);
      try{
        metrics.requests+=1;
        const response=await fetch(url,{ headers:{ "accept":"application/json" }, credentials:"same-origin" });
        if(response.status===401||response.status===403){ sessionEnded=response.status===401; render(activityStateHtml({ availability:{ state:"unauthorized", reason:"You do not have access to RCAP prospect activity." } })); return; }
        const payload=await response.json();
        if(!onRoute()) return;
        render(rcapActivityWorkspaceHtml(payload&&payload.activity));
      }catch{
        render(activityStateHtml({ availability:{ state:"unavailable", reason:"Recorded activity could not be loaded. Nothing has been changed." } }));
      }finally{ loadingUrl=""; }
    }

    function mount(){ if(onRoute()) load(); else leaveRoute(); }
    window.addEventListener("hashchange",()=>{ loadingUrl=""; mount(); });
    const observed=document.querySelector("main#app");
    if(observed) new MutationObserver(()=>{ if(onRoute()&&!host()?.querySelector("[data-rcap-activity]")) mount(); })
      .observe(observed,{ childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    mount();
  })();`;
}
