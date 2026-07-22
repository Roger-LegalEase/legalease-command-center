export const LEE_INBOX_PANEL_STYLESHEET_PATH = "assets/ui/lee-inbox-panel.css";
export const LEE_INBOX_ENDPOINT = "/api/ui/lee-inbox";
export const LEE_INBOX_ACTION_ENDPOINT = "/api/ui/lee-inbox/action";
export const LEE_INBOX_REFRESH_ENDPOINT = "/api/inbox/scan";

export function renderLeeInboxPanelShell() {
  return `<section class="founder-inbox" data-lee-inbox-panel aria-labelledby="founder-inbox-title">
    <header class="founder-inbox__header">
      <div>
        <p class="founder-inbox__eyebrow">Le-E follow-ups</p>
        <div class="founder-inbox__title-row"><h2 id="founder-inbox-title">Conversations needing a next move</h2><span class="founder-inbox__count" data-lee-count hidden></span></div>
        <p class="founder-inbox__intro">A focused view of replies, commitments, relationships, and meeting follow-through.</p>
      </div>
      <button class="founder-inbox__refresh" type="button" data-lee-refresh>Refresh inbox now</button>
    </header>
    <div class="founder-inbox__notice" data-lee-notice role="status" aria-live="polite"></div>
    <form class="founder-inbox__filters" data-lee-filters>
      <label><span>Find a conversation</span><input type="search" name="search" maxlength="100" autocomplete="off" placeholder="Search people, organizations, or next steps"></label>
      <label><span>Category</span><select name="category"><option value="">All follow-ups</option></select></label>
    </form>
    <div class="founder-inbox__body" data-lee-body aria-busy="true">
      <div class="founder-inbox__skeleton" data-lee-loading role="status" aria-label="Loading Le-E follow-ups"><span></span><span></span><span></span></div>
      <div class="founder-inbox__empty" data-lee-empty hidden><h3>You’re caught up</h3><p>No conversation follow-ups match this view.</p></div>
      <div class="founder-inbox__error" data-lee-error hidden role="alert"><h3>Follow-ups could not load</h3><p>No changes were made. Try again.</p><button type="button" data-lee-retry>Try again</button></div>
      <ol class="founder-inbox__list" data-lee-list aria-label="Le-E follow-ups"></ol>
      <button class="founder-inbox__more" type="button" data-lee-more hidden>Show more</button>
    </div>
  </section>`;
}

