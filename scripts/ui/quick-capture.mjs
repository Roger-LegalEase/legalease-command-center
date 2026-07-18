import { escapeAttribute, escapeHtml } from "./html.mjs";
import { renderButton } from "./primitives.mjs";

const freezeList = (values) => Object.freeze(values.map((value) => Object.freeze({ ...value })));

export const QUICK_CAPTURE_INTENT_OPTIONS = freezeList([
  { id:"task", label:"Task", destination:"Tasks", description:"One open Task" },
  { id:"decision", label:"Decision", destination:"Capture Inbox", description:"A decision ready for review" },
  { id:"blocker", label:"Blocker", destination:"Capture Inbox", description:"A blocker ready for review" },
  { id:"post-idea", label:"Post idea", destination:"Social", description:"An inert Social idea" },
  { id:"partner-note", label:"Partner note", destination:"Capture Inbox", description:"A Partner note ready for review" },
  { id:"campaign-idea", label:"Campaign idea", destination:"Outreach", description:"An inert Campaign draft" },
  { id:"file-report-note", label:"File/report note", destination:"Files", description:"A draft document record" }
]);

export const QUICK_CAPTURE_UI_CONTRACT = Object.freeze({
  endpoint:"/api/ui/quick-capture",
  capabilitiesEndpoint:"/api/ui/quick-capture/capabilities",
  formId:"vnext-quick-capture-form",
  exactIntentCount:7,
  submitLabel:"Save"
});

export const QUICK_CAPTURE_STYLESHEET_PATH = "assets/ui/quick-capture.css";

const intentChoice = (option) => `<label class="vnext-quick-capture-intent" data-quick-capture-intent-option="${escapeAttribute(option.id)}">
  <input type="radio" name="intent" value="${escapeAttribute(option.id)}" required>
  <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></span>
</label>`;

const selectOptions = (values) => values.map((option) => `<option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>`).join("");

export function renderQuickCaptureForm() {
  return `<form class="vnext-create-form vnext-quick-capture-form" id="${QUICK_CAPTURE_UI_CONTRACT.formId}" data-global-create-form="quick-note" data-quick-capture-form hidden novalidate>
    <div class="vnext-create-form-header">
      <h2 id="vnext-create-title-quick-note">Quick Capture</h2>
      <p>Save one clear thought to its reviewed destination. Nothing sends, publishes, launches, or changes another record.</p>
    </div>
    <input type="hidden" name="creationRequestId" value="">
    <div class="vnext-quick-capture-editor" data-quick-capture-editor>
      <div class="vnext-quick-capture-suggestion" data-quick-capture-suggestion hidden>
        <span data-quick-capture-suggestion-copy></span>
        <button type="button" class="vnext-quick-capture-suggestion-action" data-quick-capture-use-suggestion></button>
        <small>A suggestion never selects or saves a destination for you.</small>
      </div>
      <fieldset class="vnext-quick-capture-intents">
        <legend>What are you capturing? <span aria-hidden="true">*</span></legend>
        <div class="vnext-quick-capture-intent-grid">${QUICK_CAPTURE_INTENT_OPTIONS.map(intentChoice).join("")}</div>
      </fieldset>
      <section class="vnext-quick-capture-destination" aria-live="polite" aria-label="Selected destination">
        <span>Destination</span>
        <strong data-quick-capture-destination>Choose an intent to see where it will be saved.</strong>
        <p data-quick-capture-destination-detail>No destination has been selected.</p>
      </section>
      <div class="vnext-create-fields">
        <label for="quick-capture-title">Title <span aria-hidden="true">*</span></label>
        <input id="quick-capture-title" name="title" type="text" required maxlength="160" autocomplete="off">
        <label for="quick-capture-details">Details <span class="vnext-field-optional">Optional</span></label>
        <textarea id="quick-capture-details" name="details" maxlength="5000" rows="5"></textarea>
        <div data-quick-capture-field="partner-note" hidden>
          <label for="quick-capture-related-partner">Related Partner <span class="vnext-field-optional">Optional</span></label>
          <input id="quick-capture-related-partner" name="relatedPartner" type="text" maxlength="160" autocomplete="off">
          <p>This names the context only. No Partner record will be changed.</p>
        </div>
        <div data-quick-capture-field="campaign-idea" hidden>
          <label for="quick-capture-campaign-type">Campaign type <span aria-hidden="true">*</span></label>
          <select id="quick-capture-campaign-type" name="campaignType">
            ${selectOptions([
              { value:"partner_outreach", label:"Partner outreach" },
              { value:"customer_reengagement", label:"Customer re-engagement" },
              { value:"announcement", label:"Announcement" }
            ])}
          </select>
          <p>The selected type is visible before the inert Campaign draft is saved.</p>
        </div>
        <div data-quick-capture-field="file-report-note" hidden>
          <label for="quick-capture-file-section">Files section <span aria-hidden="true">*</span></label>
          <select id="quick-capture-file-section" name="fileSection">
            ${selectOptions([
              { value:"Company overview", label:"Company overview" },
              { value:"Product suite", label:"Product suite" },
              { value:"Traction", label:"Traction" },
              { value:"Partner pipeline", label:"Partner pipeline" },
              { value:"Campaigns", label:"Campaigns" },
              { value:"Compliance", label:"Compliance" },
              { value:"Technical architecture", label:"Technical architecture" },
              { value:"Security", label:"Security" },
              { value:"Financial model", label:"Financial model" },
              { value:"Other", label:"Other" }
            ])}
          </select>
          <p>This creates a document record only. No binary is uploaded or shared.</p>
        </div>
      </div>
      <div class="vnext-create-inline-error" role="alert" hidden></div>
      <footer>
        ${renderButton({ label:"Cancel", intent:"secondary", action:"global-create-cancel" })}
        ${renderButton({ label:QUICK_CAPTURE_UI_CONTRACT.submitLabel, intent:"primary", type:"submit" })}
      </footer>
    </div>
    <section class="vnext-quick-capture-success" data-quick-capture-success hidden tabindex="-1" aria-live="polite">
      <span class="vnext-quick-capture-success-mark" aria-hidden="true">✓</span>
      <h3>Saved</h3>
      <p data-quick-capture-success-message></p>
      <div class="vnext-quick-capture-success-actions">
        <a class="ui-button ui-button--primary" data-quick-capture-open href="#today">Open</a>
        <button class="ui-button ui-button--secondary" type="button" data-quick-capture-another>Capture another</button>
      </div>
    </section>
  </form>`;
}

