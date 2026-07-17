import {
  INBOX_ACTION_ENDPOINT,
  INBOX_ACTION_PRESENTATION
} from "../ui-actions/inbox-actions.mjs";

export function renderInboxActionLayer() {
  return `<div class="vnext-inbox-action-announcer" data-inbox-action-announcer role="status" aria-live="polite" tabindex="-1"></div>
  <dialog class="vnext-inbox-action-dialog" data-inbox-action-dialog aria-labelledby="vnext-inbox-action-title" aria-describedby="vnext-inbox-action-explanation">
    <form method="dialog" data-inbox-action-form>
      <div class="vnext-inbox-action-dialog-heading">
        <p class="vnext-inbox-eyebrow">Inbox action</p>
        <h2 id="vnext-inbox-action-title" data-inbox-action-title>Confirm action</h2>
        <p id="vnext-inbox-action-explanation" data-inbox-action-explanation></p>
      </div>
      <fieldset class="vnext-inbox-snooze-options" data-inbox-snooze-options hidden>
        <legend>Return this item to your attention</legend>
        <label><input type="radio" name="inbox-snooze-choice" value="tomorrow" checked /> Tomorrow</label>
        <label><input type="radio" name="inbox-snooze-choice" value="next-week" /> Next week</label>
        <label><input type="radio" name="inbox-snooze-choice" value="choose" /> Choose a date</label>
        <label class="vnext-inbox-snooze-date" data-inbox-snooze-date hidden>Choose a date<input type="date" name="inbox-snooze-date" /></label>
        <p class="vnext-inbox-action-validation" data-inbox-action-validation role="alert"></p>
      </fieldset>
      <div class="vnext-inbox-action-dialog-actions">
        <button type="button" class="vnext-inbox-action-cancel" data-inbox-action-cancel>Cancel</button>
        <button type="submit" class="vnext-inbox-action-confirm" data-inbox-action-confirm>Continue</button>
      </div>
    </form>
  </dialog>`;
}

