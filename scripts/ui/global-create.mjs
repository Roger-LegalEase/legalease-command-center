import { escapeAttribute, escapeHtml } from "./html.mjs";
import { GLOBAL_CREATE_LABELS, GLOBAL_UTILITIES } from "./labels.mjs";
import { renderActionStatus } from "./feedback.mjs";
import { renderButton } from "./primitives.mjs";
import { renderQuickCaptureForm } from "./quick-capture.mjs";

const freezeList = (values) => Object.freeze(values.map((value) => Object.freeze({ ...value })));

export const GLOBAL_CREATE_MENU_ID = "vnext-global-create-menu";
export const GLOBAL_CREATE_WORKSPACE_ID = "vnext-global-create-workspace";

export const GLOBAL_CREATE_OPTIONS = freezeList([
  {
    id:"social-post",
    label:GLOBAL_CREATE_LABELS.socialPost,
    endpoint:"/api/ui/create/post",
    objectType:"Post",
    destination:"Social",
    description:"Start an inert idea or draft. Nothing is scheduled or published."
  },
  {
    id:"outreach-campaign",
    label:GLOBAL_CREATE_LABELS.outreachCampaign,
    endpoint:"/api/ui/create/campaign",
    objectType:"Campaign",
    destination:"Outreach",
    description:"Start a campaign draft with no recipients and no sending."
  },
  {
    id:"partner",
    label:GLOBAL_CREATE_LABELS.partner,
    endpoint:"/api/ui/create/partner",
    objectType:"Partner",
    destination:"Partners",
    description:"Add a new partner record without outreach or automatic qualification."
  },
  {
    id:"file-or-folder",
    label:GLOBAL_CREATE_LABELS.fileOrFolder,
    endpoint:"/api/ui/create/file",
    objectType:"File",
    destination:"Files",
    description:"Add a real document record. Persistent folders are not available yet."
  },
  {
    id:"quick-note",
    label:GLOBAL_CREATE_LABELS.quickNote,
    endpoint:"/api/ui/quick-capture",
    objectType:"Note",
    destination:"Selected before save",
    description:"Choose one of seven reviewed capture intents and confirm its destination before saving."
  }
]);

export const GLOBAL_CREATE_CONTRACT = Object.freeze({
  triggerLabel:GLOBAL_UTILITIES.create,
  menuId:GLOBAL_CREATE_MENU_ID,
  workspaceId:GLOBAL_CREATE_WORKSPACE_ID,
  options:GLOBAL_CREATE_OPTIONS,
  folderSupport:false,
  folderDeferral:"Folders are not available in the current Files system yet."
});

export function buildGlobalCreateViewModel(decisions = {}) {
  return Object.freeze({
    items:Object.freeze(GLOBAL_CREATE_OPTIONS.map((option) => {
      const decision = decisions[option.id] || {};
      return Object.freeze({
        id:option.id,
        label:option.label,
        enabled:decision.enabled === true,
        reason:decision.enabled === true ? "" : String(decision.reason || "This action is not available for your account.").trim()
      });
    }))
  });
}

export function renderGlobalCreateMenu(viewModel = buildGlobalCreateViewModel()) {
  const decisions = new Map((viewModel.items || []).map((item) => [item.id, item]));
  return GLOBAL_CREATE_OPTIONS.map((option) => {
    const decision = decisions.get(option.id) || { enabled:false, reason:"Checking access…" };
    const reason = decision.enabled ? option.description : decision.reason;
    return `<button role="menuitem" type="button" data-global-create-option="${escapeAttribute(option.id)}" aria-disabled="${decision.enabled ? "false" : "true"}"${decision.enabled ? "" : " disabled"}><strong>${escapeHtml(option.label)}</strong><span data-global-create-explanation>${escapeHtml(reason)}</span></button>`;
  }).join("");
}

const field = ({ label, name, type = "text", required = false, maxLength = 0, options = [], placeholder = "" }) => {
  const id = `global-create-${name}`;
  const common = `id="${escapeAttribute(id)}" name="${escapeAttribute(name)}"${required ? " required" : ""}${maxLength ? ` maxlength="${maxLength}"` : ""}`;
  if (type === "textarea") return `<label for="${escapeAttribute(id)}">${escapeHtml(label)}${required ? " <span aria-hidden=\"true\">*</span>" : ""}</label><textarea ${common}${placeholder ? ` placeholder="${escapeAttribute(placeholder)}"` : ""}></textarea>`;
  if (type === "select") return `<label for="${escapeAttribute(id)}">${escapeHtml(label)}${required ? " <span aria-hidden=\"true\">*</span>" : ""}</label><select ${common}>${options.map((option) => `<option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>`).join("")}</select>`;
  return `<label for="${escapeAttribute(id)}">${escapeHtml(label)}${required ? " <span aria-hidden=\"true\">*</span>" : ""}</label><input ${common} type="${escapeAttribute(type)}"${placeholder ? ` placeholder="${escapeAttribute(placeholder)}"` : ""}>`;
};

