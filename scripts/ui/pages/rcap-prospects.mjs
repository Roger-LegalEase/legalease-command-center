// RCAP Prospect CRM — the rendered surfaces (Wave 1B).
//
// Wave 1A built the read models; this module is the presentation for them and nothing else.
// It renders what /api/ui/rcap-prospects returns: the saved-view list, and one account's
// Overview in its complete and blocked forms. It owns no data, derives no facts, and decides
// no policy — if a value is not in the payload it is not on the screen.
//
// Served as a LAZY RUNTIME FILE gated on COMMAND_CENTER_RCAP_CRM_V1, so a flag-off deployment
// never ships a byte of it and the Partners page it lives inside is byte-identical to today's.
//
// THREE RULES SHAPE EVERY RENDER DECISION BELOW.
//
// 1. Nothing here can send. The only write paths are the four safe relationship actions
//    (note, activity, next step, complete task), each posted to the existing endpoint with the
//    request id and expected version the contract requires. There is no send control, and
//    Draft email renders DISABLED with its reason until an Outreach Review surface exists —
//    a control that cannot finish its work must not look like one that can.
//
// 2. An absence is never a zero. `rcapValue`/`rcapCount` carry a truth state, and a value that
//    is not known renders as its own label in its own muted treatment. A count that could not
//    be read says "Unavailable".
//
// 3. Every function below is serialized with .toString() into the browser bundle, so none of
//    them may close over an import or a module-scope binding that is not itself serialized.
//    Add a helper here and you must add it to `rcapProspectsBrowserSource` too.

export const RCAP_PROSPECTS_STYLESHEET_PATH = "assets/ui/rcap-prospects.css";

// The client asks for exactly the shape the page needs; the server decides what it may see.
export const RCAP_PROSPECTS_ENDPOINT = "/api/ui/rcap-prospects";

// ---------------------------------------------------------------------------------------------
// Serialized helpers
// ---------------------------------------------------------------------------------------------

const clean = (value = "") => String(value ?? "").trim();

const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

// A payload value that carries a truth state. Known values render plainly; everything else
// renders its own honest label in the muted treatment, so "not known yet" can never be mistaken
// for a fact and an empty count can never be mistaken for zero.
function truth(value, fallback = "") {
  if (value && typeof value === "object" && "known" in value) {
    if (value.known) return escapeHtml(String(value.value));
    return `<span class="rcap-unknown">${escapeHtml(value.label || fallback || "Not known yet")}</span>`;
  }
  const text = clean(value);
  return text ? escapeHtml(text) : `<span class="rcap-unknown">${escapeHtml(fallback || "Not known yet")}</span>`;
}