export function inboxActionBrowserSource() {
  const endpoint = JSON.stringify(INBOX_ACTION_ENDPOINT);
  const presentation = JSON.stringify(INBOX_ACTION_PRESENTATION).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const endpoint = ${endpoint};
    const presentation = ${presentation};
    const metrics = {
      requests:0,
      duplicateActivations:0,
      duplicateRequests:0,
      inboxRefreshRequests:0,
      badgeRefreshRequests:0,
      fullStateRequests:0,
      successfulTransitions:0,
      alreadyApplied:0,
      lastResponseMs:0,
      lastResponseBytes:0,
      byIntent:{ approve:[], complete:[], snooze:[] }
    };
    window.__LE_INBOX_ACTION_METRICS = metrics;
    const inFlight = new Set();
    let dialogContext = null;
    let lastTrigger = null;
    let retryContext = null;

    function app() { return document.querySelector("main#app"); }
    function node(selector) { return app()?.querySelector(selector) || null; }
    function dialog() { return node("[data-inbox-action-dialog]"); }
    function cookieValue(name) {
      const prefix = name + "=";
      const part = String(document.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
      if (!part) return "";
      try { return decodeURIComponent(part.slice(prefix.length)); } catch { return ""; }
    }
    function requestId() {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return "inbox-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }
    function rowContext(button) {
      const row = button.closest?.("[data-inbox-item]");
      if (!row) return null;
      return {
        row,
        button,
        inboxItemId:String(row.dataset.inboxItemId || ""),
        expectedUpdatedAt:String(row.dataset.inboxItemVersion || ""),
        intent:String(button.dataset.inboxAction || ""),
        requestId:requestId(),
        snoozeUntil:""
      };
    }
    function easternDate(days = 0) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
      const part = (type) => Number(parts.find((entry) => entry.type === type)?.value || 0);
      const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + days, 12));
      return date.toISOString().slice(0, 10);
    }
    function setRowWorking(context, working) {
      const controls = context.row.querySelectorAll("[data-inbox-action]");
      controls.forEach((control) => { control.disabled = working; });
      if (working) {
        context.button.dataset.originalLabel = context.button.textContent;
        context.button.textContent = "Working…";
      } else if (context.button?.isConnected) {
        context.button.textContent = context.button.dataset.originalLabel || presentation[context.intent]?.label || "Try again";
        delete context.button.dataset.originalLabel;
      }
    }
    function itemStatus(context) {
      return context.row.querySelector("[data-inbox-item-action-status]");
    }
    function announce(message, { focus = false } = {}) {
      const target = node("[data-inbox-action-announcer]");
      if (!target) return;
      target.textContent = message;
      target.hidden = !message;
      if (focus) setTimeout(() => target.focus(), 0);
    }
    function clearItemStatus(context) {
      const status = itemStatus(context);
      if (status) status.replaceChildren();
    }
    function failureMessage(intent) {
      if (intent === "approve") return "Approval was not recorded. Nothing was sent or published.";
      if (intent === "complete") return "Task was not completed. No records were changed. Try again.";
      return "Item was not snoozed. No records were changed. Try again.";
    }
    function showFailure(context, message, retryable) {
      const status = itemStatus(context);
      if (!status) return;
      status.replaceChildren();
      const text = document.createElement("span");
      text.textContent = message;
      status.append(text);
      if (retryable) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "vnext-inbox-action-retry";
        retry.dataset.inboxActionRetry = "true";
        retry.textContent = "Try again";
        retryContext = context;
        status.append(retry);
      }
      status.focus();
    }
    function closeDialog({ restoreFocus = true } = {}) {
      const target = dialog();
      if (target?.open) target.close();
      target?.querySelector("[data-inbox-action-validation]")?.replaceChildren();
      if (restoreFocus && lastTrigger?.isConnected) setTimeout(() => lastTrigger.focus(), 0);
      dialogContext = null;
    }
    function openDialog(context) {
      const target = dialog();
      const contract = presentation[context.intent];
      if (!target || !contract?.confirmation) return;
      dialogContext = context;
      lastTrigger = context.button;
      node("[data-inbox-action-title]").textContent = contract.confirmation.title;
      node("[data-inbox-action-explanation]").textContent = contract.confirmation.explanation;
      const confirm = node("[data-inbox-action-confirm]");
      confirm.textContent = contract.confirmation.confirmLabel;
      confirm.disabled = false;
      const options = node("[data-inbox-snooze-options]");
      options.hidden = context.intent !== "snooze";
      if (context.intent === "snooze") {
        target.querySelector('input[value="tomorrow"]').checked = true;
        target.querySelector('[name="inbox-snooze-date"]').value = easternDate(1);
        node("[data-inbox-snooze-date]").hidden = true;
      }
      target.showModal();
      setTimeout(() => (context.intent === "snooze" ? target.querySelector('input[value="tomorrow"]') : confirm)?.focus(), 0);
    }
    function selectedSnoozeDate() {
      const target = dialog();
      const choice = target?.querySelector('[name="inbox-snooze-choice"]:checked')?.value || "tomorrow";
      if (choice === "tomorrow") return easternDate(1);
      if (choice === "next-week") return easternDate(7);
      return String(target?.querySelector('[name="inbox-snooze-date"]')?.value || "");
    }
    async function refreshAfterAction() {
      metrics.inboxRefreshRequests += 1;
      await window.__LE_INBOX_PAGE?.refresh?.();
    }
    async function submitAction(context) {
      const key = context.inboxItemId;
      if (inFlight.has(key)) {
        metrics.duplicateActivations += 1;
        return;
      }
      inFlight.add(key);
      clearItemStatus(context);
      announce("");
      setRowWorking(context, true);
      const confirm = node("[data-inbox-action-confirm]");
      if (confirm && dialog()?.open) {
        confirm.disabled = true;
        confirm.textContent = "Working…";
      }
      const startedAt = performance.now();
      metrics.requests += 1;
      try {
        const response = await fetch(endpoint, {
          method:"POST",
          credentials:"same-origin",
          headers:{
            accept:"application/json",
            "content-type":"application/json",
            "x-csrf-token":cookieValue("leos_csrf")
          },
          body:JSON.stringify({
            inboxItemId:context.inboxItemId,
            intent:context.intent,
            requestId:context.requestId,
            expectedUpdatedAt:context.expectedUpdatedAt,
            ...(context.intent === "snooze" ? { snoozeUntil:context.snoozeUntil } : {})
          })
        });
        const text = await response.text();
        const elapsed = Math.round((performance.now() - startedAt) * 10) / 10;
        const bytes = new TextEncoder().encode(text).byteLength;
        metrics.lastResponseMs = elapsed;
        metrics.lastResponseBytes = bytes;
        metrics.byIntent[context.intent]?.push({ responseMs:elapsed, responseBytes:bytes });
        let payload = {};
        try { payload = JSON.parse(text || "{}"); } catch {}
        if (response.status === 401 || payload.outcome === "session_expired") {
          closeDialog({ restoreFocus:false });
          announce("");
          document.dispatchEvent(new CustomEvent("vnext:session-expired"));
          return;
        }
        if (!response.ok || payload.ok !== true) {
          closeDialog();
          const safe = ["stale", "not_available", "invalid"].includes(payload.outcome) && payload.message
            ? payload.message
            : failureMessage(context.intent);
          showFailure(context, safe, response.status >= 500 || response.status === 429);
          if (payload.outcome === "stale") await refreshAfterAction();
          return;
        }
        if (payload.alreadyApplied) metrics.alreadyApplied += 1;
        else metrics.successfulTransitions += 1;
        closeDialog({ restoreFocus:false });
        announce(payload.message || "Inbox updated.", { focus:true });
        retryContext = null;
        await refreshAfterAction();
      } catch {
        closeDialog();
        showFailure(context, failureMessage(context.intent), true);
      } finally {
        inFlight.delete(key);
        setRowWorking(context, false);
        if (confirm?.isConnected) {
          confirm.disabled = false;
          confirm.textContent = presentation[context.intent]?.confirmation?.confirmLabel || "Continue";
        }
      }
    }
    function bind() {
      const target = app();
      if (!target || target.dataset.inboxActionsBound === "true") return;
      target.dataset.inboxActionsBound = "true";
      target.addEventListener("click", (event) => {
        const action = event.target.closest?.("[data-inbox-action]");
        if (action) {
          const context = rowContext(action);
          if (!context || !presentation[context.intent]) return;
          if (presentation[context.intent].confirmation) openDialog(context);
          else submitAction(context);
          return;
        }
        if (event.target.closest?.("[data-inbox-action-cancel]")) closeDialog();
        if (event.target.closest?.("[data-inbox-action-retry]") && retryContext) submitAction(retryContext);
      });
      target.addEventListener("change", (event) => {
        const choice = event.target.closest?.('[name="inbox-snooze-choice"]');
        if (!choice) return;
        node("[data-inbox-snooze-date]").hidden = choice.value !== "choose";
        if (choice.value === "choose") node('[name="inbox-snooze-date"]')?.focus();
      });
      target.addEventListener("submit", (event) => {
        if (!event.target.matches?.("[data-inbox-action-form]")) return;
        event.preventDefault();
        if (!dialogContext) return;
        if (dialogContext.intent === "snooze") {
          const date = selectedSnoozeDate();
          const validation = node("[data-inbox-action-validation]");
          if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || date <= easternDate(0)) {
            validation.textContent = "Choose a future date.";
            return;
          }
          validation.textContent = "";
          dialogContext.snoozeUntil = date;
        }
        submitAction(dialogContext);
      });
      dialog()?.addEventListener("cancel", (event) => {
        if (dialogContext && inFlight.has(dialogContext.inboxItemId)) event.preventDefault();
        else closeDialog();
      });
    }
    document.addEventListener("vnext:session-expired", () => {
      closeDialog({ restoreFocus:false });
      dialogContext = null;
      retryContext = null;
    });
    document.addEventListener("vnext:recovery-mode", () => closeDialog({ restoreFocus:false }));
    new MutationObserver(() => bind()).observe(document.documentElement, { childList:true, subtree:true });
    bind();
  })();`;
}