function workflowForm({ id, title, description, fields, extra = "", submitLabel = `Create ${title.toLowerCase()}` }) {
  return `<form class="vnext-create-form" data-global-create-form="${escapeAttribute(id)}" hidden novalidate>
    <div class="vnext-create-form-header"><h2 id="vnext-create-title-${escapeAttribute(id)}">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
    <input type="hidden" name="creationRequestId" value="">
    <div class="vnext-create-fields">${fields}</div>${extra}
    <div class="vnext-create-inline-error" role="alert" hidden></div>
    <footer>
      ${renderButton({ label:"Cancel", intent:"secondary", action:"global-create-cancel" })}
      ${renderButton({ label:submitLabel, intent:"primary", type:"submit" })}
    </footer>
  </form>`;
}

export function renderGlobalCreateWorkspace() {
  const forms = [
    workflowForm({
      id:"social-post",
      title:"Social post",
      description:"Start an idea or draft. Nothing will be scheduled, approved, or published.",
      fields:
        field({ label:"Working title or idea", name:"title", required:true, maxLength:160 }) +
        field({ label:"Draft copy or notes", name:"draftCopy", type:"textarea", maxLength:5000 }) +
        field({ label:"Channel preference", name:"channel", type:"select", options:[
          { value:"", label:"No preference" }, { value:"linkedin", label:"LinkedIn" },
          { value:"instagram", label:"Instagram" }, { value:"facebook", label:"Facebook" },
          { value:"x", label:"X" }, { value:"threads", label:"Threads" }
        ] })
    }),
    workflowForm({
      id:"outreach-campaign",
      title:"Outreach campaign",
      description:"Start an inert campaign draft. No audience will be selected and nothing will be sent.",
      fields:
        field({ label:"Campaign name", name:"campaignName", required:true, maxLength:160 }) +
        field({ label:"Campaign type", name:"campaignType", type:"select", required:true, options:[
          { value:"partner_outreach", label:"Partner outreach" },
          { value:"customer_reengagement", label:"Customer re-engagement" },
          { value:"announcement", label:"Announcement" }
        ] }) +
        field({ label:"Goal or desired outcome", name:"goal", type:"textarea", maxLength:1000 })
    }),
    workflowForm({
      id:"partner",
      title:"Partner",
      description:"Add a Partner at the New stage. This will not send email, create a campaign, or activate a page.",
      fields:
        field({ label:"Organization name", name:"organizationName", required:true, maxLength:160 }) +
        field({ label:"Partner type", name:"partnerType", type:"select", options:[
          { value:"", label:"Not selected" }, { value:"nonprofit", label:"Nonprofit" },
          { value:"legal_aid", label:"Legal aid" }, { value:"government", label:"Government" },
          { value:"workforce", label:"Workforce" }, { value:"funder", label:"Funder" },
          { value:"enterprise", label:"Enterprise" }, { value:"other", label:"Other" }
        ] }) +
        field({ label:"Primary contact name", name:"primaryContactName", maxLength:160 }) +
        field({ label:"Primary contact email", name:"primaryContactEmail", type:"email", maxLength:254 }) +
        field({ label:"Geography or jurisdiction", name:"geography", maxLength:160 }) +
        field({ label:"First next action", name:"nextAction", type:"textarea", maxLength:1000 })
    }),
    workflowForm({
      id:"file-or-folder",
      title:"File or folder",
      description:"Add a document record to the current Investor Room collection. This does not upload a binary file or share it externally.",
      submitLabel:"Add document record",
      fields:
        field({ label:"Name", name:"name", required:true, maxLength:200 }) +
        field({ label:"Collection or section", name:"section", type:"select", options:[
          { value:"Company overview", label:"Company overview" }, { value:"Product suite", label:"Product suite" },
          { value:"Traction", label:"Traction" }, { value:"Partner pipeline", label:"Partner pipeline" },
          { value:"Campaigns", label:"Campaigns" }, { value:"Compliance", label:"Compliance" },
          { value:"Technical architecture", label:"Technical architecture" }, { value:"Security", label:"Security" },
          { value:"Financial model", label:"Financial model" }, { value:"Other", label:"Other" }
        ] }) +
        field({ label:"Safe source link", name:"sourceLink", type:"url", maxLength:1000, placeholder:"https://example.com/document" }) +
        field({ label:"Notes", name:"notes", type:"textarea", maxLength:2000 }),
      extra:`<section class="vnext-folder-deferral" aria-label="Folder availability"><button type="button" disabled aria-disabled="true">Create folder</button><p>${escapeHtml(GLOBAL_CREATE_CONTRACT.folderDeferral)}</p></section>`
    }),
    renderQuickCaptureForm()
  ].join("");
  return `<div class="vnext-create-backdrop" data-global-create-backdrop hidden></div>
  <section class="vnext-create-workspace" id="${GLOBAL_CREATE_WORKSPACE_ID}" role="dialog" aria-modal="true" aria-labelledby="vnext-create-active-title" hidden tabindex="-1">
    <button class="vnext-create-close" type="button" data-global-create-close aria-label="Close creation workspace">×</button>
    <span class="sr-only" id="vnext-create-active-title">Create</span>
    <div class="vnext-create-status" aria-live="polite">${renderActionStatus({ kind:"informational", title:"Choose what to create", message:"Nothing is saved until you submit the form." })}</div>
    ${forms}
  </section>`;
}

