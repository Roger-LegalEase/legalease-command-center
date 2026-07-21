export const TASK_WORKBENCH_STYLESHEET_PATH = "assets/ui/task-workbench.css";
export const TASK_WORKBENCH_ENDPOINT_PREFIX = "/api/ui/tasks/";

export function taskWorkbenchBrowserSource() {
  const endpointPrefix = JSON.stringify(TASK_WORKBENCH_ENDPOINT_PREFIX);
  return `(() => {
    "use strict";
    const endpointPrefix = ${endpointPrefix};
    const statusLabels = Object.freeze({ open:"Open", in_progress:"In progress", waiting:"Waiting", blocked:"Blocked", done:"Done", archived:"Archived" });
    const actionLabels = Object.freeze({ done:"Completing…", in_progress:"Saving…", waiting:"Saving…", blocked:"Saving…", snooze:"Saving…", update_due_date:"Saving…", update_priority:"Saving…", add_note:"Saving…", reopen:"Reopening…" });
    let current = null;
    let lastTrigger = null;
    let inFlight = false;
    let savedScroll = { x:0, y:0 };

    function cookieValue(name) {
      const prefix = name + "=";
      const part = String(document.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
      if (!part) return "";
      try { return decodeURIComponent(part.slice(prefix.length)); } catch { return ""; }
    }
    function layer() { return document.querySelector("[data-task-workbench]"); }
    function node(selector) { return layer()?.querySelector(selector) || null; }
    function text(tag, value, className = "") {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = String(value || "");
      return element;
    }
    function ensureLayer() {
      if (layer()) return layer();
      const dialog = document.createElement("dialog");
      dialog.className = "founder-task-drawer";
      dialog.dataset.taskWorkbench = "true";
      dialog.setAttribute("aria-labelledby", "founder-task-title");
      dialog.innerHTML = '<div class="founder-task-frame">'
        + '<header class="founder-task-header"><div><p class="founder-task-eyebrow">Task</p><h2 id="founder-task-title" data-task-title>Task</h2></div><button type="button" class="founder-task-close" data-task-close aria-label="Close task panel">×</button></header>'
        + '<div class="founder-task-announcer" data-task-announcer role="status" aria-live="polite"></div>'
        + '<div class="founder-task-loading" data-task-loading><span aria-hidden="true"></span><div><strong>Opening task</strong><p>Loading the latest saved details.</p></div></div>'
        + '<div class="founder-task-error" data-task-error hidden role="alert"><h3>Task could not load</h3><p>No changes were made.</p><button type="button" data-task-retry>Try again</button></div>'
        + '<div class="founder-task-content" data-task-content hidden>'
          + '<div class="founder-task-summary"><div class="founder-task-heading-row"><span class="founder-status-chip" data-task-status-chip></span><span class="founder-priority-chip" data-task-priority-chip></span></div><p data-task-description></p><dl class="founder-task-facts" data-task-facts></dl><div class="founder-task-callout" data-task-context hidden></div></div>'
          + '<section class="founder-task-section" aria-labelledby="founder-task-actions-title"><div class="founder-task-section-heading"><div><p class="founder-task-eyebrow">Move it forward</p><h3 id="founder-task-actions-title">Update task</h3></div></div><div class="founder-task-status-actions" data-task-status-actions></div>'
            + '<div class="founder-task-form-grid">'
              + '<form data-task-form="waiting"><label>Waiting on<input name="waitingOn" type="text" maxlength="500" placeholder="Person, decision, or dependency" /></label><p class="founder-field-error" data-task-field-error="waitingOn"></p><button type="submit">Set waiting</button></form>'
              + '<form data-task-form="blocked"><label>Blocker reason<input name="blockerReason" type="text" maxlength="500" placeholder="What prevents progress?" /></label><p class="founder-field-error" data-task-field-error="blockerReason"></p><button type="submit">Mark blocked</button></form>'
              + '<form data-task-form="due"><label>Due date<input name="dueDate" type="date" /></label><p class="founder-field-error" data-task-field-error="dueDate"></p><button type="submit">Change due date</button></form>'
              + '<form data-task-form="priority"><label>Priority<select name="priority"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><p class="founder-field-error" data-task-field-error="priority"></p><button type="submit">Change priority</button></form>'
              + '<form data-task-form="snooze"><label>Snooze<select name="days"><option value="1">Until tomorrow</option><option value="3">For 3 days</option><option value="7">For 1 week</option><option value="14">For 2 weeks</option><option value="30">For 30 days</option></select></label><p class="founder-field-error" data-task-field-error="days"></p><button type="submit">Snooze</button></form>'
            + '</div>'
            + '<form class="founder-task-note-form" data-task-form="note"><label>Note or completion detail<textarea name="note" maxlength="2000" rows="3" placeholder="Add context that will help when you return."></textarea></label><p class="founder-field-error" data-task-field-error="note"></p><button type="submit">Add note</button></form>'
          + '</section>'
          + '<section class="founder-task-section" aria-labelledby="founder-task-history-title"><div class="founder-task-section-heading"><div><p class="founder-task-eyebrow">Recent activity</p><h3 id="founder-task-history-title">Task history</h3></div></div><ol class="founder-task-timeline" data-task-history></ol></section>'
          + '<footer class="founder-task-footer"><button type="button" class="founder-task-draft" data-task-draft>Draft follow-up</button><div><a data-task-full-record>View full record</a><button type="button" class="founder-task-footer-close" data-task-close>Close</button></div></footer>'
        + '</div>'
      + '</div>';
      document.body.append(dialog);
      bindLayer(dialog);
      return dialog;
    }
    function formatDate(value, includeTime = false) {
      const parsed = Date.parse(value || "");
      if (!Number.isFinite(parsed)) return "Not set";
      return new Intl.DateTimeFormat("en-US", includeTime
        ? { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }
        : { month:"short", day:"numeric", year:"numeric" }
      ).format(new Date(parsed));
    }
    function fact(label, value) {
      const wrapper = document.createElement("div");
      wrapper.append(text("dt", label), text("dd", value || "Not set"));
      return wrapper;
    }
    function setBusy(busy, activeButton = null) {
      inFlight = busy;
      layer()?.querySelectorAll("button, input, select, textarea").forEach((control) => {
        if (!control.matches("[data-task-close]")) control.disabled = busy;
      });
      if (activeButton) {
        if (busy) {
          activeButton.dataset.originalLabel = activeButton.textContent;
          activeButton.textContent = actionLabels[activeButton.dataset.taskAction || activeButton.closest("form")?.dataset.taskForm] || "Saving…";
        } else {
          activeButton.textContent = activeButton.dataset.originalLabel || activeButton.textContent;
          delete activeButton.dataset.originalLabel;
        }
      }
    }
    function announce(message, kind = "success") {
      const target = node("[data-task-announcer]");
      if (!target) return;
      target.textContent = message || "";
      target.dataset.kind = message ? kind : "";
    }
    function clearErrors() {
      layer()?.querySelectorAll("[data-task-field-error]").forEach((error) => { error.textContent = ""; });
    }
    function fieldError(field, message) {
      const target = node('[data-task-field-error="' + field + '"]');
      if (target) target.textContent = message;
    }
    function renderStatusActions(task) {
      const host = node("[data-task-status-actions]");
      host.replaceChildren();
      const actions = new Set(task.actions || []);
      const controls = [
        { action:"done", label:"Mark done", primary:true },
        { action:"in_progress", label:"Mark in progress" },
        { action:"reopen", label:"Reopen" }
      ];
      controls.filter((item) => actions.has(item.action)).forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.taskAction = item.action;
        button.className = item.primary ? "is-primary" : "";
        button.textContent = item.label;
        host.append(button);
      });
    }
    function renderHistory(task) {
      const history = node("[data-task-history]");
      history.replaceChildren();
      for (const entry of task.history || []) {
        const item = document.createElement("li");
        const marker = document.createElement("span");
        marker.setAttribute("aria-hidden", "true");
        const body = document.createElement("div");
        const heading = document.createElement("p");
        heading.append(text("strong", String(entry.action || "Updated").replace(/^./, (value) => value.toUpperCase())));
        if (entry.at) heading.append(document.createTextNode(" · " + formatDate(entry.at, true)));
        body.append(heading);
        if (entry.note) body.append(text("p", entry.note));
        item.append(marker, body);
        history.append(item);
      }
      if (!history.children.length) history.append(text("li", "No task activity has been recorded yet.", "is-empty"));
    }
    function syncForms(task) {
      const set = new Set(task.actions || []);
      const formAction = { waiting:"waiting", blocked:"blocked", due:"update_due_date", priority:"update_priority", snooze:"snooze", note:"add_note" };
      for (const [name, action] of Object.entries(formAction)) {
        const form = node('[data-task-form="' + name + '"]');
        if (form) form.hidden = !set.has(action);
      }
      const due = node('[name="dueDate"]');
      if (due) due.value = /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || "") ? task.dueDate : String(task.dueDate || "").slice(0, 10);
      const priority = node('[name="priority"]');
      if (priority) priority.value = task.priority || "medium";
      const waiting = node('[name="waitingOn"]');
      if (waiting) waiting.value = task.waitingOn || "";
      const blocker = node('[name="blockerReason"]');
      if (blocker) blocker.value = task.blockerReason || "";
      const note = node('[name="note"]');
      if (note) note.value = "";
    }
    function render(payload) {
      current = payload;
      const task = payload.task;
      node("[data-task-loading]").hidden = true;
      node("[data-task-error]").hidden = true;
      node("[data-task-content]").hidden = false;
      node("[data-task-title]").textContent = task.title || "Task";
      node("[data-task-description]").textContent = task.description || "No description has been added.";
      const status = node("[data-task-status-chip]");
      status.textContent = statusLabels[task.status] || task.status || "Open";
      status.dataset.status = task.status || "open";
      const priority = node("[data-task-priority-chip]");
      priority.textContent = (task.priority || "medium").replace(/^./, (value) => value.toUpperCase()) + " priority";
      priority.dataset.priority = task.priority || "medium";
      const facts = node("[data-task-facts]");
      facts.replaceChildren(
        fact("Owner", task.owner),
        fact("Due", formatDate(task.dueDate)),
        fact("Next action", task.nextAction),
        fact("Updated", formatDate(task.updatedAt, true))
      );
      const context = node("[data-task-context]");
      context.replaceChildren();
      const notes = [
        task.waitingOn ? "Waiting on: " + task.waitingOn : "",
        task.blockerReason ? "Blocker: " + task.blockerReason : "",
        task.completionNote ? "Completion note: " + task.completionNote : ""
      ].filter(Boolean);
      if (task.linkedSource) {
        const line = document.createElement("p");
        line.append(text("strong", task.linkedSource.label + ": "));
        const link = document.createElement("a");
        link.href = task.linkedSource.href;
        link.textContent = task.linkedSource.title;
        line.append(link);
        context.append(line);
      }
      notes.forEach((note) => context.append(text("p", note)));
      context.hidden = !context.children.length;
      const full = node("[data-task-full-record]");
      full.href = task.fullRecordHref || "#inbox";
      full.hidden = !task.fullRecordHref;
      renderStatusActions(task);
      syncForms(task);
      renderHistory(task);
      clearErrors();
    }
    function showLoading() {
      announce("");
      node("[data-task-title]").textContent = "Task";
      node("[data-task-loading]").hidden = false;
      node("[data-task-error]").hidden = true;
      node("[data-task-content]").hidden = true;
    }
    function showLoadError(message = "No changes were made. Try again.") {
      node("[data-task-loading]").hidden = true;
      node("[data-task-content]").hidden = true;
      const error = node("[data-task-error]");
      error.hidden = false;
      error.querySelector("p").textContent = message;
    }
    async function loadTask(taskId) {
      try {
        const response = await fetch(endpointPrefix + encodeURIComponent(taskId), { credentials:"same-origin", headers:{ accept:"application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401 || payload.outcome === "session_expired") {
          close({ restoreFocus:false });
          document.dispatchEvent(new CustomEvent("vnext:session-expired"));
          return;
        }
        if (!response.ok || payload.ok !== true) throw new Error(payload.message || "Task could not load.");
        render(payload);
        setTimeout(() => node("[data-task-title]")?.focus(), 0);
        node("[data-task-title]").tabIndex = -1;
      } catch (error) {
        showLoadError(error.message || "No changes were made. Try again.");
      }
    }
    async function open(taskId, trigger = null) {
      const id = String(taskId || "").trim();
      if (!id) return;
      const target = ensureLayer();
      lastTrigger = trigger || document.activeElement;
      savedScroll = { x:window.scrollX, y:window.scrollY };
      target.dataset.taskId = id;
      showLoading();
      if (!target.open) target.showModal();
      await loadTask(id);
    }
    function close({ restoreFocus = true } = {}) {
      const target = layer();
      if (target?.open && !inFlight) target.close();
      current = null;
      if (restoreFocus && lastTrigger?.isConnected) setTimeout(() => lastTrigger.focus(), 0);
    }
    async function refreshContext() {
      const position = { ...savedScroll };
      document.dispatchEvent(new CustomEvent("vnext:task-updated", { detail:{ task:current?.task || null } }));
      await Promise.all([
        Promise.resolve(window.__LE_TODAY_PAGE?.refresh?.()),
        Promise.resolve(window.__LE_INBOX_PAGE?.refresh?.())
      ]);
      requestAnimationFrame(() => window.scrollTo(position.x, position.y));
    }
    async function perform(action, values, button) {
      if (inFlight || !current?.task?.id) return;
      clearErrors();
      announce("");
      setBusy(true, button);
      try {
        const response = await fetch(endpointPrefix + encodeURIComponent(current.task.id) + "/action", {
          method:"POST",
          credentials:"same-origin",
          headers:{ accept:"application/json", "content-type":"application/json", "x-csrf-token":cookieValue("leos_csrf") },
          body:JSON.stringify({ action, expectedVersion:current.task.version, ...values })
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401 || payload.outcome === "session_expired") {
          close({ restoreFocus:false });
          document.dispatchEvent(new CustomEvent("vnext:session-expired"));
          return;
        }
        if (!response.ok || payload.ok !== true) {
          if (payload.field) fieldError(payload.field, payload.message || "Check this field and try again.");
          announce(payload.message || "Task could not be updated. No changes were made.", "error");
          if (response.status === 409) await loadTask(current.task.id);
          return;
        }
        render(payload);
        announce(payload.message || "Task updated.");
        await refreshContext();
      } catch {
        announce("Task could not be updated. No changes were made. Try again.", "error");
      } finally {
        setBusy(false, button);
      }
    }
    function formValues(name, form) {
      const values = Object.fromEntries(new FormData(form));
      if (name === "waiting") return { action:"waiting", values:{ waitingOn:String(values.waitingOn || "").trim() }, required:["waitingOn"] };
      if (name === "blocked") return { action:"blocked", values:{ blockerReason:String(values.blockerReason || "").trim() }, required:["blockerReason"] };
      if (name === "due") return { action:"update_due_date", values:{ dueDate:String(values.dueDate || "") }, required:["dueDate"] };
      if (name === "priority") return { action:"update_priority", values:{ priority:String(values.priority || "") }, required:["priority"] };
      if (name === "snooze") return { action:"snooze", values:{ days:Number(values.days || 3) }, required:[] };
      return { action:"add_note", values:{ note:String(values.note || "").trim() }, required:["note"] };
    }
    function bindLayer(target) {
      target.addEventListener("click", (event) => {
        if (event.target.closest("[data-task-close]")) { close(); return; }
        if (event.target.closest("[data-task-retry]")) { showLoading(); loadTask(target.dataset.taskId); return; }
        const draft = event.target.closest("[data-task-draft]");
        if (draft) {
          if (typeof window.commandCenterOpenComposer !== "function") { announce("The follow-up composer is still loading. Try again.", "error"); return; }
          const taskId = current?.task?.id;
          const returnTarget = lastTrigger;
          close({ restoreFocus:false });
          window.commandCenterOpenComposer({ sourceKind:"task", sourceId:taskId }, returnTarget);
          return;
        }
        const action = event.target.closest("[data-task-action]");
        if (!action) return;
        const values = action.dataset.taskAction === "done"
          ? { note:String(node('[name="note"]')?.value || "").trim() }
          : {};
        perform(action.dataset.taskAction, values, action);
      });
      target.addEventListener("submit", (event) => {
        const form = event.target.closest("[data-task-form]");
        if (!form) return;
        event.preventDefault();
        const details = formValues(form.dataset.taskForm, form);
        const missing = details.required.find((field) => !String(details.values[field] || "").trim());
        if (missing) {
          fieldError(missing, missing === "waitingOn" ? "Say what this is waiting on." : missing === "blockerReason" ? "Add the blocker reason." : missing === "note" ? "Enter a note before saving." : "Choose a value.");
          form.elements[missing]?.focus();
          return;
        }
        perform(details.action, details.values, form.querySelector("button[type='submit']"));
      });
      target.addEventListener("cancel", (event) => {
        if (inFlight) event.preventDefault();
        else close();
      });
      target.addEventListener("click", (event) => {
        if (event.target === target && !inFlight) close();
      });
    }
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-task-open]");
      if (!trigger) return;
      event.preventDefault();
      open(trigger.dataset.taskId, trigger);
    });
    document.addEventListener("vnext:session-expired", () => close({ restoreFocus:false }));
    document.addEventListener("vnext:recovery-mode", () => close({ restoreFocus:false }));
    window.__LE_TASK_WORKBENCH = Object.freeze({ open, close });
    ensureLayer();
  })();`;
}
