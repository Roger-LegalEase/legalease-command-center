import { renderActionStatus, createConfirmationContract } from "./feedback.mjs";
import {
  renderButton,
  renderEmptyState,
  renderErrorState,
  renderFilters,
  renderLoadingState,
  renderPageHeader,
  renderRecordDrawer,
  renderStatusChip,
  renderTabs
} from "./primitives.mjs";
import {
  APPROVED_WHITE_LOGO_PATH,
  DESIGN_SYSTEM_SHOWCASE_PATH,
  PRODUCT_NAME,
  TOKEN_STYLESHEET_PATH
} from "./brand-contract.mjs";

const button = (options) => renderButton(options);
const chip = (label, state) => renderStatusChip({ label, state });

function navigation() {
  return `<nav class="ds-nav" aria-label="Showcase navigation">
    <a href="#foundation" aria-current="page" data-short-label="F"><span>Foundation</span></a>
    <a href="#actions" data-short-label="A"><span>Actions</span></a>
    <a href="#states" data-short-label="S"><span>States</span></a>
    <a href="#forms" data-short-label="F"><span>Forms</span></a>
    <a href="#records" data-short-label="R"><span>Records</span></a>
  </nav>`;
}

function sidebar(className = "ds-sidebar") {
  return `<aside class="${className}" aria-label="Deep navy sidebar sample">
    <img class="ds-logo" src="/${APPROVED_WHITE_LOGO_PATH}" alt="LegalEase" width="1920" height="1080">
    ${navigation()}
    <p class="ds-sidebar-note">Development component showcase · not a production destination</p>
  </aside>`;
}

function buttonShowcase() {
  const variants = [
    ["Primary action", { label:"Create item", icon:"+", intent:"primary", action:"showcase-create" }],
    ["Secondary action", { label:"Preview", intent:"secondary", action:"showcase-preview" }],
    ["Quiet action", { label:"View details", intent:"quiet", action:"showcase-details" }],
    ["Destructive action", { label:"Delete draft", intent:"destructive", action:"showcase-delete" }]
  ];
  const states = [
    ["Default", "default", { label:"Save changes", intent:"primary", action:"showcase-save" }],
    ["Hover treatment", "hover", { label:"Save changes", intent:"primary", action:"showcase-save" }],
    ["Focus-visible treatment", "focus", { label:"Save changes", intent:"primary", action:"showcase-save" }],
    ["Disabled", "disabled", { label:"Save changes", intent:"primary", action:"showcase-save", disabled:true }],
    ["Loading", "loading", { label:"Save changes", workingLabel:"Working…", intent:"primary", action:"showcase-save", loading:true }]
  ];
  return `<section class="ds-section" id="actions" aria-labelledby="actions-title">
    <div class="ds-section-heading"><div><p class="ds-kicker">Actions</p><h2 id="actions-title">A restrained hierarchy</h2></div><p>Orange marks the primary action; danger remains semantic red.</p></div>
    <div class="ds-card ds-stack">
      <div class="ds-inline">${variants.map(([, options]) => button(options)).join("")}</div>
      <div class="ds-state-grid">${states.map(([label, state, options]) => `<div class="ds-state" data-demo-state="${state}"><small>${label}</small>${button(options)}</div>`).join("")}</div>
    </div>
  </section>`;
}

function statusShowcase() {
  const statuses = [
    ["Neutral", "neutral"],
    ["Information", "informational"],
    ["Selected", "selected"],
    ["Success", "success"],
    ["Warning", "warning"],
    ["Danger", "danger"],
    ["Needs attention", "needs-attention"]
  ];
  return `<section class="ds-section" id="states" aria-labelledby="states-title">
    <div class="ds-section-heading"><div><p class="ds-kicker">States</p><h2 id="states-title">Meaning stays visible in text</h2></div><p>Teal selection, semantic outcomes, and orange attention remain distinct.</p></div>
    <div class="ds-card ds-stack">
      <div class="ds-inline">${statuses.map(([label, state]) => chip(label, state)).join("")}</div>
      <div class="ds-grid">
        ${renderEmptyState({ title:"No items yet", explanation:"Create an item when the workspace is ready.", primaryAction:{ label:"Create item", intent:"primary", action:"showcase-create" } })}
        ${renderLoadingState({ title:"Loading current items", explanation:"Checking the isolated showcase fixture." })}
        ${renderErrorState({ title:"Items could not load", explanation:"Nothing changed. Try the isolated request again.", primaryAction:{ label:"Retry", intent:"secondary", action:"showcase-retry" } })}
        <div id="showcase-status">${renderActionStatus({ kind:"success", title:"Showcase is ready", message:"Component feedback appears here without changing product data." })}</div>
      </div>
    </div>
  </section>`;
}