export function globalCreateBrowserSource() {
  const options = JSON.stringify(GLOBAL_CREATE_OPTIONS).replaceAll("<", "\\u003c");
  const menuId = JSON.stringify(GLOBAL_CREATE_MENU_ID);
  const workspaceId = JSON.stringify(GLOBAL_CREATE_WORKSPACE_ID);
  return `(() => {
    "use strict";
    const options = ${options};
    const byId = new Map(options.map((option) => [option.id, option]));
    const trigger = document.querySelector(".vnext-create-trigger");
    const menu = document.getElementById(${menuId});
    const workspace = document.getElementById(${workspaceId});
    const backdrop = document.querySelector("[data-global-create-backdrop]");
    if (!trigger || !menu || !workspace || !backdrop) return;
    let capabilitiesLoaded = false;
    let capabilitiesLoading = null;
    let activeForm = null;
    let returnTarget = trigger;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const cookieValue = (name) => document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1) || "";
    const requestId = () => globalThis.crypto?.randomUUID?.() || "create-" + Date.now() + "-" + Math.random().toString(16).slice(2);

    function setStatus(kind, title, message = "") {
      const status = workspace.querySelector(".vnext-create-status");
      if (!status) return;
      status.innerHTML = '<div class="ui-action-status ui-action-status--' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '" aria-live="' + (kind === "error" ? "assertive" : "polite") + '"><strong></strong><p></p></div>';
      status.querySelector("strong").textContent = title;
      status.querySelector("p").textContent = message;
    }

    async function loadCapabilities() {
      if (capabilitiesLoaded) return;
      if (capabilitiesLoading) return capabilitiesLoading;
      capabilitiesLoading = fetch("/api/ui/create/capabilities", { credentials:"same-origin", headers:{ accept:"application/json" } })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error("Create options are unavailable.");
          const decisions = new Map((payload.items || []).map((item) => [item.id, item]));
          menu.querySelectorAll("[data-global-create-option]").forEach((control) => {
            const decision = decisions.get(control.dataset.globalCreateOption) || {};
            const enabled = decision.enabled === true;
            control.disabled = !enabled;
            control.setAttribute("aria-disabled", enabled ? "false" : "true");
            const explanation = control.querySelector("[data-global-create-explanation]");
            if (explanation) explanation.textContent = enabled ? byId.get(control.dataset.globalCreateOption)?.description || "" : decision.reason || "This action is not available for your account.";
          });
          capabilitiesLoaded = true;
        })
        .catch((error) => {
          menu.querySelectorAll("[data-global-create-explanation]").forEach((node) => { node.textContent = error.message || "Create options are unavailable."; });
        })
        .finally(() => { capabilitiesLoading = null; });
      return capabilitiesLoading;
    }

    function enabledMenuItems() {
      return [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];
    }

    async function openMenu({ focusFirst = false } = {}) {
      document.dispatchEvent(new CustomEvent("vnext:close-navigation"));
      document.dispatchEvent(new CustomEvent("vnext:request-close-global-search"));
      document.dispatchEvent(new CustomEvent("vnext:close-shell-popovers"));
      await loadCapabilities();
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (focusFirst) enabledMenuItems()[0]?.focus();
    }

    function closeMenu({ returnFocus = false } = {}) {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
    }

    function formIsDirty(form) {
      return [...new FormData(form).entries()].some(([name, value]) => name !== "creationRequestId" && String(value || "").trim());
    }

    function closeWorkspace({ force = false, returnFocus = true } = {}) {
      if (!workspace.hidden && activeForm && !force && formIsDirty(activeForm)) {
        const approved = window.confirm("Close without saving? Nothing has been saved.");
        if (!approved) return false;
      }
      workspace.hidden = true;
      backdrop.hidden = true;
      document.body.classList.remove("vnext-create-open");
      activeForm = null;
      if (returnFocus) returnTarget?.focus?.();
      return true;
    }

    function openWorkflow(id, openOptions = {}) {
      const option = byId.get(id);
      const form = workspace.querySelector('[data-global-create-form="' + CSS.escape(id) + '"]');
      if (!option || !form) return;
      closeMenu({ returnFocus:false });
      document.querySelector("[data-shell-drawer]")?.removeAttribute("data-create-pending");
      workspace.querySelectorAll("[data-global-create-form]").forEach((candidate) => { candidate.hidden = candidate !== form; });
      form.reset();
      form.elements.creationRequestId.value = requestId();
      form.querySelector(".vnext-create-inline-error").hidden = true;
      activeForm = form;
      returnTarget = openOptions.returnTarget || trigger;
      workspace.hidden = false;
      backdrop.hidden = false;
      document.body.classList.add("vnext-create-open");
      setStatus("informational", "Nothing has been saved yet", option.description);
      setTimeout(() => form.querySelector("input:not([type=hidden]), textarea, select")?.focus(), 0);
      if (id === "quick-note") {
        document.dispatchEvent(new CustomEvent("vnext:quick-capture-opened", {
          detail:{ suggestedIntent:openOptions.suggestedIntent || "" }
        }));
      }
    }

    async function submitForm(form) {
      const id = form.dataset.globalCreateForm;
      const option = byId.get(id);
      const errorNode = form.querySelector(".vnext-create-inline-error");
      if (!option || form.dataset.submitting === "true") return;
      if (id === "quick-note" && window.__LE_QUICK_CAPTURE?.submit) {
        await window.__LE_QUICK_CAPTURE.submit();
        return;
      }
      errorNode.hidden = true;
      if (!form.checkValidity()) {
        errorNode.textContent = "Add the required information and try again. Nothing has been saved.";
        errorNode.hidden = false;
        form.reportValidity();
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      const payload = Object.fromEntries(new FormData(form).entries());
      form.dataset.submitting = "true";
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      setStatus("working", "Working", option.label + " is being created safely.");
      try {
        const response = await fetch(option.endpoint, {
          method:"POST",
          credentials:"same-origin",
          headers:{ "content-type":"application/json", "x-csrf-token":decodeURIComponent(cookieValue("leos_csrf")) },
          body:JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.safeMessage || result.error || option.label + " was not created. Nothing was saved.");
        setStatus("success", result.alreadyExisted ? "Already created" : "Created", result.title + " is ready to open.");
        if (typeof toast === "function") toast(result.alreadyExisted ? result.title + " was already created." : result.title + " created.");
        if (typeof load === "function") await load();
        closeWorkspace({ force:true, returnFocus:false });
        if (result.canonicalHref) location.hash = String(result.canonicalHref).replace(/^#/, "");
      } catch (error) {
        const message = error?.message || option.label + " was not created. Nothing was saved.";
        errorNode.textContent = message;
        errorNode.hidden = false;
        setStatus("error", option.label + " was not created", message);
      } finally {
        delete form.dataset.submitting;
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
      }
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (menu.hidden) openMenu();
      else closeMenu();
    });
    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openMenu({ focusFirst:true });
    });
    menu.addEventListener("click", (event) => {
      const control = event.target.closest("[data-global-create-option]");
      if (!control || control.disabled) return;
      openWorkflow(control.dataset.globalCreateOption);
    });
    menu.addEventListener("keydown", (event) => {
      const items = enabledMenuItems();
      const index = items.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length]?.focus();
      } else if (["Home", "End"].includes(event.key)) {
        event.preventDefault();
        items[event.key === "Home" ? 0 : items.length - 1]?.focus();
      } else if (["Enter", " "].includes(event.key)) {
        const control = event.target.closest("[data-global-create-option]");
        if (!control || control.disabled) return;
        event.preventDefault();
        openWorkflow(control.dataset.globalCreateOption);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ returnFocus:true });
      }
    });
    workspace.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.target.matches("[data-global-create-form]")) return;
      submitForm(event.target);
    });
    workspace.addEventListener("click", (event) => {
      if (event.target.closest("[data-global-create-close], [data-action=global-create-cancel]")) closeWorkspace();
    });
    backdrop.addEventListener("click", () => closeWorkspace());
    document.addEventListener("click", (event) => {
      if (!menu.hidden && !event.target.closest(".vnext-menu")) closeMenu({ returnFocus:true });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !workspace.hidden) {
        event.preventDefault();
        closeWorkspace();
        return;
      }
      if (event.key !== "Tab" || workspace.hidden) return;
      const controls = [...workspace.querySelectorAll(focusableSelector)].filter((control) => !control.closest("[hidden]") && getComputedStyle(control).display !== "none");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener("vnext:request-close-global-create", (event) => {
      closeMenu({ returnFocus:false });
      if (!closeWorkspace({ force:false, returnFocus:false })) event.preventDefault();
    });
    window.__LE_GLOBAL_CREATE = Object.freeze({
      openWorkflow,
      closeWorkspace,
      setStatus
    });
  })();`;
}