export function leeInboxPanelBrowserSource() {
  const endpoints = JSON.stringify({
    view:LEE_INBOX_ENDPOINT,
    action:LEE_INBOX_ACTION_ENDPOINT,
    refresh:LEE_INBOX_REFRESH_ENDPOINT
  }).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const endpoints = ${endpoints};
    const labels = Object.freeze({
      "needs reply":"Needs your reply",
      "went quiet":"They went quiet",
      "founder commitment":"You made a commitment",
      "their commitment":"They made a commitment",
      "partner opportunity":"New Partner opportunity",
      investor:"New investor interaction",
      press:"New press interaction",
      vendor:"Vendor action needed",
      customer:"Customer issue",
      internal:"Internal team follow-up",
      "meeting prep":"Meeting preparation",
      "post-meeting follow-up":"Post-meeting follow-up"
    });
    const filterKey = "legalease-founder-inbox-filters";
    let payload = null;
    let requestSequence = 0;
    let pending = null;
    let visibleLimit = 8;
    let debounce = 0;
    let sessionEnded = false;
    const busyItems = new Set();

    function app() { return document.querySelector("main#app"); }
    function root() { return app()?.querySelector("[data-lee-inbox-panel]") || null; }
    function node(selector) { return root()?.querySelector(selector) || null; }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function active() { const route = resolution(); return route?.kind === "page" && route.canonicalRoute === "inbox"; }
    function cookieValue(name) { return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1) || ""; }
    function requestId(prefix) { return prefix + "_" + crypto.randomUUID().replaceAll("-", ""); }
    function text(tag, value, className = "") { const element = document.createElement(tag); if (className) element.className = className; element.textContent = String(value ?? ""); return element; }
    function safeHref(value) { const href = String(value || "").trim(); try { const parsed = new URL(href); return parsed.protocol === "https:" && ["mail.google.com", "calendar.google.com"].includes(parsed.hostname) ? parsed.toString() : ""; } catch { return ""; } }
    function today(offset = 0) { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
    function readFilters() { try { const value = JSON.parse(sessionStorage.getItem(filterKey) || "{}"); return { search:String(value.search || "").slice(0, 100), category:labels[value.category] ? value.category : "" }; } catch { return { search:"", category:"" }; } }
    function writeFilters(filters) { try { sessionStorage.setItem(filterKey, JSON.stringify(filters)); } catch {} }
    function currentFilters() { const form = node("[data-lee-filters]"); if (!form) return readFilters(); const values = Object.fromEntries(new FormData(form)); return { search:String(values.search || "").trim().slice(0, 100), category:labels[values.category] ? String(values.category) : "" }; }
    function setNotice(message = "", kind = "success") { const target = node("[data-lee-notice]"); if (!target) return; target.textContent = message; target.dataset.kind = message ? kind : ""; }
    function setLoading(loading) { const body = node("[data-lee-body]"); const skeleton = node("[data-lee-loading]"); if (body) body.setAttribute("aria-busy", loading ? "true" : "false"); if (skeleton) skeleton.hidden = !loading; }
    function showError(message) { setLoading(false); node("[data-lee-list]")?.replaceChildren(); const empty = node("[data-lee-empty]"); if (empty) empty.hidden = true; const target = node("[data-lee-error]"); if (!target) return; target.hidden = false; const detail = target.querySelector("p"); if (detail) detail.textContent = message || "No changes were made. Try again."; }
    function formControl(labelText, name, type, options = {}) {
      const label = document.createElement("label");
      const caption = text("span", labelText);
      const input = document.createElement("input");
      input.name = name; input.type = type; input.required = true;
      if (options.maxLength) input.maxLength = options.maxLength;
      if (options.min) input.min = options.min;
      if (options.value) input.value = options.value;
      if (options.placeholder) input.placeholder = options.placeholder;
      label.append(caption, input);
      return { label, input };
    }
    function actionButton(label, action, tone = "secondary") { const button = text("button", label, "founder-inbox__action founder-inbox__action--" + tone); button.type = "button"; button.dataset.leeAction = action; return button; }
    function externalLink(label, href) { const link = text("a", label, "founder-inbox__action founder-inbox__action--quiet"); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; return link; }
    function inlineForm(item, kind) {
      const form = document.createElement("form");
      form.className = "founder-inbox__inline-form";
      form.dataset.leeInlineForm = kind;
      form.dataset.leeItemId = item.id;
      if (kind === "set_next_action") {
        const action = formControl("Next action", "nextAction", "text", { maxLength:500, value:item.suggestedNextAction || "", placeholder:"What should happen next?" });
        const due = formControl("Due date", "dueDate", "date", { min:today(), value:item.dueAt ? String(item.dueAt).slice(0, 10) : today(2) });
        form.append(action.label, due.label);
      } else {
        const snooze = formControl("Bring this back", "snoozeUntil", "date", { min:today(1), value:today(2) });
        form.append(snooze.label);
      }
      const error = text("p", "", "founder-inbox__field-error"); error.dataset.leeInlineError = "true"; error.setAttribute("role", "alert");
      const controls = document.createElement("div"); controls.className = "founder-inbox__inline-actions";
      const submit = text("button", kind === "set_next_action" ? "Save next action" : "Snooze", "founder-inbox__action founder-inbox__action--primary"); submit.type = "submit";
      const cancel = actionButton("Cancel", "cancel_inline", "quiet");
      controls.append(submit, cancel); form.append(error, controls);
      return form;
    }
    function renderItem(item) {
      const row = document.createElement("li"); row.className = "founder-inbox__item"; row.dataset.leeItem = item.id; row.dataset.version = item.source?.version || "legacy";
      const content = document.createElement("div"); content.className = "founder-inbox__item-content";
      const top = document.createElement("div"); top.className = "founder-inbox__item-top";
      const category = text("span", labels[item.category] || item.category || "Follow-up", "founder-inbox__category");
      category.dataset.category = item.category || "";
      const timing = text("span", item.timingLabel || "Date unavailable", "founder-inbox__timing");
      if (/overdue|today/i.test(item.timingLabel || "")) timing.dataset.attention = "true";
      top.append(category, timing);
      const heading = text("h3", [item.who, item.organization].filter(Boolean).join(" · ") || "Conversation");
      const summary = text("p", item.summary || "This conversation needs review.", "founder-inbox__summary");
      const facts = document.createElement("dl"); facts.className = "founder-inbox__facts";
      [["Next move", item.whoOwesNextMove], ["Confidence", item.confidence?.label], ["Suggested", item.suggestedNextAction]].forEach(([label, value]) => { if (!value) return; const wrapper = document.createElement("div"); wrapper.append(text("dt", label), text("dd", value)); facts.append(wrapper); });
      content.append(top, heading, summary, facts);
      const actions = document.createElement("div"); actions.className = "founder-inbox__actions";
      if (item.actions?.draftReply) { const draft = actionButton("Draft reply", "draft_reply", "primary"); draft.dataset.sourceId = item.source.id; actions.append(draft); }
      if (item.actions?.createTask) actions.append(actionButton("Create task", "create_task"));
      if (item.actions?.setNextAction) actions.append(actionButton("Set next action", "set_next_action"));
      if (item.actions?.snooze) actions.append(actionButton("Snooze", "snooze", "quiet"));
      if (item.actions?.dismiss) actions.append(actionButton("Dismiss", "dismiss", "quiet"));
      if (item.actions?.openRelationship && item.relationship?.id) { const relationship = actionButton("Open relationship", "open_relationship", "quiet"); relationship.dataset.relationshipId = item.relationship.id; actions.append(relationship); }
      const googleHref = safeHref(item.googleContext?.href);
      if (item.actions?.openGoogleContext && googleHref) actions.append(externalLink(item.googleContext.label || "Open Google context", googleHref));
      const status = text("div", "", "founder-inbox__item-status"); status.dataset.leeItemStatus = "true"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
      row.append(content, actions, status);
      return row;
    }
    function syncFilters(nextPayload) {
      const form = node("[data-lee-filters]"); if (!form) return;
      const saved = readFilters();
      const search = form.elements.search; if (search && document.activeElement !== search) search.value = saved.search;
      const select = form.elements.category;
      if (select) {
        const current = saved.category;
        select.replaceChildren();
        const all = document.createElement("option"); all.value = ""; all.textContent = "All follow-ups (" + String(nextPayload.counts?.total || 0) + ")"; select.append(all);
        (nextPayload.categories || []).forEach((category) => { const option = document.createElement("option"); option.value = category; option.textContent = (labels[category] || category) + " (" + String(nextPayload.counts?.byCategory?.[category] || 0) + ")"; select.append(option); });
        select.value = current;
      }
    }
    function render(nextPayload, preserveScroll = false) {
      const savedY = window.scrollY;
      payload = nextPayload;
      setLoading(false);
      const error = node("[data-lee-error]"); if (error) error.hidden = true;
      syncFilters(nextPayload);
      const count = node("[data-lee-count]"); if (count) { count.textContent = String(nextPayload.counts?.visible ?? nextPayload.items?.length ?? 0); count.hidden = false; }
      const refresh = node("[data-lee-refresh]");
      if (refresh) { refresh.disabled = !nextPayload.refresh?.allowed; refresh.title = nextPayload.refresh?.message || ""; }
      const items = Array.isArray(nextPayload.items) ? nextPayload.items : [];
      const list = node("[data-lee-list]"); list?.replaceChildren(...items.slice(0, visibleLimit).map(renderItem));
      const empty = node("[data-lee-empty]"); if (empty) empty.hidden = items.length > 0;
      const more = node("[data-lee-more]"); if (more) { more.hidden = items.length <= visibleLimit; more.textContent = "Show " + String(Math.min(8, items.length - visibleLimit)) + " more"; }
      if (preserveScroll) requestAnimationFrame(() => window.scrollTo({ top:savedY, left:window.scrollX, behavior:"instant" }));
    }
    async function load({ force = false, preserveScroll = false } = {}) {
      if (!active() || sessionEnded || !root()) return null;
      const filters = currentFilters(); writeFilters(filters);
      const query = new URLSearchParams(); if (filters.search) query.set("search", filters.search); if (filters.category) query.set("category", filters.category);
      const key = query.toString();
      if (!force && pending?.key === key) return pending.promise;
      const sequence = ++requestSequence;
      if (!payload) setLoading(true);
      const promise = fetch(endpoints.view + (key ? "?" + key : ""), { credentials:"same-origin", headers:{ accept:"application/json" } }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
        if (!response.ok || body.ok !== true || body.available !== true) throw new Error(body.message || "Follow-ups could not load. No changes were made.");
        if (sequence !== requestSequence || !active()) return null;
        render(body, preserveScroll); return body;
      }).catch((error) => { if (sequence === requestSequence && active()) showError(error.message); return null; }).finally(() => { if (pending?.key === key) pending = null; });
      pending = { key, promise }; return promise;
    }
    function itemFor(row) { return payload?.items?.find((item) => item.id === row?.dataset.leeItem) || null; }
    function setItemBusy(row, busy, button = null, workingLabel = "Working…") {
      const id = row?.dataset.leeItem; if (!id) return;
      if (busy) busyItems.add(id); else busyItems.delete(id);
      row.querySelectorAll("button").forEach((control) => { control.disabled = busy; });
      if (button) { if (busy) { button.dataset.label = button.textContent; button.textContent = workingLabel; } else { button.textContent = button.dataset.label || button.textContent; delete button.dataset.label; } }
    }
    function itemStatus(row, message, kind = "success") { const target = row?.querySelector("[data-lee-item-status]"); if (!target) return; target.textContent = message || ""; target.dataset.kind = message ? kind : ""; }
    async function mutate(row, action, details = {}, button = null) {
      const item = itemFor(row); if (!item || busyItems.has(item.id)) return null;
      setItemBusy(row, true, button, action === "create_task" ? "Creating…" : action === "set_next_action" ? "Saving…" : "Working…"); itemStatus(row, "");
      try {
        const response = await fetch(endpoints.action, { method:"POST", credentials:"same-origin", headers:{ accept:"application/json", "content-type":"application/json", "x-csrf-token":cookieValue("leos_csrf") }, body:JSON.stringify({ itemId:item.id, action, requestId:requestId("lee_inbox"), expectedVersion:item.source.version || "legacy", ...details }) });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
        if (!response.ok || body.ok !== true) throw new Error(body.message || "This follow-up could not be changed. No changes were made.");
        setNotice(body.result?.message || "Follow-up updated.");
        await Promise.all([load({ force:true, preserveScroll:true }), Promise.resolve(window.__LE_INBOX_PAGE?.refresh?.()), Promise.resolve(window.__LE_TODAY_PAGE?.refresh?.())]);
        return body;
      } catch (error) { itemStatus(row, error.message || "No changes were made. Try again.", "error"); return null; }
      finally { setItemBusy(row, false, button); }
    }
    function showInline(row, kind) { const item = itemFor(row); if (!item) return; row.querySelector("[data-lee-inline-form]")?.remove(); const form = inlineForm(item, kind); row.append(form); form.querySelector("input")?.focus(); }
    async function refreshInbox(button) {
      if (button.disabled) return;
      const label = button.textContent; button.disabled = true; button.textContent = "Refreshing…"; setNotice("");
      try {
        const response = await fetch(endpoints.refresh, { method:"POST", credentials:"same-origin", headers:{ accept:"application/json", "content-type":"application/json", "x-csrf-token":cookieValue("leos_csrf") }, body:"{}" });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return; }
        if (!response.ok || body.ok !== true) throw new Error(body.message || body.error || "Connection needs attention. No changes were made.");
        const count = Number(body.lastScan?.count || body.observations?.length || 0);
        setNotice("Inbox refreshed" + (count ? " · " + count + (count === 1 ? " conversation reviewed." : " conversations reviewed.") : "."));
        await Promise.all([load({ force:true, preserveScroll:true }), Promise.resolve(window.__LE_INBOX_PAGE?.refresh?.())]);
      } catch (error) { setNotice(error.message || "Connection needs attention. No changes were made.", "error"); }
      finally { button.disabled = false; button.textContent = label; }
    }
    function bind() {
      const host = root(); if (!host || host.dataset.leeBound === "true") return; host.dataset.leeBound = "true";
      const saved = readFilters(); host.querySelector('[name="search"]').value = saved.search; host.querySelector('[name="category"]').value = saved.category;
      host.addEventListener("input", (event) => { if (!event.target.matches('[name="search"]')) return; clearTimeout(debounce); debounce = setTimeout(() => { visibleLimit = 8; load({ force:true, preserveScroll:true }); }, 250); });
      host.addEventListener("change", (event) => { if (!event.target.matches('[name="category"]')) return; visibleLimit = 8; load({ force:true, preserveScroll:true }); });
      host.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-lee-inline-form]"); if (!form) return; event.preventDefault();
        const row = form.closest("[data-lee-item]"); const values = Object.fromEntries(new FormData(form)); const error = form.querySelector("[data-lee-inline-error]"); if (error) error.textContent = "";
        if (form.dataset.leeInlineForm === "set_next_action" && (!String(values.nextAction || "").trim() || !values.dueDate)) { if (error) error.textContent = "Add the next action and due date."; return; }
        if (form.dataset.leeInlineForm === "snooze" && !values.snoozeUntil) { if (error) error.textContent = "Choose when this should return."; return; }
        const result = await mutate(row, form.dataset.leeInlineForm, values, event.submitter); if (result) form.remove();
      });
      host.addEventListener("click", (event) => {
        const retry = event.target.closest("[data-lee-retry]"); if (retry) { payload = null; load({ force:true }); return; }
        const refresh = event.target.closest("[data-lee-refresh]"); if (refresh) { refreshInbox(refresh); return; }
        const more = event.target.closest("[data-lee-more]"); if (more) { visibleLimit += 8; if (payload) render(payload, true); return; }
        const button = event.target.closest("[data-lee-action]"); if (!button) return;
        const row = button.closest("[data-lee-item]"); const item = itemFor(row); if (!item) return;
        const action = button.dataset.leeAction;
        if (action === "draft_reply") { window.commandCenterOpenComposer?.({ sourceKind:"inbox_signal", sourceId:item.source.id }, button); return; }
        if (action === "open_relationship") { window.commandCenterOpenRelationship?.(button.dataset.relationshipId, button); return; }
        if (action === "set_next_action" || action === "snooze") { showInline(row, action); return; }
        if (action === "cancel_inline") { button.closest("[data-lee-inline-form]")?.remove(); return; }
        if (action === "create_task" || action === "dismiss") mutate(row, action, {}, button);
      });
    }
    function activate() { if (!active() || sessionEnded || !root()) return; bind(); load(); }
    const host = app(); if (host) new MutationObserver(() => { if (active() && root()) queueMicrotask(activate); }).observe(host, { childList:true });
    window.addEventListener("hashchange", () => { if (active()) { payload = null; visibleLimit = 8; queueMicrotask(activate); } });
    document.addEventListener("vnext:session-expired", () => { sessionEnded = true; payload = null; });
    window.__LE_LEE_INBOX = Object.freeze({ load:() => load({ force:true, preserveScroll:true }), activate });
    activate();
  })();`;
}