function collectionShowcase() {
  return `<section class="ds-section" id="records" aria-labelledby="records-title">
    <div class="ds-section-heading"><div><p class="ds-kicker">Collections and records</p><h2 id="records-title">Clear structure without card clutter</h2></div><p>Rows, a simple content card, and a reusable record drawer.</p></div>
    <div class="ds-grid">
      <div class="ds-card ds-stack">
        <div class="ds-list" aria-label="Example records">
          <div class="ds-list-row"><div><strong>Component documentation</strong><span>Current file · updated in this fixture</span></div>${chip("Current", "success")}</div>
          <div class="ds-list-row"><div><strong>Accessibility checklist</strong><span>Review before the next packet</span></div>${chip("Needs attention", "needs-attention")}</div>
        </div>
        <article class="ds-calendar-card"><strong>Planning session</strong><span>Thursday · 10:00 AM</span>${chip("Selected", "selected")}</article>
        <div class="ds-inline"><span class="ds-badge" aria-label="3 notifications">3</span><span>Notification badge</span>${button({ label:"Show record drawer", intent:"secondary", action:"showcase-open-drawer" })}</div>
      </div>
      ${renderRecordDrawer({
        id:"showcase-record-drawer",
        title:"Design-system record",
        subtitle:"Neutral fixture content",
        status:{ label:"Current", state:"success" },
        closeLabel:"Close record drawer",
        tabs:{ label:"Record details", tabs:[
          { label:"Overview", link:{ kind:"page", target:"#records" }, active:true },
          { label:"Activity", link:{ kind:"page", target:"#activity" } }
        ] },
        body:"This structural drawer owns no data fetching, routing, or mutation.",
        actions:[
          { label:"Save record", intent:"primary", action:"showcase-save" },
          { label:"View details", intent:"secondary", action:"showcase-details" }
        ]
      })}
    </div>
  </section>`;
}

function formShowcase() {
  return `<section class="ds-section" id="forms" aria-labelledby="forms-title">
    <div class="ds-section-heading"><div><p class="ds-kicker">Forms and filtering</p><h2 id="forms-title">Labeled, calm, and keyboard ready</h2></div><p>Validation and disabled states are explicit.</p></div>
    <div class="ds-card ds-stack">
      ${renderFilters({ label:"Filter showcase records", filters:[
        { id:"showcase-search", label:"Search records", type:"search", value:"" },
        { id:"showcase-status-filter", label:"Status", type:"select", value:"current", options:[
          { label:"Current", value:"current" },
          { label:"Needs attention", value:"needs-attention" }
        ] }
      ] })}
      <form class="ds-grid" aria-label="Example form" data-showcase-form>
        <div class="ds-field"><label for="showcase-name">Name</label><input id="showcase-name" name="name" value="Workspace note"></div>
        <div class="ds-field"><label for="showcase-kind">Type</label><select id="showcase-kind" name="kind"><option>Note</option><option>File</option></select></div>
        <div class="ds-field"><label for="showcase-summary">Summary</label><textarea id="showcase-summary" name="summary">Neutral fixture copy for component review.</textarea></div>
        <div class="ds-field"><label for="showcase-invalid">Required owner</label><input class="ds-invalid" id="showcase-invalid" name="owner" aria-invalid="true" aria-describedby="showcase-invalid-message"><span class="ds-validation" id="showcase-invalid-message">Choose an owner before saving.</span></div>
        <fieldset class="ds-field"><legend>Notifications</legend><label class="ds-choice"><input type="checkbox" name="updates" checked> Show updates</label><label class="ds-choice"><input type="checkbox" name="disabled" disabled> Disabled option</label></fieldset>
        <fieldset class="ds-field"><legend>View</legend><label class="ds-choice"><input type="radio" name="view" checked> List</label><label class="ds-choice"><input type="radio" name="view"> Calendar</label></fieldset>
      </form>
    </div>
  </section>`;
}