export function quickCaptureBrowserSource() {
  const intentOptions = JSON.stringify(QUICK_CAPTURE_INTENT_OPTIONS).replaceAll("<", "\\u003c");
  const endpoint = JSON.stringify(QUICK_CAPTURE_UI_CONTRACT.endpoint);
  const capabilitiesEndpoint = JSON.stringify(QUICK_CAPTURE_UI_CONTRACT.capabilitiesEndpoint);
  const formId = JSON.stringify(QUICK_CAPTURE_UI_CONTRACT.formId);
  return `(() => {
    "use strict";
    const options = ${intentOptions};
    const endpoint = ${endpoint};
    const capabilitiesEndpoint = ${capabilitiesEndpoint};
    const form = document.getElementById(${formId});
    if (!form) return;
    const byId = new Map(options.map((option) => [option.id, option]));
    const editor = form.querySelector("[data-quick-capture-editor]");
    const success = form.querySelector("[data-quick-capture-success]");
    const errorNode = form.querySelector(".vnext-create-inline-error");
    const destination = form.querySelector("[data-quick-capture-destination]");
    const destinationDetail = form.querySelector("[data-quick-capture-destination-detail]");
    const suggestion = form.querySelector("[data-quick-capture-suggestion]");
    const suggestionCopy = form.querySelector("[data-quick-capture-suggestion-copy]");
    const suggestionAction = form.querySelector("[data-quick-capture-use-suggestion]");
    const openResult = form.querySelector("[data-quick-capture-open]");
    let capabilitiesPromise = null;
    let capabilitiesLoaded = false;
    let enabledIntents = new Set();
    let suggestedIntent = "";
    let lastResult = null;
    const recentResults = new Map();
    const cookieValue = (name) => document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1) || "";
    const newRequestId = () => globalThis.crypto?.randomUUID?.() || "quick-capture-" + Date.now() + "-" + Math.random().toString(16).slice(2);

    function setStatus(kind, title, message = "") {
      window.__LE_GLOBAL_CREATE?.setStatus?.(kind, title, message);
    }

    function selectedIntent() {
      return form.elements.intent?.value || "";
    }

    function clearResult() {
      lastResult = null;
      editor.hidden = false;
      success.hidden = true;
      openResult.setAttribute("href", "#today");
      form.querySelector("[data-quick-capture-success-message]").textContent = "";
    }

    function rememberRecentResult(result = {}) {
      const href = safeExactHash(result.canonicalHref);
      if (!href) return;
      const route = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve?.(href);
      recentResults.set(href, Object.freeze({
        href,
        sourceId:String(route?.sourceId || ""),
        title:String(result.title || "Saved capture"),
        intentLabel:String(result.intentLabel || "Capture"),
        destination:String(result.destination || "its destination"),
        message:String(result.message || "The capture was saved.")
      }));
      while (recentResults.size > 12) recentResults.delete(recentResults.keys().next().value);
    }

    function renderRecentExactResult() {
      const activeRoute = window.__LE_VNEXT_ACTIVE_ROUTE;
      const result = recentResults.get(activeRoute?.safeHash)
        || recentResults.get(location.hash)
        || [...recentResults.values()].find((entry) => entry.sourceId && entry.sourceId === activeRoute?.sourceId);
      const page = document.querySelector("main#app #item.page-section.active");
      if (!result || !page || !page.textContent.includes("This record is not in the loaded data")) return;
      const title = page.querySelector("h1");
      const panel = page.querySelector("section.panel");
      if (!title || !panel) return;
      title.textContent = result.title;
      const status = document.createElement("div");
      status.className = "ui-feedback ui-feedback--success";
      status.dataset.quickCaptureExactResult = "true";
      status.setAttribute("role", "status");
      const heading = document.createElement("h2");
      heading.textContent = result.intentLabel + " saved";
      const message = document.createElement("p");
      message.textContent = result.message;
      const destinationCopy = document.createElement("p");
      destinationCopy.textContent = "Destination: " + result.destination + ".";
      status.append(heading, message, destinationCopy);
      panel.replaceChildren(status);
    }

    function showConditionalFields(intentId) {
      form.querySelectorAll("[data-quick-capture-field]").forEach((field) => {
        const active = field.dataset.quickCaptureField === intentId;
        field.hidden = !active;
        field.querySelectorAll("select, input, textarea").forEach((control) => { control.disabled = !active; });
      });
    }

    function updateDestination() {
      const option = byId.get(selectedIntent());
      showConditionalFields(option?.id || "");
      if (!option) {
        destination.textContent = "Choose an intent to see where it will be saved.";
        destinationDetail.textContent = "No destination has been selected.";
        return;
      }
      destination.textContent = option.destination;
      destinationDetail.textContent = option.description + ".";
    }

    function applyCapabilities(payload = {}) {
      capabilitiesLoaded = true;
      enabledIntents = new Set((payload.intents || []).filter((item) => item.enabled === true).map((item) => item.id));
      const decisions = new Map((payload.intents || []).map((item) => [item.id, item]));
      form.querySelectorAll("[data-quick-capture-intent-option]").forEach((label) => {
        const id = label.dataset.quickCaptureIntentOption;
        const input = label.querySelector("input");
        const decision = decisions.get(id) || {};
        input.disabled = decision.enabled !== true;
        label.classList.toggle("is-disabled", input.disabled);
        label.title = input.disabled ? decision.reason || "This capture is unavailable for your account." : "";
      });
      if (selectedIntent() && !enabledIntents.has(selectedIntent())) {
        form.elements.intent.value = "";
        updateDestination();
      }
    }

    async function loadCapabilities() {
      if (capabilitiesLoaded) return;
      if (capabilitiesPromise) return capabilitiesPromise;
      capabilitiesPromise = fetch(capabilitiesEndpoint, { credentials:"same-origin", headers:{ accept:"application/json" } })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (response.status === 401) {
            document.dispatchEvent(new CustomEvent("vnext:session-expired"));
            throw new Error("Your session ended. Sign in again before saving.");
          }
          if (!response.ok || payload.ok !== true) throw new Error(payload.message || "Quick Capture is unavailable for this account.");
          applyCapabilities(payload);
          return payload;
        })
        .catch((error) => {
          enabledIntents = new Set();
          setStatus("error", "Quick Capture is unavailable", error.message || "No records were changed.");
          throw error;
        })
        .finally(() => { capabilitiesPromise = null; });
      return capabilitiesPromise;
    }

    function showSuggestion(intentId = "") {
      suggestedIntent = byId.has(intentId) ? intentId : "";
      const option = byId.get(suggestedIntent);
      suggestion.hidden = !option;
      if (!option) return;
      suggestionCopy.textContent = "Le-E suggests " + option.label + " → " + option.destination + ".";
      suggestionAction.textContent = "Use " + option.label + " suggestion";
      suggestionAction.disabled = enabledIntents.size > 0 && !enabledIntents.has(option.id);
    }

    function prepare({ suggestionIntent = "" } = {}) {
      clearResult();
      errorNode.hidden = true;
      showConditionalFields("");
      destination.textContent = "Choose an intent to see where it will be saved.";
      destinationDetail.textContent = "No destination has been selected.";
      showSuggestion(suggestionIntent);
      loadCapabilities().then(() => showSuggestion(suggestionIntent)).catch(() => {});
    }

    function safeExactHash(value = "") {
      const hash = String(value || "");
      if (!hash.startsWith("#") || hash.length > 2048) return "";
      const resolution = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve?.(hash);
      if (!resolution || ["unsafe", "unknown"].includes(resolution.kind)) return "";
      return resolution.safeHash === hash || resolution.canonicalHash === hash || resolution.requestedHash === hash ? hash : "";
    }

    async function submit() {
      if (form.dataset.submitting === "true") return;
      errorNode.hidden = true;
      const intentId = selectedIntent();
      if (!intentId || !enabledIntents.has(intentId) || !form.checkValidity()) {
        errorNode.textContent = !intentId
          ? "Choose one capture intent. Nothing has been saved."
          : !enabledIntents.has(intentId)
            ? "Your current access does not allow this capture. Nothing has been saved."
            : "Add the required information and try again. Nothing has been saved.";
        errorNode.hidden = false;
        form.reportValidity();
        return;
      }
      const submitButton = form.querySelector('[type="submit"]');
      const payload = Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => String(value || "").trim()));
      form.dataset.submitting = "true";
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
      setStatus("working", "Saving", "Your selected destination is being rechecked before anything is saved.");
      try {
        const response = await fetch(endpoint, {
          method:"POST",
          credentials:"same-origin",
          headers:{ "content-type":"application/json", "x-csrf-token":decodeURIComponent(cookieValue("leos_csrf")) },
          body:JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401 || result.outcome === "session_expired") {
          form.reset();
          clearResult();
          document.dispatchEvent(new CustomEvent("vnext:session-expired"));
          window.__LE_GLOBAL_CREATE?.closeWorkspace?.({ force:true, returnFocus:false });
          return;
        }
        if (!response.ok || result.ok !== true) throw new Error(result.message || "Quick Capture could not save. Nothing was changed.");
        const href = safeExactHash(result.canonicalHref);
        if (!href) throw new Error("The capture was saved, but its safe Open link is unavailable.");
        lastResult = Object.freeze({ ...result, canonicalHref:href });
        rememberRecentResult(lastResult);
        editor.hidden = true;
        success.hidden = false;
        openResult.href = href;
        form.querySelector("[data-quick-capture-success-message]").textContent = result.message;
        setStatus("success", result.alreadyExisted ? "Already saved" : "Saved", result.message);
        if (typeof toast === "function") toast(result.message);
        success.focus();
      } catch (error) {
        const message = error?.message || "Quick Capture could not save. Nothing was changed.";
        errorNode.textContent = message;
        errorNode.hidden = false;
        setStatus("error", "Quick Capture was not saved", message);
      } finally {
        delete form.dataset.submitting;
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }

    form.addEventListener("change", (event) => {
      if (event.target.name === "intent") updateDestination();
    });
    suggestionAction.addEventListener("click", () => {
      const input = form.querySelector('input[name="intent"][value="' + CSS.escape(suggestedIntent) + '"]');
      if (!input || input.disabled) return;
      input.checked = true;
      updateDestination();
      form.elements.title.focus();
    });
    openResult.addEventListener("click", (event) => {
      event.preventDefault();
      if (!lastResult?.canonicalHref) return;
      window.__LE_GLOBAL_CREATE?.closeWorkspace?.({ force:true, returnFocus:false });
      location.hash = lastResult.canonicalHref.replace(/^#/, "");
      requestAnimationFrame(renderRecentExactResult);
    });
    form.querySelector("[data-quick-capture-another]").addEventListener("click", () => {
      form.reset();
      form.elements.creationRequestId.value = newRequestId();
      prepare();
      form.querySelector('input[name="intent"]:not([disabled])')?.focus();
    });
    document.addEventListener("vnext:quick-capture-opened", (event) => prepare({ suggestionIntent:event.detail?.suggestedIntent || "" }));
    window.addEventListener("hashchange", () => queueMicrotask(renderRecentExactResult));
    const app = document.querySelector("main#app");
    if (app) new MutationObserver(renderRecentExactResult).observe(app, { childList:true });
    document.addEventListener("vnext:open-quick-capture", (event) => {
      event.preventDefault();
      window.__LE_GLOBAL_CREATE?.openWorkflow?.("quick-note", {
        returnTarget:event.detail?.returnTarget || document.activeElement,
        suggestedIntent:event.detail?.suggestedIntent || ""
      });
    });
    document.addEventListener("vnext:session-expired", () => {
      form.reset();
      clearResult();
      suggestedIntent = "";
      capabilitiesLoaded = false;
      enabledIntents = new Set();
    });
    window.__LE_QUICK_CAPTURE = Object.freeze({ submit, prepare, open:(options = {}) => {
      window.__LE_GLOBAL_CREATE?.openWorkflow?.("quick-note", options);
    } });
  })();`;
}