function shortDate(value = "") {
  const text = clean(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parsed.getUTCMonth()]} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()}`;
}

function initials(name = "") {
  const parts = clean(name).split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]).join("").toUpperCase() || "?";
}

function pillClass(tone = "") {
  return ["urgent", "warn", "action", "info", "good"].includes(clean(tone)) ? ` is-${clean(tone)}` : "";
}

// ---------------------------------------------------------------------------------------------
// Page states
// ---------------------------------------------------------------------------------------------

function stateHtml(title, message, { retry = false } = {}) {
  return `<div class="rcap-state" role="status">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
    ${retry ? `<button type="button" class="rcap-secondary" data-rcap-retry>Try again</button>` : ""}
  </div>`;
}

export function rcapProspectsLoadingHtml() {
  return `<section class="rcap-page" data-rcap-prospects>
    <p class="rcap-announcement" role="status" data-rcap-announce>Loading RCAP prospects.</p>
    ${stateHtml("Loading RCAP prospects", "Reading the organizations, contacts, and next actions on record.")}
  </section>`;
}

// ---------------------------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------------------------

function summaryStripHtml(view) {
  const labels = {
    needs_research: "Needs research",
    needs_review: "Needs review",
    ready_to_contact: "Ready to contact",
    follow_up_due: "Follow-up due",
    replies: "Replies",
    blocked: "Blocked"
  };
  const entries = Object.entries(view.summary || {});
  if (!entries.length) return "";
  return `<div class="rcap-summary" role="group" aria-label="RCAP prospect counts">
    ${entries.map(([key, count]) => {
      const known = Boolean(count && count.known);
      const active = view.view === key;
      // An unreadable count says so. It is never rendered as 0.
      const display = known ? escapeHtml(String(count.value)) : "Unavailable";
      return `<button type="button" data-rcap-view="${escapeHtml(key)}"${active ? ' class="is-active" aria-current="true"' : ""}>
        <span class="rcap-summary-value${known ? "" : " is-unknown"}">${display}</span>
        <span class="rcap-summary-label">${escapeHtml(labels[key] || key)}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function savedViewsHtml(view) {
  const views = Array.isArray(view.savedViews) ? view.savedViews : [];
  if (!views.length) return "";
  return `<nav class="rcap-views" aria-label="Saved views">
    ${views.map((saved) => `<a href="${escapeHtml(saved.href)}" data-rcap-view="${escapeHtml(saved.key)}"${saved.active ? ' class="is-active" aria-current="page"' : ""}>${escapeHtml(saved.label)}${saved.count && saved.count.known ? `<span>${escapeHtml(String(saved.count.value))}</span>` : ""}</a>`).join("")}
  </nav>`;
}

function filterSelect(name, label, options, selected) {
  const list = Array.isArray(options) ? options : [];
  return `<label>${escapeHtml(label)}
    <select data-rcap-filter="${escapeHtml(name)}">
      <option value="">All</option>
      ${list.map((option) => `<option value="${escapeHtml(option.key)}"${clean(selected) === clean(option.key) ? " selected" : ""}>${escapeHtml(option.label)}${typeof option.count === "number" ? ` (${option.count})` : ""}</option>`).join("")}
    </select>
  </label>`;
}

function filtersHtml(view) {
  const filters = view.filters || {};
  const query = view.query || {};
  const research = [
    { key: "not_started", label: "Not started" },
    { key: "needs_review", label: "Needs review" },
    { key: "approved", label: "Approved" }
  ];
  const priorities = [
    { key: "critical", label: "Critical" }, { key: "high", label: "High" },
    { key: "medium", label: "Medium" }, { key: "low", label: "Low" }
  ];
  return `<div class="rcap-filters" role="group" aria-label="Filter prospects">
    ${filterSelect("stage", "Stage", filters.stages, query.stage)}
    ${filterSelect("priority", "Priority", priorities, query.priority)}
    ${filterSelect("owner", "Owner", filters.owners, query.owner)}
    ${filterSelect("geography", "State / geography", filters.geographies, query.geography)}
    ${filterSelect("research", "Research status", research, query.research)}
    ${filterSelect("attention", "Attention", filters.attention, query.attention)}
  </div>`;
}

function rowCells(row) {
  const contact = row.primaryContact || {};
  const contactLine = contact.name || contact.email
    ? `${escapeHtml(contact.name || contact.email)}${contact.name && contact.email ? `<span class="rcap-cell-sub">${escapeHtml(contact.email)}</span>` : ""}<span class="rcap-cell-sub">${escapeHtml(contact.eligibilityLabel || "")}</span>`
    : `<span class="rcap-unknown">No verified contact</span>`;
  const program = [row.programLabel, row.geographyLabel].filter(Boolean).join(" · ");
  return {
    program: program ? escapeHtml(program) : `<span class="rcap-unknown">Not known yet</span>`,
    contactLine,
    lastTouch: shortDate(row.lastTouch) || `<span class="rcap-unknown">No recorded touch</span>`,
    nextAction: row.nextAction ? escapeHtml(row.nextAction) : `<span class="rcap-unknown">No next action</span>`,
    owner: row.ownerLabel ? escapeHtml(row.ownerLabel) : `<span class="rcap-unknown">Unassigned</span>`
  };
}

function tableHtml(view) {
  const rows = Array.isArray(view.items) ? view.items : [];
  return `<div class="rcap-table-card">
    <div class="rcap-table-scroll">
      <table class="rcap-table">
        <caption>${escapeHtml(String(rows.length))} of ${view.totals && view.totals.matching && view.totals.matching.known ? escapeHtml(String(view.totals.matching.value)) : "an unavailable number of"} matching organizations.</caption>
        <thead><tr>
          <th scope="col">Account</th><th scope="col">Program / Geography</th><th scope="col">Stage</th>
          <th scope="col">Primary Contact</th><th scope="col">Last Touch</th><th scope="col">Next Action</th>
          <th scope="col">Owner</th><th scope="col">Attention</th>
        </tr></thead>
        <tbody>
          ${rows.map((row) => {
            const cells = rowCells(row);
            return `<tr data-rcap-row="${escapeHtml(row.id)}">
              <th scope="row"><a class="rcap-account-link" href="${escapeHtml(row.href)}" data-rcap-open="${escapeHtml(row.id)}">${escapeHtml(row.organizationName)}</a></th>
              <td>${cells.program}</td>
              <td><span class="rcap-pill">${escapeHtml(row.stage && row.stage.label ? row.stage.label : "Research")}</span></td>
              <td>${cells.contactLine}</td>
              <td>${cells.lastTouch}</td>
              <td>${cells.nextAction}</td>
              <td>${cells.owner}</td>
              <td>${row.attention && row.attention.key !== "none" ? `<span class="rcap-pill${pillClass(row.attention.tone)}">${escapeHtml(row.attention.label)}</span>` : `<span class="rcap-unknown">—</span>`}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  </div>`;
}

function cardsHtml(view) {
  const rows = Array.isArray(view.items) ? view.items : [];
  return `<div class="rcap-cards">
    ${rows.map((row) => {
      const contact = row.primaryContact || {};
      return `<article data-rcap-card="${escapeHtml(row.id)}">
        <h3><a href="${escapeHtml(row.href)}" data-rcap-open="${escapeHtml(row.id)}">${escapeHtml(row.organizationName)}</a></h3>
        <dl>
          <dt>Geography</dt><dd>${row.geographyLabel ? escapeHtml(row.geographyLabel) : `<span class="rcap-unknown">Not known yet</span>`}</dd>
          <dt>Stage</dt><dd>${escapeHtml(row.stage && row.stage.label ? row.stage.label : "Research")}</dd>
          <dt>Contact</dt><dd>${contact.name || contact.email ? escapeHtml(contact.name || contact.email) : `<span class="rcap-unknown">No verified contact</span>`}</dd>
          <dt>Next</dt><dd>${row.nextAction ? escapeHtml(row.nextAction) : `<span class="rcap-unknown">No next action</span>`}</dd>
        </dl>
        ${row.attention && row.attention.key !== "none" ? `<p><span class="rcap-pill${pillClass(row.attention.tone)}">${escapeHtml(row.attention.label)}</span></p>` : ""}
      </article>`;
    }).join("")}
  </div>`;
}

export function rcapProspectsListHtml(view) {
  const payload = view || {};
  const availability = payload.availability || {};

  const header = `<header class="rcap-header">
    <div>
      <p class="rcap-eyebrow">Relationships / RCAP</p>
      <h1>RCAP Prospects</h1>
      <p class="rcap-subtitle">Research, outreach, conversations, and partner conversion in one place.</p>
    </div>
    <div class="rcap-header-actions">
      ${payload.addProspect && payload.addProspect.available
        ? `<a class="rcap-primary" href="${escapeHtml(payload.addProspect.href)}">Add prospect</a>`
        : `<span><button type="button" class="rcap-primary" disabled aria-describedby="rcap-add-reason">Add prospect</button></span>`}
      ${payload.importPath && payload.importPath.available
        ? `<a class="rcap-secondary" href="${escapeHtml(payload.importPath.href)}">Import</a>`
        : `<button type="button" class="rcap-secondary" disabled>Import</button>`}
    </div>
  </header>
  ${payload.addProspect && payload.addProspect.available ? "" : `<p class="rcap-disabled-reason" id="rcap-add-reason">${escapeHtml((payload.addProspect && payload.addProspect.reason) || "Adding an RCAP prospect arrives with the guided Add Prospect flow in a later release.")}</p>`}`;

  if (payload.available === false) {
    const message = availability.state === "feature_off"
      ? "The RCAP prospect workspace is not enabled on this deployment."
      : availability.state === "not_authorized" || availability.state === "unauthorized"
        ? "You do not have access to RCAP prospect intelligence."
        : availability.reason || "The organizations behind this view could not be read. Nothing was changed.";
    const title = availability.state === "feature_off"
      ? "Not enabled"
      : availability.state === "not_authorized" || availability.state === "unauthorized"
        ? "Not available for your account"
        : "Source unavailable";
    return `<section class="rcap-page" data-rcap-prospects data-rcap-state="${escapeHtml(availability.state || "unavailable")}">
      <p class="rcap-announcement" role="status" data-rcap-announce>${escapeHtml(title)}</p>
      ${header}
      ${stateHtml(title, message, { retry: availability.state !== "feature_off" })}
    </section>`;
  }

  const rows = Array.isArray(payload.items) ? payload.items : [];
  const body = rows.length
    ? `${tableHtml(payload)}${cardsHtml(payload)}`
    : stateHtml(
      availability.state === "filtered_empty" ? "No prospects match these filters" : "No RCAP prospects yet",
      availability.reason || "Nothing matches the current view."
    );

  return `<section class="rcap-page" data-rcap-prospects data-rcap-state="${escapeHtml(availability.state || "ready")}">
    <p class="rcap-announcement" role="status" data-rcap-announce></p>
    ${header}
    ${summaryStripHtml(payload)}
    ${savedViewsHtml(payload)}
    ${filtersHtml(payload)}
    ${body}
  </section>`;
}

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

function tabsHtml(overview) {
  const views = Array.isArray(overview.views) ? overview.views : [];
  return `<nav class="rcap-tabs" aria-label="Account views">
    ${views.map((view) => (view.available && view.destinationBuilt
      ? `<a href="${escapeHtml(view.href)}"${view.active ? ' class="is-active" aria-current="page"' : ""}>${escapeHtml(view.label)}</a>`
      // Not built yet: rendered as inert text carrying its reason, never as a link to nothing.
      : `<span aria-disabled="true" title="${escapeHtml(view.unavailableReason || "Not available yet.")}">${escapeHtml(view.label)}</span>`)).join("")}
  </nav>`;
}

function accountHeaderHtml(overview) {
  const header = overview.header || {};
  const actions = Array.isArray(overview.actions) ? overview.actions : [];
  const meta = [
    header.programLabel && header.programLabel.known ? header.programLabel.value : "",
    header.organizationType && header.organizationType.known ? header.organizationType.value : "",
    header.geography && header.geography.known ? header.geography.value : ""
  ].filter(Boolean).join(" · ");

  return `<header class="rcap-account-header">
    <div class="rcap-identity">
      <span class="rcap-avatar" aria-hidden="true">${escapeHtml(initials(header.organizationName))}</span>
      <div>
        <p class="rcap-eyebrow">Relationships / RCAP Prospects</p>
        <h1>${escapeHtml(header.organizationName || "Untitled organization")}</h1>
        <p class="rcap-identity-meta">${meta ? escapeHtml(meta) : `<span class="rcap-unknown">Program and geography not known yet</span>`}</p>
        <p class="rcap-why">${truth(header.whyThisMatters, "No summary has been recorded for this organization yet.")}</p>
        <div class="rcap-chips">
          <span class="rcap-pill">${escapeHtml(header.stage && header.stage.label ? header.stage.label : "Research")}</span>
          <span class="rcap-pill">Priority: ${truth(header.priority, "not set")}</span>
          <span class="rcap-pill">Owner: ${truth(header.owner, "unassigned")}</span>
          <span class="rcap-pill">Profile: ${escapeHtml(header.profileStatus && header.profileStatus.label ? header.profileStatus.label : "Not started")}</span>
          <span class="rcap-pill">Last touch: ${truth(header.lastMeaningfulTouch, "none recorded")}</span>
        </div>
      </div>
    </div>
    <div class="rcap-header-actions">
      ${actions.map((action) => {
        if (action.key === "draft_email") {
          // Draft email can never send, and in Wave 1B it has nowhere safe to go: the Outreach
          // Review workspace does not exist. It renders disabled with the reason attached
          // rather than linking to a page that is not there.
          return `<span><button type="button" class="rcap-secondary" data-rcap-action="draft_email" disabled aria-describedby="rcap-draft-reason">Draft email</button></span>`;
        }
        return `<button type="button" class="rcap-secondary" data-rcap-action="${escapeHtml(action.key)}">${escapeHtml(action.label)}</button>`;
      }).join("")}
    </div>
  </header>
  ${actions.some((action) => action.key === "draft_email")
    ? `<p class="rcap-disabled-reason" id="rcap-draft-reason">Outreach Review arrives in a later release. Nothing can be drafted, scheduled, or sent from this page.</p>`
    : `<p class="rcap-disabled-reason" id="rcap-draft-reason">Outreach is blocked for this organization, so no message can be prepared.</p>`}`;
}

function nextBestStepHtml(overview) {
  const step = overview.nextBestStep || {};
  const blocker = step.blocker;
  if (!step.available) return "";

  // The header already carries Add note / Log activity / Set next step. When the step's
  // secondary is one of those, rendering it here would put two identical controls on one
  // screen -- which is exactly the duplicate-action problem the visual contract forbids, and
  // it makes the page ambiguous to a screen reader too. The secondary is dropped in that case;
  // the header's copy is the one that stays.
  const headerActionKeys = new Set((Array.isArray(overview.actions) ? overview.actions : []).map((action) => action.key));
  const secondary = step.secondaryAction && !headerActionKeys.has(step.secondaryAction.key) ? step.secondaryAction : null;

  const blockerHtml = blocker
    ? `<dl class="rcap-blocker">
        <dt>Blocked</dt><dd>${escapeHtml(blocker.whatIsBlocked)}</dd>
        <dt>Why</dt><dd>${escapeHtml(blocker.whyBlocked)}</dd>
        <dt>Still possible</dt><dd>${escapeHtml(blocker.whatCanContinue)}</dd>
        <dt>Owner</dt><dd>${escapeHtml(blocker.owner)}</dd>
        <dt>Needed</dt><dd>${escapeHtml(blocker.requiredDecision)}</dd>
      </dl>`
    : "";

  return `<section class="rcap-next${blocker ? " is-blocked" : ""}" aria-labelledby="rcap-next-title" data-rcap-next${blocker ? ' data-rcap-blocked="true"' : ""}>
    <div class="rcap-card-head"><small>${blocker ? "Outreach blocked" : "Next best step"}</small></div>
    <div class="rcap-card-body">
      <h2 id="rcap-next-title">${escapeHtml(step.title)}</h2>
      <p class="rcap-rationale">${escapeHtml(step.rationale)}</p>
      ${blockerHtml}
      <p class="rcap-next-meta">
        <span>Owner <strong>${escapeHtml(step.owner)}</strong></span>
        <span>Due <strong>${shortDate(step.dueAt) || "not set"}</strong></span>
        <span>Source <strong>${escapeHtml(step.recommendationSource)}</strong></span>
      </p>
      <div class="rcap-next-actions">
        ${blocker
          ? `<button type="button" class="rcap-primary" data-rcap-action="review_contacts">${escapeHtml(step.primaryAction.label)}</button>`
          : `<button type="button" class="rcap-primary" data-rcap-action="${escapeHtml(step.primaryAction.key)}">${escapeHtml(step.primaryAction.label)}</button>`}
        ${secondary ? `<button type="button" class="rcap-secondary" data-rcap-action="${escapeHtml(secondary.key)}">${escapeHtml(secondary.label)}</button>` : ""}
        ${step.snoozeAvailable ? `<button type="button" class="rcap-secondary" data-rcap-action="snooze_task">Snooze</button>` : ""}
      </div>
    </div>
  </section>`;
}

function snapshotHtml(overview) {
  const snapshot = overview.snapshot || {};
  const section = (title, value, factClass, factLabel) => `<section>
    <h3>${escapeHtml(title)}</h3>
    <p>${truth(value)} ${value && value.known ? `<span class="rcap-factlabel ${escapeHtml(factClass)}">${escapeHtml(factLabel)}</span>` : ""}</p>
  </section>`;
  return `<section class="rcap-card" aria-labelledby="rcap-snapshot-title">
    <div class="rcap-card-head"><h2 id="rcap-snapshot-title">Account snapshot</h2><small>${escapeHtml(snapshot.sourceNote ? "From recorded facts" : "")}</small></div>
    <div class="rcap-card-body">
      <div class="rcap-snapshot">
        ${section("What they do", snapshot.whatTheyDo, "is-verified", "Recorded")}
        ${section("Why RCAP may fit", snapshot.whyRcapMayFit, "is-inferred", "Inferred")}
        ${section("What not to pitch", snapshot.whatNotToPitch, "is-recommendation", "Recommendation")}
        ${section("Open question", snapshot.openQuestion, "is-question", "Open question")}
      </div>
      ${snapshot.sourceNote ? `<p class="rcap-empty-note" style="margin-top:12px">${escapeHtml(snapshot.sourceNote)}</p>` : ""}
    </div>
  </section>`;
}

function bestContactHtml(overview) {
  const contact = overview.bestContact || {};
  if (!contact.available) {
    return `<section class="rcap-card" aria-labelledby="rcap-contact-title">
      <div class="rcap-card-head"><h2 id="rcap-contact-title">Best first contact</h2><small>${escapeHtml(contact.stateLabel || "None")}</small></div>
      <div class="rcap-card-body"><p class="rcap-empty-note">${escapeHtml(contact.reason || "No published contact has been found for this organization yet.")}</p></div>
    </section>`;
  }
  const warnings = Array.isArray(contact.warnings) ? contact.warnings : [];
  const ladder = Array.isArray(contact.ladder) ? contact.ladder : [];
  return `<section class="rcap-card" aria-labelledby="rcap-contact-title">
    <div class="rcap-card-head"><h2 id="rcap-contact-title">Best first contact</h2><small>${escapeHtml(contact.stateLabel)}</small></div>
    <div class="rcap-card-body">
      <dl class="rcap-contact-grid">
        <div><dt>Name</dt><dd>${truth(contact.name)}</dd></div>
        <div><dt>Title</dt><dd>${truth(contact.title, "not verified")}</dd></div>
        <div><dt>Organization</dt><dd>${truth(contact.organization)}</dd></div>
        <div><dt>Email</dt><dd>${truth(contact.email, "no verified address")}</dd></div>
        <div><dt>Address type</dt><dd>${escapeHtml(contact.stateLabel)}</dd></div>
        <div><dt>Phone</dt><dd>${contact.phone && contact.phone.known ? escapeHtml(String(contact.phone.value)) : `<span class="rcap-unknown">No business line on record</span>`}</dd></div>
        <div><dt>Why this person</dt><dd>${escapeHtml(contact.reason)}</dd></div>
        <div><dt>Confidence</dt><dd>${truth(contact.confidence, "not scored")}</dd></div>
        <div><dt>Last verified</dt><dd>${truth(contact.lastVerifiedAt, "never")}</dd></div>
        <div><dt>Existing thread</dt><dd>${contact.existingThread ? "Yes — treat as follow-up" : `<span class="rcap-unknown">None found</span>`}</dd></div>
      </dl>
      ${warnings.length ? `<div class="rcap-warnings" role="note">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}
      ${ladder.length ? `<details class="rcap-ladder"><summary>Contact ladder (${ladder.length})</summary><ul>${ladder.map((entry) => `<li>${escapeHtml(entry.name || "Unnamed")}${entry.title ? ` — ${escapeHtml(entry.title)}` : ""}</li>`).join("")}</ul><p class="rcap-empty-note">Only one cold contact is active at a time.</p></details>` : ""}
    </div>
  </section>`;
}

function outreachPlanHtml(overview) {
  const plan = overview.outreachPlan || {};
  const steps = Array.isArray(plan.steps) ? plan.steps.slice(0, 4) : [];
  return `<section class="rcap-card" aria-labelledby="rcap-plan-title">
    <div class="rcap-card-head"><h2 id="rcap-plan-title">Outreach plan</h2><small>${escapeHtml(plan.label || "No approved plan")}</small></div>
    <div class="rcap-card-body">
      ${steps.length
        ? `<div class="rcap-steps">${steps.map((step) => `<article class="rcap-step">
            <div class="rcap-step-head"><strong>${escapeHtml(step.purpose)}</strong><span class="rcap-pill">${escapeHtml(step.state || "Planned")}</span></div>
            <dl>
              <dt>To</dt><dd>${escapeHtml(step.recipient || "—")}</dd>
              <dt>Channel</dt><dd>${escapeHtml(step.channel || "—")}</dd>
              <dt>Timing</dt><dd>${escapeHtml(step.timing || "—")}</dd>
              <dt>Adds</dt><dd>${escapeHtml(step.valueAdded || "—")}</dd>
            </dl>
          </article>`).join("")}</div>`
        : `<p class="rcap-empty-note">${escapeHtml(plan.reason || "No outreach plan has been prepared and approved for this organization.")}</p>`}
    </div>
  </section>`;
}

function activityHtml(overview) {
  const events = Array.isArray(overview.recentActivity) ? overview.recentActivity : [];
  return `<section class="rcap-card" aria-labelledby="rcap-activity-title">
    <div class="rcap-card-head"><h2 id="rcap-activity-title">Recent correspondence &amp; activity</h2><small>${escapeHtml(String(events.length))} recent</small></div>
    <div class="rcap-card-body">
      ${events.length
        ? `<ul class="rcap-timeline">${events.map((event) => `<li>
            <span class="rcap-timeline-when">${escapeHtml(shortDate(event.occurredAt) || "—")}</span>
            <span>
              <span class="rcap-timeline-title">${escapeHtml(event.title)}</span>
              <span class="rcap-timeline-sub">${escapeHtml(event.outcomeLabel)}${event.direction ? ` · ${escapeHtml(event.direction)}` : ""}</span>
            </span>
          </li>`).join("")}</ul>`
        : `<p class="rcap-empty-note">No correspondence or activity has been recorded for this organization yet.</p>`}
    </div>
  </section>`;
}

function profileSummaryHtml(overview) {
  const profile = overview.profileSummary || {};
  return `<section class="rcap-card" aria-labelledby="rcap-profile-title">
    <div class="rcap-card-head"><h2 id="rcap-profile-title">Le-E profile summary</h2><small>${escapeHtml(profile.status && profile.status.label ? profile.status.label : "Not started")}</small></div>
    <div class="rcap-card-body">
      <dl class="rcap-standing">
        <dt>Status</dt><dd>${escapeHtml(profile.status && profile.status.label ? profile.status.label : "Not started")}</dd>
        <dt>Version</dt><dd>${truth(profile.currentVersion, "none")}</dd>
        <dt>Last refreshed</dt><dd>${truth(profile.lastRefreshedAt, "never")}</dd>
        <dt>Primary story</dt><dd>${truth(profile.primaryStory, "not written")}</dd>
        <dt>Open question</dt><dd>${truth(profile.strongestOpenQuestion, "none recorded")}</dd>
        <dt>Do not pitch</dt><dd>${truth(profile.whatNotToPitch, "nothing recorded")}</dd>
      </dl>
      ${profile.note ? `<p class="rcap-empty-note" style="margin-top:10px">${escapeHtml(profile.note)}</p>` : ""}
    </div>
  </section>`;
}

function railHtml(overview) {
  const rail = overview.contextRail || {};
  const standing = rail.whereThingsStand || {};
  const tasks = Array.isArray(rail.openTasks) ? rail.openTasks : [];
  // The Next Best Step card already offers "Mark complete" for the recorded next action. When
  // that same action is also an open task, the rail must not offer a second button that
  // completes it -- two controls for one decision is the duplicate-action problem, and it makes
  // the page ambiguous to anyone reading it linearly. The rail keeps the row and drops the
  // button, pointing at the control that stays.
  const step = overview.nextBestStep || {};
  const stepTaskTitle = step.available && !step.blocked && step.primaryAction && step.primaryAction.key === "complete_next_action"
    ? String(step.title || "").trim().toLowerCase()
    : "";
  const files = Array.isArray(rail.files) ? rail.files : [];
  const related = Array.isArray(rail.relatedAccounts) ? rail.relatedAccounts : [];
  const warning = rail.coordinationWarning || {};

  return `${warning.present ? `<div class="rcap-coordination" role="note"><strong>Coordinate before contacting</strong><p>${escapeHtml(warning.message)}</p></div>` : ""}
  <section class="rcap-card" aria-labelledby="rcap-standing-title">
    <div class="rcap-card-head"><h2 id="rcap-standing-title">Where things stand</h2></div>
    <div class="rcap-card-body">
      <dl class="rcap-standing">
        <dt>Priority</dt><dd>${truth(standing.priority, "not set")}</dd>
        <dt>Stage</dt><dd>${escapeHtml(standing.stage && standing.stage.label ? standing.stage.label : "Research")}</dd>
        <dt>Strength</dt><dd>${truth(standing.relationshipStrength, "not set")}</dd>
        <dt>Profile</dt><dd>${escapeHtml(standing.profileStatus && standing.profileStatus.label ? standing.profileStatus.label : "Not started")}</dd>
        <dt>Last inbound</dt><dd>${standing.lastInboundAt && standing.lastInboundAt.known ? escapeHtml(shortDate(standing.lastInboundAt.value)) : `<span class="rcap-unknown">None</span>`}</dd>
        <dt>Last outbound</dt><dd>${standing.lastOutboundAt && standing.lastOutboundAt.known ? escapeHtml(shortDate(standing.lastOutboundAt.value)) : `<span class="rcap-unknown">None</span>`}</dd>
        <dt>Next follow-up</dt><dd>${standing.nextFollowUpAt && standing.nextFollowUpAt.known ? escapeHtml(shortDate(standing.nextFollowUpAt.value)) : `<span class="rcap-unknown">Not scheduled</span>`}</dd>
        <dt>Owner</dt><dd>${truth(standing.owner, "unassigned")}</dd>
        <dt>Outreach</dt><dd>${truth(standing.outreachState)}</dd>
        <dt>Contact</dt><dd>${escapeHtml(standing.contactEligibility && standing.contactEligibility.label ? standing.contactEligibility.label : "Unknown")}</dd>
      </dl>
    </div>
  </section>
  <section class="rcap-card" aria-labelledby="rcap-tasks-title">
    <div class="rcap-card-head"><h2 id="rcap-tasks-title">Open tasks</h2><small>${rail.openTaskCount && rail.openTaskCount.known ? `${escapeHtml(String(rail.openTaskCount.value))} open` : "Unavailable"}</small></div>
    <div class="rcap-card-body">
      ${tasks.length
        ? `<ul class="rcap-list-plain">${tasks.map((task) => `<li>
            <span class="rcap-item-title">${escapeHtml(task.title)}</span>
            <span class="rcap-item-sub">${escapeHtml(task.owner || "Unassigned")}${task.dueAt ? ` · due ${escapeHtml(shortDate(task.dueAt))}` : ""}</span>
            ${stepTaskTitle && String(task.title || "").trim().toLowerCase() === stepTaskTitle
              ? `<span class="rcap-item-sub">Completed from the next best step above.</span>`
              : `<span><button type="button" class="rcap-secondary" data-rcap-action="complete_task" data-rcap-task="${escapeHtml(task.id)}">Complete</button></span>`}
          </li>`).join("")}</ul>`
        : `<p class="rcap-empty-note">No open tasks for this organization.</p>`}
    </div>
  </section>
  <section class="rcap-card" aria-labelledby="rcap-files-title">
    <div class="rcap-card-head"><h2 id="rcap-files-title">Files</h2></div>
    <div class="rcap-card-body">
      ${files.length
        ? `<ul class="rcap-list-plain">${files.map((file) => `<li><span class="rcap-item-title">${escapeHtml(file.title)}</span><span class="rcap-item-sub">${file.updatedAt ? escapeHtml(shortDate(file.updatedAt)) : "No date recorded"}</span></li>`).join("")}</ul>`
        : `<p class="rcap-empty-note">No files are linked to this organization.</p>`}
    </div>
  </section>
  <section class="rcap-card" aria-labelledby="rcap-related-title">
    <div class="rcap-card-head"><h2 id="rcap-related-title">Related accounts</h2></div>
    <div class="rcap-card-body">
      ${related.length
        ? `<ul class="rcap-list-plain">${related.map((entry) => `<li>
            <span class="rcap-item-title">${entry.href ? `<a href="${escapeHtml(entry.href)}">${escapeHtml(entry.name)}</a>` : escapeHtml(entry.name)}</span>
            <span class="rcap-item-sub">${escapeHtml(entry.relationKey || "related")}${entry.activeConversation ? " · active conversation" : ""}</span>
          </li>`).join("")}</ul>`
        : `<p class="rcap-empty-note">No related organizations are on record.</p>`}
    </div>
  </section>`;
}

export function rcapProspectOverviewHtml(overview) {
  const payload = overview || {};
  const availability = payload.availability || {};

  if (payload.available === false) {
    const title = availability.state === "feature_off"
      ? "Not enabled"
      : availability.state === "not_found_or_unauthorized"
        ? "Not found"
        : "Unavailable";
    const message = availability.state === "feature_off"
      ? "The RCAP prospect workspace is not enabled on this deployment."
      : availability.state === "not_found_or_unauthorized"
        ? "This organization was not found, or it is not available for your account."
        : availability.reason || "This organization could not be read. Nothing was changed.";
    return `<section class="rcap-page" data-rcap-overview data-rcap-state="${escapeHtml(availability.state || "unavailable")}">
      <p class="rcap-announcement" role="status" data-rcap-announce>${escapeHtml(title)}</p>
      <p><a class="rcap-secondary" href="#partners?view=rcap-prospects" data-rcap-back>Back to RCAP Prospects</a></p>
      ${stateHtml(title, message, { retry: availability.state !== "feature_off" && availability.state !== "not_found_or_unauthorized" })}
    </section>`;
  }

  return `<section class="rcap-page" data-rcap-overview data-rcap-account="${escapeHtml(payload.accountId || "")}" data-rcap-state="ready"${payload.blocked ? ' data-rcap-blocked="true"' : ""}>
    <p class="rcap-announcement" role="status" data-rcap-announce></p>
    <p><a class="rcap-secondary" href="#partners?view=rcap-prospects" data-rcap-back>Back to RCAP Prospects</a></p>
    ${accountHeaderHtml(payload)}
    ${tabsHtml(payload)}
    <div class="rcap-layout">
      <div class="rcap-main">
        ${nextBestStepHtml(payload)}
        ${snapshotHtml(payload)}
        ${bestContactHtml(payload)}
        ${outreachPlanHtml(payload)}
        ${activityHtml(payload)}
        ${profileSummaryHtml(payload)}
      </div>
      <aside class="rcap-rail" aria-label="Account context">
        ${railHtml(payload)}
      </aside>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------------------------
// Browser runtime
// ---------------------------------------------------------------------------------------------

export function rcapProspectsBrowserSource() {
  const loadingHtml = JSON.stringify(rcapProspectsLoadingHtml()).replaceAll("<", "\\u003c");
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=${escapeHtml.toString()};`,
    `const truth=${truth.toString()};`,
    `const shortDate=${shortDate.toString()};`,
    `const initials=${initials.toString()};`,
    `const pillClass=${pillClass.toString()};`,
    `const stateHtml=${stateHtml.toString()};`,
    `const summaryStripHtml=${summaryStripHtml.toString()};`,
    `const savedViewsHtml=${savedViewsHtml.toString()};`,
    `const filterSelect=${filterSelect.toString()};`,
    `const filtersHtml=${filtersHtml.toString()};`,
    `const rowCells=${rowCells.toString()};`,
    `const tableHtml=${tableHtml.toString()};`,
    `const cardsHtml=${cardsHtml.toString()};`,
    `const rcapProspectsListHtml=${rcapProspectsListHtml.toString()};`,
    `const tabsHtml=${tabsHtml.toString()};`,
    `const accountHeaderHtml=${accountHeaderHtml.toString()};`,
    `const nextBestStepHtml=${nextBestStepHtml.toString()};`,
    `const snapshotHtml=${snapshotHtml.toString()};`,
    `const bestContactHtml=${bestContactHtml.toString()};`,
    `const outreachPlanHtml=${outreachPlanHtml.toString()};`,
    `const activityHtml=${activityHtml.toString()};`,
    `const profileSummaryHtml=${profileSummaryHtml.toString()};`,
    `const railHtml=${railHtml.toString()};`,
    `const rcapProspectOverviewHtml=${rcapProspectOverviewHtml.toString()};`
  ].join("\n");

  return `(() => { "use strict";
    const loadingHtml=${loadingHtml};
    ${renderer}
    const endpoint=${JSON.stringify(RCAP_PROSPECTS_ENDPOINT)};
    const metrics={ requests:0, mutations:0, externalActions:0, sends:0, silentStageChanges:0, fullStateReads:0 };
    window.__LE_RCAP_PROSPECTS_METRICS=metrics;
    let sequence=0; let inFlightAction=false; let sessionEnded=false; let lastPayload=null; let loadingUrl="";

    function section(){ return document.querySelector("main#app #partners.page-section.active") || document.querySelector("main#app #partners"); }

    // OWNERSHIP. When the RCAP saved view is active this surface OWNS the Partners page: the
    // legacy Partners content is hidden and this renders in its place, so the founder never
    // reads two primary surfaces stacked on one screen (the mistake Release 4 corrected).
    //
    // The slot is created HERE rather than added to the inline Partners renderer. That is
    // deliberate: it means the flag-off server output is byte-for-byte what it is today, so the
    // rollback is exact and the legacy shell hash does not move.
    function host(){
      const root=section(); if(!root) return null;
      let slot=root.querySelector("[data-rcap-slot]");
      if(!slot){
        slot=document.createElement("div");
        slot.setAttribute("data-rcap-slot","");
        root.prepend(slot);
      }
      return slot;
    }
    function setLegacyHidden(hidden){
      const root=section(); if(!root) return;
      for(const child of [...root.children]){
        if(child.hasAttribute&&child.hasAttribute("data-rcap-slot")) continue;
        if(hidden) child.setAttribute("hidden",""); else child.removeAttribute("hidden");
      }
    }
    function hashQuery(){ return new URLSearchParams(String(location.hash||"").split("?")[1]||""); }
    function onRoute(){
      const resolved=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");
      const route=resolved?.kind==="page"?resolved.canonicalRoute:"";
      // The Profile pane is owned by the rcap-profile runtime (Wave 2). Without this guard both
      // runtimes render into the same Partners section and the founder reads two pages at once.
      return route==="partners" && hashQuery().get("view")==="rcap-prospects" && hashQuery().get("pane")!=="profile" && hashQuery().get("pane")!=="activity";
    }
    function accountId(){ return hashQuery().get("account")||""; }
    function csrf(){ const prefix="leos_csrf="; return String(document.cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith(prefix))?.slice(prefix.length)||""; }
    function requestId(){ return "rcap_"+(globalThis.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(16).slice(2)).replaceAll("-","_"); }
    function announce(message){ const node=host()?.querySelector("[data-rcap-announce]"); if(node) node.textContent=message; }
    // Standing down for the profile pane is not leaving the RCAP view: the legacy content must
    // stay hidden, or it reappears underneath the profile the moment this runtime yields.
    function leaveRoute(){ const root=section(); if(!root) return; const slot=root.querySelector("[data-rcap-slot]"); if(slot) slot.remove(); if(hashQuery().get("view")!=="rcap-prospects") setLegacyHidden(false); }

    function queryFromHash(){
      const query=hashQuery(); const out={};
      for(const key of ["savedView","stage","priority","owner","geography","research","attention"]){
        const value=query.get(key); if(value) out[key===\"savedView\"?\"view\":key]=value;
      }
      return out;
    }
    function requestUrl(){
      const account=accountId();
      const params=new URLSearchParams(queryFromHash());
      if(account) params.set("account",account);
      const search=params.toString();
      return endpoint+(search?"?"+search:"");
    }
    function setHashParam(key,value){
      const hash=String(location.hash||"#partners"); const base=hash.split("?")[0]||"#partners";
      const query=new URLSearchParams(hash.split("?")[1]||"");
      query.set("view","rcap-prospects");
      if(value) query.set(key,value); else query.delete(key);
      location.hash=base+"?"+query.toString();
    }

    function paint(html){ const slot=host(); if(!slot||sessionEnded) return; slot.innerHTML=html; }

    async function load(){
      if(!onRoute()||sessionEnded) return;
      const slot=host(); if(!slot) return;
      setLegacyHidden(true);
      if(!slot.querySelector("[data-rcap-prospects],[data-rcap-overview]")) slot.innerHTML=loadingHtml;
      const url=requestUrl();
      // One navigation can wake mount(), hashchange and the observer at once. Without this the
      // same URL is fetched three times and two of them are aborted by the third.
      if(loadingUrl===url) return;
      loadingUrl=url;
      const ticket=++sequence; metrics.requests+=1;
      let response;
      try { response=await fetch(url,{credentials:"same-origin",headers:{accept:"application/json"}}); }
      catch { loadingUrl=""; if(ticket===sequence) paint(rcapProspectsListHtml({available:false,availability:{state:"unavailable",reason:"The organizations behind this view could not be read. Nothing was changed."}})); return; }
      loadingUrl="";
      if(ticket!==sequence) return;
      if(response.status===401){ sessionEnded=true; paint(rcapProspectsListHtml({available:false,availability:{state:"unavailable",reason:"Your session ended. Sign in again; nothing was changed."}})); document.dispatchEvent(new CustomEvent("vnext:session-expired")); return; }
      if(response.status===403){ paint(rcapProspectsListHtml({available:false,availability:{state:"unauthorized",reason:"You do not have access to RCAP prospect intelligence."}})); return; }
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body){ paint(rcapProspectsListHtml({available:false,availability:{state:"unavailable",reason:"The organizations behind this view could not be read. Nothing was changed."}})); return; }
      lastPayload=body;
      paint(body.kind==="overview"?rcapProspectOverviewHtml(body.overview):rcapProspectsListHtml(body.list));
      announce(body.kind==="overview"?"Account overview loaded.":"RCAP prospect list loaded.");
    }

    async function runAction(action,detail={}){
      if(inFlightAction) return;
      const account=accountId(); if(!account) return;
      const prompts={ add_note:"Add a note to this organization", set_next_step:"What is the next step?", log_activity:"What happened?" };
      let input={};
      if(action==="add_note"){ const note=window.prompt(prompts.add_note); if(!note) return; input={action:"add_note",note}; }
      else if(action==="set_next_step"){ const next=window.prompt(prompts.set_next_step); if(!next) return; input={action:"set_next_action",nextAction:next}; }
      else if(action==="log_activity"){ const summary=window.prompt(prompts.log_activity); if(!summary) return; input={action:"log_activity",activityType:"note",summary}; }
      else if(action==="complete_next_action"){ input={action:"complete_next_action",note:""}; }
      else if(action==="complete_task"){ input={action:"complete_next_action",note:""}; }
      else return;

      inFlightAction=true;
      const buttons=[...(host()?.querySelectorAll("[data-rcap-action]")||[])];
      buttons.forEach(button=>{ button.disabled=true; });
      announce("Working…");
      metrics.mutations+=1;
      try {
        const version=lastPayload?.overview?.version||"legacy";
        const response=await fetch("/api/ui/relationships/"+encodeURIComponent(account)+"/action",{
          method:"POST", credentials:"same-origin",
          headers:{accept:"application/json","content-type":"application/json","x-csrf-token":csrf()},
          body:JSON.stringify({requestId:requestId(),expectedVersion:version,...input})
        });
        const body=await response.json().catch(()=>({}));
        if(response.status===401){ sessionEnded=true; announce("Your session ended. Nothing was changed."); return; }
        if(response.status===409){ announce("This organization changed while you were working. Nothing was saved — reload and try again."); return; }
        if(!response.ok||body.ok!==true){ announce(clean(body.error)||"That could not be saved. Nothing was changed."); return; }
        announce("Saved.");
        await load();
      } catch { announce("That could not be saved. Nothing was changed."); }
      finally { inFlightAction=false; buttons.forEach(button=>{ button.disabled=false; }); }
    }

    function onClick(event){
      const target=host(); if(!target||!target.contains(event.target)) return;
      const retry=event.target.closest("[data-rcap-retry]"); if(retry){ event.preventDefault(); load(); return; }
      const viewButton=event.target.closest("button[data-rcap-view]");
      if(viewButton){ event.preventDefault(); setHashParam("savedView",viewButton.dataset.rcapView); return; }
      const action=event.target.closest("[data-rcap-action]");
      if(action && !action.disabled){ event.preventDefault(); runAction(action.dataset.rcapAction,{taskId:action.dataset.rcapTask||""}); }
    }
    function onChange(event){
      const target=host(); if(!target||!target.contains(event.target)) return;
      const filter=event.target.closest("select[data-rcap-filter]");
      if(filter) setHashParam(filter.dataset.rcapFilter,filter.value);
    }

    function mount(){ if(!onRoute()){ leaveRoute(); return; } load(); }
    window.addEventListener("hashchange",mount);
    document.addEventListener("click",onClick);
    document.addEventListener("change",onChange);
    // The router renders the Partners section AFTER this runtime loads, so mounting once on load
    // is a race this surface loses about half the time. The observer re-mounts when the section
    // appears -- and it is GUARDED to fire only when we are on route AND the surface is missing,
    // which is the guard the broken campaign-detail surface lacked: painting into our own slot is
    // itself a mutation, so an unguarded observer would re-enter its own render forever.
    const observed=document.querySelector("main#app");
    if(observed) new MutationObserver(()=>{ if(onRoute()&&!host()?.querySelector("[data-rcap-prospects],[data-rcap-overview]")) mount(); })
      .observe(observed,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    window.__LE_RCAP_PROSPECTS={ mount, activate:mount, render:(payload)=>payload?.kind==="overview"?rcapProspectOverviewHtml(payload.overview):rcapProspectsListHtml(payload?.list) };
    mount();
  })();`;
}