function confirmationShowcase() {
  const confirmation = createConfirmationContract({
    action:"Delete draft",
    title:"Delete this draft?",
    consequence:"The neutral showcase draft would be removed. No product record is affected.",
    destructive:true
  });
  return `<section class="ds-section" aria-labelledby="confirmation-title">
    <div class="ds-card ds-confirmation">
      <p class="ds-kicker">Confirmation</p>
      <h3 id="confirmation-title">${confirmation.title}</h3>
      <p>${confirmation.consequence}</p>
      <div class="ds-inline">${button({ label:confirmation.action, intent:"destructive", action:"showcase-delete" })}${button({ label:"Keep draft", intent:"secondary", action:"showcase-dismiss" })}</div>
    </div>
  </section>`;
}

function clientScript() {
  return `<script>
    (() => {
      const statusRoot = document.querySelector("#showcase-status");
      const drawer = document.querySelector("#showcase-record-drawer");
      const setStatus = (kind, title, message) => {
        if (!statusRoot) return;
        const role = kind === "error" ? "alert" : "status";
        const live = kind === "error" ? "assertive" : "polite";
        statusRoot.innerHTML = '<div class="ui-action-status ui-action-status--' + kind + '" role="' + role + '" aria-live="' + live + '" data-state="' + kind + '"><strong>' + title + '</strong><p>' + message + '</p></div>';
      };
      document.addEventListener("click", (event) => {
        const control = event.target.closest("[data-action]");
        if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
        const action = control.dataset.action;
        if (action === "close-drawer") {
          drawer.hidden = true;
          setStatus("informational", "Record drawer closed", "Use Show record drawer to open it again.");
          return;
        }
        if (action === "showcase-open-drawer") {
          drawer.hidden = false;
          drawer.querySelector("button")?.focus();
          setStatus("success", "Record drawer opened", "The structural drawer is ready for review.");
          return;
        }
        if (action === "showcase-delete") {
          const approved = window.confirm("Delete this neutral showcase draft? No product record is affected.");
          setStatus(approved ? "success" : "informational", approved ? "Showcase action confirmed" : "No changes made", approved ? "The isolated demonstration completed." : "The confirmation was dismissed safely.");
          return;
        }
        if (action === "showcase-dismiss") {
          setStatus("informational", "No changes made", "The confirmation was dismissed safely.");
          return;
        }
        setStatus(action === "showcase-retry" ? "success" : "working", action === "showcase-retry" ? "Showcase rechecked" : "Working…", "This development-only action changes no product data.");
      });
      document.querySelector("[data-showcase-form]")?.addEventListener("submit", (event) => event.preventDefault());
    })();
  </script>`;
}

export function renderDesignSystemShowcase() {
  const pageHeader = renderPageHeader({
    eyebrow:"LegalEase vNext",
    title:"Approved design system",
    description:"A development-only review surface for the shared visual and interaction language.",
    primaryAction:{ label:"Create item", icon:"+", intent:"primary", action:"showcase-create" }
  });
  const tabs = renderTabs({ label:"Showcase sections", tabs:[
    { label:"Foundation", link:{ kind:"page", target:"#foundation" }, active:true },
    { label:"Actions", link:{ kind:"page", target:"#actions" } },
    { label:"States", link:{ kind:"page", target:"#states" } },
    { label:"Forms", link:{ kind:"page", target:"#forms" } },
    { label:"Records", link:{ kind:"page", target:"#records" } }
  ] });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${PRODUCT_NAME} design system</title>
  <link rel="stylesheet" href="/${TOKEN_STYLESHEET_PATH}">
</head>
<body class="vnext-design-system" data-vnext-design-system="true" data-showcase-path="${DESIGN_SYSTEM_SHOWCASE_PATH}">
  <div class="ds-shell">
    ${sidebar()}
    <main class="ds-workspace" id="showcase-main">
      <div class="ds-content">
        <section id="foundation" aria-labelledby="showcase-title">
          ${pageHeader.replace("<h1>", '<h1 id="showcase-title">')}
          ${tabs}
          <div class="ds-mobile-demo" aria-label="Mobile navigation drawer sample">
            <h2>Mobile navigation sample</h2>
            ${sidebar("ds-mobile-drawer")}
          </div>
        </section>
        ${buttonShowcase()}
        ${statusShowcase()}
        ${formShowcase()}
        ${collectionShowcase()}
        ${confirmationShowcase()}
      </div>
    </main>
  </div>
  ${clientScript()}
</body>
</html>`;
}
