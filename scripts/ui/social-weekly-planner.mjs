export const SOCIAL_WEEKLY_PLANNER_STYLESHEET_PATH = "assets/ui/social-weekly-planner.css";
export const SOCIAL_WEEKLY_PLANNER_ENDPOINT = "/api/ui/social/weekly";

export const SOCIAL_WEEKLY_PLANNER_CONTRACT = Object.freeze({
  endpoint:SOCIAL_WEEKLY_PLANNER_ENDPOINT,
  statuses:Object.freeze([
    Object.freeze({ key:"planned", label:"Planned" }),
    Object.freeze({ key:"drafting", label:"Drafting" }),
    Object.freeze({ key:"ready", label:"Ready" }),
    Object.freeze({ key:"published_manually", label:"Published manually" }),
    Object.freeze({ key:"needs_results", label:"Needs results" }),
    Object.freeze({ key:"archived", label:"Archived" })
  ]),
  channels:Object.freeze([
    Object.freeze({ key:"linkedin", label:"LinkedIn" }),
    Object.freeze({ key:"instagram", label:"Instagram" }),
    Object.freeze({ key:"facebook", label:"Facebook" }),
    Object.freeze({ key:"x", label:"X" }),
    Object.freeze({ key:"threads", label:"Threads" })
  ]),
  defaultDraftCount:3,
  maximumDraftCount:12
});

export function renderSocialWeeklyPlanner() {
  return `<section class="founder-social-weekly" data-social-weekly-planner aria-labelledby="founder-social-weekly-title">
    <header class="founder-social-weekly__header">
      <div>
        <p class="founder-social-weekly__eyebrow">Weekly planning</p>
        <h2 id="founder-social-weekly-title">Turn this week into useful Social drafts</h2>
        <p>Set the business goal once, shape each platform in its own voice, then copy the finished plan for manual posting.</p>
      </div>
      <div class="founder-social-weekly__safety" aria-label="Manual posting only">
        <strong>Manual workflow</strong>
        <span>Nothing is posted automatically.</span>
      </div>
    </header>

    <div class="founder-social-weekly__toolbar" aria-label="Weekly plan controls">
      <div class="founder-social-weekly__week-control">
        <button type="button" class="founder-social-weekly__icon-button" data-week-action="previous" aria-label="Previous week">‹</button>
        <label for="founder-social-weekly-date">Week of
          <input id="founder-social-weekly-date" type="date" data-week-input />
        </label>
        <button type="button" class="founder-social-weekly__icon-button" data-week-action="next" aria-label="Next week">›</button>
        <button type="button" class="founder-social-weekly__quiet-button" data-week-action="current">This week</button>
      </div>
      <div class="founder-social-weekly__toolbar-actions">
        <button type="button" class="founder-social-weekly__quiet-button" data-copy-all disabled>Copy all drafts</button>
        <button type="button" class="founder-social-weekly__secondary-button" data-export-markdown disabled>Export Markdown</button>
      </div>
    </div>

    <div class="founder-social-weekly__notice" data-weekly-notice role="status" aria-live="polite"></div>

    <div class="founder-social-weekly__loading" data-weekly-loading aria-hidden="false">
      <div class="founder-social-weekly__skeleton is-wide"></div>
      <div class="founder-social-weekly__skeleton-grid">
        <div class="founder-social-weekly__skeleton"></div>
        <div class="founder-social-weekly__skeleton"></div>
        <div class="founder-social-weekly__skeleton"></div>
      </div>
      <span class="founder-social-weekly__sr-only">Loading the weekly Social plan.</span>
    </div>

    <section class="founder-social-weekly__error" data-weekly-fatal hidden role="alert" aria-labelledby="founder-social-weekly-error-title">
      <h3 id="founder-social-weekly-error-title" tabindex="-1">The Social plan could not load</h3>
      <p data-weekly-fatal-message>No changes were made. Try again.</p>
      <button type="button" class="founder-social-weekly__secondary-button" data-weekly-retry>Try again</button>
    </section>

    <form class="founder-social-weekly__create" data-weekly-create novalidate hidden>
      <section class="founder-social-weekly__brief" aria-labelledby="founder-social-weekly-brief-title">
        <div class="founder-social-weekly__section-heading">
          <div><p class="founder-social-weekly__step">1 · Direction</p><h3 id="founder-social-weekly-brief-title">Give the week one clear job</h3></div>
          <p>One objective and up to three themes keep the drafts coherent.</p>
        </div>
        <label class="founder-social-weekly__field is-full">Main business objective
          <textarea name="objective" rows="3" maxlength="1000" required placeholder="Example: Start qualified conversations with community Partners."></textarea>
          <span class="founder-social-weekly__field-error" data-field-error="objective"></span>
        </label>
        <fieldset class="founder-social-weekly__theme-fields">
          <legend>Themes <span>Choose one to three</span></legend>
          <label>Theme 1<input name="theme1" maxlength="100" required placeholder="Partner education" /></label>
          <label>Theme 2<input name="theme2" maxlength="100" placeholder="Founder operations" /></label>
          <label>Theme 3<input name="theme3" maxlength="100" placeholder="Customer proof" /></label>
          <span class="founder-social-weekly__field-error" data-field-error="themes"></span>
        </fieldset>
        <details class="founder-social-weekly__context">
          <summary>Add the material worth turning into content</summary>
          <p>Use only what is useful this week. These notes stay attached to the plan.</p>
          <div class="founder-social-weekly__context-grid">
            <label>Proof<textarea name="proof" rows="3" maxlength="1200" placeholder="A result, fact, milestone, or approved claim"></textarea></label>
            <label>Announcement<textarea name="announcement" rows="3" maxlength="1200" placeholder="What changed or is ready to share"></textarea></label>
            <label>Customer insight<textarea name="customerInsight" rows="3" maxlength="1200" placeholder="A need, friction point, or useful observation"></textarea></label>
            <label>Partner story<textarea name="partnerStory" rows="3" maxlength="1200" placeholder="A relationship moment worth teaching from"></textarea></label>
            <label>Educational idea<textarea name="educationalIdea" rows="3" maxlength="1200" placeholder="Something the audience should understand"></textarea></label>
            <label>Call to action<textarea name="cta" rows="3" maxlength="1200" placeholder="The next step you want a reader to take"></textarea></label>
          </div>
        </details>
      </section>

      <section class="founder-social-weekly__draft-builder" aria-labelledby="founder-social-weekly-drafts-title">
        <div class="founder-social-weekly__section-heading">
          <div><p class="founder-social-weekly__step">2 · Drafts</p><h3 id="founder-social-weekly-drafts-title">Build the week’s Post drafts</h3></div>
          <button type="button" class="founder-social-weekly__secondary-button" data-add-draft>Add draft</button>
        </div>
        <p class="founder-social-weekly__guidance">Choose each platform intentionally. Ready drafts need distinct copy for every selected platform.</p>
        <span class="founder-social-weekly__field-error" data-field-error="posts"></span>
        <ol class="founder-social-weekly__draft-list" data-create-drafts></ol>
      </section>

      <footer class="founder-social-weekly__create-footer">
        <div><strong>Review before saving</strong><p>You can keep editing after the plan is created. Saving never posts or schedules content.</p></div>
        <button type="submit" class="founder-social-weekly__primary-button" data-create-submit>Save weekly plan</button>
      </footer>
    </form>

    <section class="founder-social-weekly__plan" data-weekly-plan hidden aria-labelledby="founder-social-weekly-plan-title">
      <div class="founder-social-weekly__plan-summary" data-plan-summary></div>
      <nav class="founder-social-weekly__status-filter" data-status-filter aria-label="Filter weekly drafts by status"></nav>
      <div class="founder-social-weekly__post-list" data-plan-posts></div>
      <div class="founder-social-weekly__empty-filter" data-empty-filter hidden>
        <h3>No drafts have this status</h3><p>Choose another status to see the rest of the week.</p>
      </div>
    </section>
  </section>`;
}

function socialWeeklyPlannerClient(contract, scaffoldHtml) {
  "use strict";

  const CHANNELS = contract.channels;
  const STATUSES = contract.statuses;
  const EDITABLE_STATUSES = new Set(["planned", "drafting", "ready", "archived"]);
  const RESULT_FIELDS = ["impressions", "likes", "comments", "shares", "saves", "clicks", "reposts", "engagementRate"];
  const mounted = new WeakSet();
  let root = null;
  let currentPlan = null;
  let currentWeek = "";
  let statusFilter = "all";
  let draftSequence = 0;
  let loadSequence = 0;
  let loading = false;

  function clean(value) { return String(value ?? "").trim(); }
  function html(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]); }
  function attr(value) { return html(value).replaceAll("`", "&#96;"); }
  function labelForChannel(key) { return CHANNELS.find((channel) => channel.key === key)?.label || key; }
  function labelForStatus(key) { return STATUSES.find((status) => status.key === key)?.label || key; }
  function requestId(prefix) {
    const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${token.replaceAll("-", "_")}`;
  }
  function cookieValue(name) {
    const prefix = `${name}=`;
    let cookies = "";
    try { cookies = String(document.cookie || ""); } catch { return ""; }
    const item = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (!item) return "";
    try { return decodeURIComponent(item.slice(prefix.length)); } catch { return ""; }
  }
  function localDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function shiftedWeek(value, days) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date();
    parsed.setDate(parsed.getDate() + days);
    return localDate(parsed);
  }
  function node(selector, scope = root) { return scope?.querySelector(selector) || null; }
  function nodes(selector, scope = root) { return [...(scope?.querySelectorAll(selector) || [])]; }

  function setNotice(message = "", kind = "success") {
    const target = node("[data-weekly-notice]");
    if (!target) return;
    target.textContent = message;
    target.dataset.kind = message ? kind : "";
  }
  function setInitialLoading(show) {
    const target = node("[data-weekly-loading]");
    if (!target) return;
    target.hidden = !show;
    target.setAttribute("aria-hidden", show ? "false" : "true");
  }
  function setLoading(next) {
    loading = next;
    root?.setAttribute("aria-busy", next ? "true" : "false");
    nodes("[data-week-action],[data-week-input]").forEach((control) => { control.disabled = next; });
  }
  function buttonBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.previousLabel = button.textContent;
      button.textContent = label;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.dataset.previousLabel || button.textContent;
      delete button.dataset.previousLabel;
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  }
  function showFatal(message) {
    setInitialLoading(false);
    node("[data-weekly-create]").hidden = true;
    node("[data-weekly-plan]").hidden = true;
    const fatal = node("[data-weekly-fatal]");
    fatal.hidden = false;
    node("[data-weekly-fatal-message]").textContent = message || "No changes were made. Try again.";
    setTimeout(() => node("#founder-social-weekly-error-title")?.focus(), 0);
  }
  function clearFatal() { const fatal = node("[data-weekly-fatal]"); if (fatal) fatal.hidden = true; }
  function clearFieldErrors(scope = root) { nodes("[data-field-error]", scope).forEach((target) => { target.textContent = ""; }); }
  function fieldError(field, message, scope = root) {
    const exact = nodes("[data-field-error]", scope).find((target) => target.dataset.fieldError === field);
    const fallback = exact || nodes("[data-field-error]", scope).find((target) => field.startsWith(`${target.dataset.fieldError}.`));
    if (fallback) fallback.textContent = message || "Check this field.";
  }
  function focusNamed(name, scope = root) { node(`[name="${name}"]`, scope)?.focus(); }

  async function requestJson(path, options = {}) {
    const headers = { accept:"application/json", ...(options.body === undefined ? {} : { "content-type":"application/json", "x-csrf-token":cookieValue("leos_csrf") }) };
    const response = await fetch(path, { method:options.method || "GET", credentials:"same-origin", headers, ...(options.body === undefined ? {} : { body:JSON.stringify(options.body) }) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      document.dispatchEvent(new CustomEvent("vnext:session-expired"));
      throw Object.assign(new Error("Sign in again to continue."), { payload, status:401 });
    }
    if (!response.ok || payload.ok !== true) throw Object.assign(new Error(payload.message || "The Social plan could not be updated. No changes were made."), { payload, status:response.status });
    return payload;
  }

  function hashtagList(value) {
    return [...new Set(clean(value).split(/[\s,]+/).map((item) => clean(item)).filter(Boolean).map((item) => item.startsWith("#") ? item : `#${item}`))].slice(0, 40);
  }
  function variantFieldsFromEditor(editor) {
    const fields = {};
    for (const field of ["headline", "hook", "body", "cta", "hashtags"]) {
      const raw = clean(node(`[data-variant-field="${field}"]`, editor)?.value);
      const value = field === "hashtags" ? hashtagList(raw) : raw;
      fields[field] = value.length ? { mode:"custom", value } : { mode:"blank", value:field === "hashtags" ? [] : "" };
    }
    return fields;
  }
  function directVariantFromEditor(editor, channel) {
    return {
      channel,
      headline:clean(node('[data-variant-field="headline"]', editor)?.value),
      hook:clean(node('[data-variant-field="hook"]', editor)?.value),
      body:clean(node('[data-variant-field="body"]', editor)?.value),
      cta:clean(node('[data-variant-field="cta"]', editor)?.value),
      hashtags:hashtagList(node('[data-variant-field="hashtags"]', editor)?.value)
    };
  }
  function platformSelectorMarkup(key, selected = ["linkedin"]) {
    return `<fieldset class="founder-social-weekly__platforms"><legend>Platforms <span>Choose at least one</span></legend><div>${CHANNELS.map((channel) => `<label><input type="checkbox" data-draft-channel value="${channel.key}" ${selected.includes(channel.key) ? "checked" : ""}> <span>${channel.label}</span></label>`).join("")}</div><span class="founder-social-weekly__field-error" data-field-error="posts.${key}.selectedChannels"></span></fieldset>`;
  }
  function variantEditorMarkup(channel, values = {}, hidden = false) {
    return `<details class="founder-social-weekly__variant" data-variant-editor="${channel.key}" ${hidden ? "hidden" : ""}>
      <summary><span>${channel.label}</span><small>Independent platform copy</small></summary>
      <div class="founder-social-weekly__variant-fields">
        <label>Headline<input data-variant-field="headline" maxlength="200" value="${attr(values.headline || "")}" /></label>
        <label>Hook<textarea data-variant-field="hook" rows="2" maxlength="500">${html(values.hook || "")}</textarea></label>
        <label class="is-full">Post copy<textarea data-variant-field="body" rows="6" maxlength="12000" placeholder="Write for ${attr(channel.label)}, not for every platform at once.">${html(values.body || "")}</textarea></label>
        <label>Call to action<input data-variant-field="cta" maxlength="300" value="${attr(values.cta || "")}" /></label>
        <label>Hashtags<input data-variant-field="hashtags" maxlength="1000" value="${attr(Array.isArray(values.hashtags) ? values.hashtags.join(" ") : values.hashtags || "")}" placeholder="#LegalEase #LegalTech" /></label>
      </div>
    </details>`;
  }
  function sharedEditorMarkup(values = {}) {
    return `<details class="founder-social-weekly__shared-copy">
      <summary>Optional shared starting point</summary>
      <p>Platform copy below stays independent. This shared copy is useful as a source draft.</p>
      <div class="founder-social-weekly__variant-fields">
        <label>Headline<input data-shared-field="headline" maxlength="200" value="${attr(values.headline || "")}" /></label>
        <label>Hook<textarea data-shared-field="hook" rows="2" maxlength="500">${html(values.hook || "")}</textarea></label>
        <label class="is-full">Source copy<textarea data-shared-field="body" rows="4" maxlength="5000">${html(values.body || "")}</textarea></label>
        <label>Call to action<input data-shared-field="cta" maxlength="300" value="${attr(values.cta || "")}" /></label>
        <label>Hashtags<input data-shared-field="hashtags" maxlength="1000" value="${attr(Array.isArray(values.hashtags) ? values.hashtags.join(" ") : values.hashtags || "")}" /></label>
      </div>
    </details>`;
  }
  function createDraftMarkup(values = {}) {
    const key = ++draftSequence;
    const selected = Array.isArray(values.selectedChannels) && values.selectedChannels.length ? values.selectedChannels : ["linkedin"];
    const variantMap = new Map((values.variants || []).map((variant) => [variant.channel, variant]));
    return `<li class="founder-social-weekly__draft" data-create-draft data-draft-key="${key}">
      <header class="founder-social-weekly__draft-header">
        <div><span class="founder-social-weekly__draft-number" data-draft-number>Post draft</span><h4 data-draft-heading>${html(values.title || "Untitled draft")}</h4></div>
        <button type="button" class="founder-social-weekly__remove-button" data-remove-draft>Remove</button>
      </header>
      <div class="founder-social-weekly__draft-basics">
        <label class="founder-social-weekly__field is-full">Working title<input name="draftTitle" maxlength="160" required value="${attr(values.title || "")}" placeholder="What this Post should communicate" /><span class="founder-social-weekly__field-error" data-field-error="posts.${key}.title"></span></label>
        <label class="founder-social-weekly__field">Starting status<select name="draftStatus"><option value="planned" ${values.status === "planned" ? "selected" : ""}>Planned</option><option value="drafting" ${!values.status || values.status === "drafting" ? "selected" : ""}>Drafting</option><option value="ready" ${values.status === "ready" ? "selected" : ""}>Ready</option></select></label>
      </div>
      ${platformSelectorMarkup(key, selected)}
      ${sharedEditorMarkup(values.shared)}
      <div class="founder-social-weekly__variant-stack" data-draft-variants>${CHANNELS.map((channel) => variantEditorMarkup(channel, variantMap.get(channel), !selected.includes(channel.key))).join("")}</div>
      <span class="founder-social-weekly__field-error" data-field-error="posts.${key}.variants"></span>
    </li>`;
  }
  function addDraft(values = {}, focus = false) {
    const list = node("[data-create-drafts]");
    if (!list || nodes("[data-create-draft]", list).length >= contract.maximumDraftCount) return;
    list.insertAdjacentHTML("beforeend", createDraftMarkup(values));
    renumberDrafts();
    if (focus) nodes("[data-create-draft]", list).at(-1)?.querySelector('[name="draftTitle"]')?.focus();
    updateAddDraftAvailability();
  }
  function renumberDrafts() {
    nodes("[data-create-draft]").forEach((draft, index) => {
      const number = node("[data-draft-number]", draft);
      if (number) number.textContent = `Post ${index + 1}`;
    });
  }
  function updateAddDraftAvailability() {
    const add = node("[data-add-draft]");
    if (add) add.disabled = nodes("[data-create-draft]").length >= contract.maximumDraftCount;
    nodes("[data-remove-draft]").forEach((button) => { button.disabled = nodes("[data-create-draft]").length <= 1; });
  }
  function resetCreate() {
    const form = node("[data-weekly-create]");
    form.reset();
    node("[data-create-drafts]").replaceChildren();
    draftSequence = 0;
    for (let index = 0; index < contract.defaultDraftCount; index += 1) addDraft();
    clearFieldErrors(form);
  }
  function selectedChannels(scope) { return nodes("[data-draft-channel]:checked", scope).map((input) => input.value); }
  function syncPlatformEditors(scope) {
    const selected = new Set(selectedChannels(scope));
    nodes("[data-variant-editor]", scope).forEach((editor) => { editor.hidden = !selected.has(editor.dataset.variantEditor); });
  }
  function sharedFromDraft(draft) {
    const value = (field) => clean(node(`[data-shared-field="${field}"]`, draft)?.value);
    return { headline:value("headline"), hook:value("hook"), body:value("body"), cta:value("cta"), hashtags:hashtagList(value("hashtags")) };
  }
  function createPostFromDraft(draft) {
    const channels = selectedChannels(draft);
    return {
      title:clean(node('[name="draftTitle"]', draft)?.value),
      status:clean(node('[name="draftStatus"]', draft)?.value) || "drafting",
      shared:sharedFromDraft(draft),
      selectedChannels:channels,
      variants:channels.map((channel) => directVariantFromEditor(node(`[data-variant-editor="${channel}"]`, draft), channel))
    };
  }
  function validateCreate(form) {
    clearFieldErrors(form);
    const objective = clean(node('[name="objective"]', form)?.value);
    const themes = ["theme1", "theme2", "theme3"].map((name) => clean(node(`[name="${name}"]`, form)?.value)).filter(Boolean);
    if (!objective) { fieldError("objective", "Add the main business objective.", form); focusNamed("objective", form); return false; }
    if (!themes.length) { fieldError("themes", "Choose at least one theme.", form); focusNamed("theme1", form); return false; }
    if (new Set(themes.map((theme) => theme.toLowerCase())).size !== themes.length) { fieldError("themes", "Choose distinct themes.", form); focusNamed("theme1", form); return false; }
    const drafts = nodes("[data-create-draft]", form);
    if (!drafts.length) { fieldError("posts", "Add at least one Post draft.", form); return false; }
    for (const [index, draft] of drafts.entries()) {
      const key = draft.dataset.draftKey;
      const title = clean(node('[name="draftTitle"]', draft)?.value);
      if (!title) { fieldError(`posts.${key}.title`, "Add a working title.", draft); node('[name="draftTitle"]', draft)?.focus(); return false; }
      const channels = selectedChannels(draft);
      if (!channels.length) { fieldError(`posts.${key}.selectedChannels`, "Choose at least one platform.", draft); node("[data-draft-channel]", draft)?.focus(); return false; }
      const status = clean(node('[name="draftStatus"]', draft)?.value);
      if (status === "ready") {
        const bodies = channels.map((channel) => clean(node('[data-variant-field="body"]', node(`[data-variant-editor="${channel}"]`, draft))?.value));
        if (bodies.some((body) => !body)) { fieldError(`posts.${key}.variants`, "Ready drafts need copy for every selected platform.", draft); node(`[data-variant-editor="${channels[bodies.findIndex((body) => !body)]}"]`, draft)?.setAttribute("open", ""); return false; }
        if (new Set(bodies.map((body) => body.toLowerCase().replace(/\s+/g, " "))).size !== bodies.length) { fieldError(`posts.${key}.variants`, "Give each platform its own copy before marking this Ready.", draft); return false; }
      }
      const heading = node("[data-draft-heading]", draft); if (heading) heading.textContent = title || `Post ${index + 1}`;
    }
    return true;
  }
  function creationInput(form) {
    const value = (name) => clean(node(`[name="${name}"]`, form)?.value);
    return {
      requestId:requestId("social_weekly_plan"),
      week:currentWeek,
      objective:value("objective"),
      themes:[value("theme1"), value("theme2"), value("theme3")].filter(Boolean),
      inputs:{ proof:value("proof"), announcement:value("announcement"), customerInsight:value("customerInsight"), partnerStory:value("partnerStory"), educationalIdea:value("educationalIdea"), cta:value("cta") },
      posts:nodes("[data-create-draft]", form).map(createPostFromDraft)
    };
  }

  function summaryMarkup(plan) {
    const inputs = Object.entries(plan.inputs || {}).filter(([, value]) => clean(value));
    return `<div class="founder-social-weekly__summary-copy"><p class="founder-social-weekly__step">Week of ${html(plan.week?.start || currentWeek)}</p><h3 id="founder-social-weekly-plan-title">${html(plan.objective || "Weekly Social plan")}</h3><div class="founder-social-weekly__theme-list">${(plan.themes || []).map((theme) => `<span>${html(theme)}</span>`).join("")}</div></div><details class="founder-social-weekly__brief-review" ${inputs.length ? "" : "hidden"}><summary>Weekly source material</summary><dl>${inputs.map(([key, value]) => `<div><dt>${html(({ proof:"Proof", announcement:"Announcement", customerInsight:"Customer insight", partnerStory:"Partner story", educationalIdea:"Educational idea", cta:"Call to action" })[key] || key)}</dt><dd>${html(value)}</dd></div>`).join("")}</dl></details>`;
  }
  function statusFiltersMarkup(plan) {
    const allCount = Number(plan.counts?.posts || 0);
    return [{ key:"all", label:"All", count:allCount }, ...STATUSES.map((status) => ({ ...status, count:Number(plan.counts?.[status.key] || 0) }))].map((status) => `<button type="button" data-status-key="${status.key}" class="${statusFilter === status.key ? "is-selected" : ""}" aria-pressed="${statusFilter === status.key ? "true" : "false"}"><span>${status.label}</span><strong>${status.count}</strong></button>`).join("");
  }
  function statusChip(key) { return `<span class="founder-social-weekly__status-chip" data-status="${attr(key)}">${html(labelForStatus(key))}</span>`; }
  function publicationListMarkup(post) {
    const recorded = (post.publication?.channels || []).filter((item) => item.url);
    if (!recorded.length) return "";
    return `<ul class="founder-social-weekly__publication-list" aria-label="Recorded published links">${recorded.map((item) => `<li><span>${html(item.label)}</span><a href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">Open published Post</a></li>`).join("")}</ul>`;
  }
  function readOnlyVariantMarkup(variant) {
    return `<details class="founder-social-weekly__variant founder-social-weekly__variant--preview"><summary><span>${html(variant.label)}</span><small>${variant.independentlyEdited ? "Independent copy" : "Shared starting copy"}</small></summary><div class="founder-social-weekly__copy-preview">${variant.headline ? `<strong>${html(variant.headline)}</strong>` : ""}${variant.hook ? `<p class="is-hook">${html(variant.hook)}</p>` : ""}<p>${html(variant.body || "No copy yet.")}</p>${variant.cta ? `<p class="is-cta">${html(variant.cta)}</p>` : ""}${variant.hashtags?.length ? `<p class="is-hashtags">${html(variant.hashtags.join(" "))}</p>` : ""}</div></details>`;
  }
  function editVariantMarkup(channel, variant, selected) {
    return variantEditorMarkup(channel, variant || {}, !selected).replace("data-variant-editor=", "data-post-variant data-variant-editor=");
  }
  function editablePostMarkup(post) {
    const variantMap = new Map((post.variants || []).map((variant) => [variant.channel, variant]));
    const selected = (post.selectedChannels || []).map((channel) => channel.key);
    return `<form class="founder-social-weekly__post-edit" data-post-edit novalidate>
      <div class="founder-social-weekly__post-controls">
        <label>Status<select name="postStatus">${["planned", "drafting", "ready", "archived"].map((key) => `<option value="${key}" ${post.status?.key === key ? "selected" : ""}>${labelForStatus(key)}</option>`).join("")}</select></label>
        ${platformSelectorMarkup(post.id, selected)}
      </div>
      <div class="founder-social-weekly__variant-stack">${CHANNELS.map((channel) => editVariantMarkup(channel, variantMap.get(channel.key), selected.includes(channel.key))).join("")}</div>
      <span class="founder-social-weekly__field-error" data-field-error="variants"></span>
      <div class="founder-social-weekly__inline-actions"><button type="submit" class="founder-social-weekly__primary-button">Save draft</button><span class="founder-social-weekly__form-message" data-post-message role="status"></span></div>
    </form>`;
  }
  function manualPublicationMarkup(post) {
    if (post.status?.key === "archived" || post.publication?.allRecorded) return "";
    const channels = post.publication?.channels || post.selectedChannels || [];
    return `<details class="founder-social-weekly__record-panel"><summary>Record a manually published URL</summary><form data-manual-publication novalidate><p>This records work posted outside LegalEase. It does not publish anything.</p><div class="founder-social-weekly__record-grid"><label>Platform<select name="channel">${channels.map((channel) => `<option value="${attr(channel.channel || channel.key)}">${html(channel.label)}${channel.url ? " · recorded" : ""}</option>`).join("")}</select></label><label class="is-wide">Published URL<input name="publishedUrl" type="url" inputmode="url" placeholder="https://…" required /></label></div><span class="founder-social-weekly__field-error" data-field-error="publishedUrl"></span><div class="founder-social-weekly__inline-actions"><button type="submit" class="founder-social-weekly__secondary-button">Record URL</button><span class="founder-social-weekly__form-message" data-publication-message role="status"></span></div></form></details>`;
  }
  function resultsMarkup(post) {
    if (!["needs_results", "published_manually"].includes(post.status?.key)) return "";
    const labels = { impressions:"Impressions", likes:"Likes", comments:"Comments", shares:"Shares", saves:"Saves", clicks:"Clicks", reposts:"Reposts", engagementRate:"Engagement rate (%)" };
    return `<details class="founder-social-weekly__record-panel" ${post.status?.key === "needs_results" ? "open" : ""}><summary>${post.status?.key === "needs_results" ? "Add results" : "Update results"}</summary><form data-results-form novalidate><p>Add only the numbers available from the platform. Missing values stay unavailable.</p><div class="founder-social-weekly__metrics-grid">${RESULT_FIELDS.map((field) => `<label>${labels[field]}<input name="${field}" type="number" min="0" ${field === "engagementRate" ? 'step="0.01"' : 'step="1"'} inputmode="decimal" /></label>`).join("")}</div><span class="founder-social-weekly__field-error" data-field-error="results"></span><div class="founder-social-weekly__inline-actions"><button type="submit" class="founder-social-weekly__secondary-button">Save results</button><span class="founder-social-weekly__form-message" data-results-message role="status"></span></div></form></details>`;
  }
  function postCardMarkup(post) {
    const editable = EDITABLE_STATUSES.has(post.status?.key) && post.capabilities?.edit === true;
    return `<article class="founder-social-weekly__post" data-plan-post data-post-id="${attr(post.id)}" data-post-status="${attr(post.status?.key)}">
      <header class="founder-social-weekly__post-header"><div>${statusChip(post.status?.key)}<h3>${html(post.title)}</h3><p>${(post.selectedChannels || []).map((channel) => html(channel.label)).join(" · ") || "No platforms selected"}</p></div><div class="founder-social-weekly__post-actions"><button type="button" class="founder-social-weekly__quiet-button" data-copy-post>Copy draft</button>${post.href ? `<a class="founder-social-weekly__text-link" href="${attr(post.href)}">Open full Post</a>` : ""}</div></header>
      ${publicationListMarkup(post)}
      ${editable ? editablePostMarkup(post) : `<div class="founder-social-weekly__variant-stack">${(post.variants || []).map(readOnlyVariantMarkup).join("")}</div>`}
      ${manualPublicationMarkup(post)}
      ${resultsMarkup(post)}
    </article>`;
  }
  function renderPlan(plan, options = {}) {
    const scroll = options.preserveScroll ? window.scrollY : null;
    currentPlan = plan;
    currentWeek = plan.week?.start || currentWeek;
    const input = node("[data-week-input]"); if (input) input.value = currentWeek;
    clearFatal(); setInitialLoading(false); node("[data-weekly-create]").hidden = true; node("[data-weekly-plan]").hidden = false;
    node("[data-plan-summary]").innerHTML = summaryMarkup(plan);
    node("[data-status-filter]").innerHTML = statusFiltersMarkup(plan);
    const visiblePosts = (plan.posts || []).filter((post) => statusFilter === "all" || post.status?.key === statusFilter);
    node("[data-plan-posts]").innerHTML = visiblePosts.map(postCardMarkup).join("");
    node("[data-empty-filter]").hidden = visiblePosts.length !== 0;
    const canCopy = Boolean(clean(plan.copyAllText));
    node("[data-copy-all]").disabled = !canCopy;
    node("[data-export-markdown]").disabled = !(plan.capabilities?.export && plan.posts?.length);
    if (scroll !== null) requestAnimationFrame(() => window.scrollTo({ top:scroll, behavior:"auto" }));
  }
  function showCreate(plan) {
    currentPlan = plan;
    clearFatal(); setInitialLoading(false); node("[data-weekly-plan]").hidden = true; node("[data-weekly-create]").hidden = false;
    node("[data-copy-all]").disabled = true; node("[data-export-markdown]").disabled = true;
    resetCreate();
  }
  async function loadWeek(week = currentWeek || localDate(), options = {}) {
    if (!root || loading) return null;
    const sequence = ++loadSequence;
    const requestedWeek = week;
    const firstLoad = !currentPlan;
    if (firstLoad) setInitialLoading(true);
    clearFatal(); setNotice(""); setLoading(true);
    try {
      const payload = await requestJson(`${contract.endpoint}?${new URLSearchParams({ week:requestedWeek })}`);
      if (sequence !== loadSequence) return null;
      currentWeek = payload.week?.start || requestedWeek;
      if (payload.posts?.length) renderPlan(payload); else showCreate(payload);
      return payload;
    } catch (error) {
      if (sequence !== loadSequence) return null;
      const input = node("[data-week-input]"); if (input) input.value = currentWeek || requestedWeek;
      if (currentPlan) setNotice(error.message, "error"); else showFatal(error.message);
      return null;
    } finally {
      if (sequence === loadSequence) setLoading(false);
    }
  }
  function replacePost(post, message) {
    if (!currentPlan || !post) return;
    const posts = currentPlan.posts.map((item) => item.id === post.id ? post : item);
    const counts = { posts:posts.length };
    for (const status of STATUSES) counts[status.key] = posts.filter((item) => item.status?.key === status.key).length;
    currentPlan = { ...currentPlan, posts, counts, copyAllText:posts.map(postText).join("\n\n---\n\n") };
    renderPlan(currentPlan, { preserveScroll:true });
    setNotice(message || "Social draft saved.");
  }
  function postText(post) {
    return [post.title, ...(post.variants || []).map((variant) => [variant.label, variant.headline, variant.hook, variant.body, variant.cta, ...(variant.hashtags || [])].filter(Boolean).join("\n"))].filter(Boolean).join("\n\n");
  }
  function copyTextForPost(post) { return postText(post); }
  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
    } catch {
      const field = document.createElement("textarea");
      field.value = value; field.setAttribute("readonly", ""); field.className = "founder-social-weekly__copy-fallback";
      document.body.append(field); field.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch { copied = false; }
      field.remove();
      setNotice(copied ? successMessage : "Copy was unavailable. Open a draft and select its text to copy it.", copied ? "success" : "error");
    }
  }
  function validatePostEdit(form) {
    clearFieldErrors(form);
    const channels = selectedChannels(form);
    if (!channels.length) { fieldError(`posts.${form.closest("[data-post-id]")?.dataset.postId}.selectedChannels`, "Choose at least one platform.", form); node("[data-draft-channel]", form)?.focus(); return false; }
    const status = clean(node('[name="postStatus"]', form)?.value);
    if (status === "ready") {
      const bodies = channels.map((channel) => clean(node('[data-variant-field="body"]', node(`[data-variant-editor="${channel}"]`, form))?.value));
      if (bodies.some((body) => !body)) { fieldError("variants", "Ready drafts need copy for every selected platform.", form); return false; }
      if (new Set(bodies.map((body) => body.toLowerCase().replace(/\s+/g, " "))).size !== bodies.length) { fieldError("variants", "Give each platform distinct copy before marking this Ready.", form); return false; }
    }
    return true;
  }
  async function savePost(form, button) {
    if (!validatePostEdit(form)) return;
    const card = form.closest("[data-post-id]");
    const post = currentPlan.posts.find((item) => item.id === card.dataset.postId);
    const channels = selectedChannels(form);
    buttonBusy(button, true, "Saving…");
    node("[data-post-message]", form).textContent = "";
    try {
      const payload = await requestJson(`${contract.endpoint}/posts/${encodeURIComponent(post.id)}`, { method:"POST", body:{ requestId:requestId("social_weekly_update"), expectedVersion:post.version, status:node('[name="postStatus"]', form).value, selectedChannels:channels, variants:channels.map((channel) => ({ channel, fields:variantFieldsFromEditor(node(`[data-variant-editor="${channel}"]`, form)) })), confirmCustomizedRemoval:true } });
      replacePost(payload.post, payload.message || "Social draft saved. Nothing was posted.");
    } catch (error) {
      const target = node("[data-post-message]", form); if (target) { target.textContent = error.message; target.dataset.kind = "error"; }
      if (error.payload?.field) fieldError(error.payload.field, error.message, form);
    } finally { if (button.isConnected) buttonBusy(button, false); }
  }
  async function recordPublication(form, button) {
    clearFieldErrors(form);
    const url = clean(node('[name="publishedUrl"]', form)?.value);
    try { const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error(); } catch { fieldError("publishedUrl", "Add the full HTTPS URL for the published Post.", form); node('[name="publishedUrl"]', form)?.focus(); return; }
    const card = form.closest("[data-post-id]"); const post = currentPlan.posts.find((item) => item.id === card.dataset.postId);
    buttonBusy(button, true, "Recording…");
    try {
      const payload = await requestJson(`${contract.endpoint}/posts/${encodeURIComponent(post.id)}/manual-publication`, { method:"POST", body:{ requestId:requestId("social_manual_publication"), expectedVersion:post.version, channel:node('[name="channel"]', form).value, publishedUrl:url } });
      replacePost(payload.post, payload.message || "Manual publication recorded. Nothing was posted by LegalEase.");
    } catch (error) {
      const target = node("[data-publication-message]", form); if (target) { target.textContent = error.message; target.dataset.kind = "error"; }
      if (error.payload?.field) fieldError(error.payload.field, error.message, form);
    } finally { if (button.isConnected) buttonBusy(button, false); }
  }
  async function saveResults(form, button) {
    clearFieldErrors(form);
    const metrics = {};
    for (const field of RESULT_FIELDS) {
      const raw = clean(node(`[name="${field}"]`, form)?.value);
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || (field !== "engagementRate" && !Number.isInteger(value))) { fieldError("results", "Use zero or a positive whole number for counts.", form); node(`[name="${field}"]`, form)?.focus(); return; }
      metrics[field] = value;
    }
    if (!Object.keys(metrics).length) { fieldError("results", "Add at least one result.", form); return; }
    const card = form.closest("[data-post-id]"); const post = currentPlan.posts.find((item) => item.id === card.dataset.postId);
    buttonBusy(button, true, "Saving…");
    try {
      const payload = await requestJson(`${contract.endpoint}/posts/${encodeURIComponent(post.id)}/results`, { method:"POST", body:{ requestId:requestId("social_weekly_results"), expectedVersion:post.version, ...metrics } });
      replacePost(payload.post, payload.message || "Social results saved.");
    } catch (error) {
      const target = node("[data-results-message]", form); if (target) { target.textContent = error.message; target.dataset.kind = "error"; }
      if (error.payload?.field) fieldError(error.payload.field, error.message, form);
    } finally { if (button.isConnected) buttonBusy(button, false); }
  }
  async function exportMarkdown(button) {
    if (!currentPlan?.posts?.length) return;
    buttonBusy(button, true, "Preparing…");
    try {
      const payload = await requestJson(`${contract.endpoint}/export`, { method:"POST", body:{ week:currentWeek, format:"markdown" } });
      const blob = new Blob([payload.content], { type:payload.mimeType || "text/markdown;charset=utf-8" });
      const href = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = href; link.download = payload.filename || `social-plan-${currentWeek}.md`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0); setNotice("Markdown plan exported.");
    } catch (error) { setNotice(error.message, "error"); }
    finally { buttonBusy(button, false); }
  }
  async function createPlan(form, button) {
    if (!validateCreate(form)) return;
    buttonBusy(button, true, "Saving…");
    nodes("input,textarea,select,button", form).forEach((control) => { if (control !== button) control.disabled = true; });
    setNotice("");
    try {
      const payload = await requestJson(contract.endpoint, { method:"POST", body:creationInput(form) });
      statusFilter = "all"; renderPlan(payload.plan); setNotice(payload.message || "Weekly Social plan saved. Nothing was posted.");
      document.dispatchEvent(new CustomEvent("vnext:social-weekly-plan-saved", { detail:{ week:payload.plan?.week?.start, postCount:payload.plan?.posts?.length || 0 } }));
    } catch (error) {
      setNotice(error.message, "error");
      if (error.payload?.field) fieldError(error.payload.field, error.message, form);
    } finally {
      nodes("input,textarea,select,button", form).forEach((control) => { control.disabled = false; });
      updateAddDraftAvailability(); buttonBusy(button, false);
    }
  }
  function bind(scope) {
    if (mounted.has(scope)) return;
    mounted.add(scope);
    scope.addEventListener("change", (event) => {
      if (event.target.matches("[data-draft-channel]")) syncPlatformEditors(event.target.closest("[data-create-draft],[data-post-edit]"));
      if (event.target.matches("[data-week-input]")) loadWeek(event.target.value);
    });
    scope.addEventListener("input", (event) => {
      if (event.target.matches('[name="draftTitle"]')) { const heading = node("[data-draft-heading]", event.target.closest("[data-create-draft]")); if (heading) heading.textContent = clean(event.target.value) || "Untitled draft"; }
    });
    scope.addEventListener("click", (event) => {
      const weekAction = event.target.closest("[data-week-action]");
      if (weekAction) { const action = weekAction.dataset.weekAction; loadWeek(action === "current" ? localDate() : shiftedWeek(currentWeek || localDate(), action === "previous" ? -7 : 7)); return; }
      if (event.target.closest("[data-weekly-retry]")) { loadWeek(currentWeek || localDate()); return; }
      if (event.target.closest("[data-add-draft]")) { addDraft({}, true); return; }
      const remove = event.target.closest("[data-remove-draft]");
      if (remove) { remove.closest("[data-create-draft]")?.remove(); renumberDrafts(); updateAddDraftAvailability(); return; }
      const statusButton = event.target.closest("[data-status-key]");
      if (statusButton) { statusFilter = statusButton.dataset.statusKey; renderPlan(currentPlan, { preserveScroll:true }); return; }
      const copyPost = event.target.closest("[data-copy-post]");
      if (copyPost) { const post = currentPlan.posts.find((item) => item.id === copyPost.closest("[data-post-id]").dataset.postId); copyText(copyTextForPost(post), "Post draft copied."); return; }
      if (event.target.closest("[data-copy-all]")) { copyText(currentPlan?.copyAllText || "", "All weekly drafts copied."); return; }
      const exportButton = event.target.closest("[data-export-markdown]"); if (exportButton) { exportMarkdown(exportButton); return; }
    });
    scope.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.target.matches("[data-weekly-create]")) { createPlan(event.target, event.submitter || node("[data-create-submit]")); return; }
      if (event.target.matches("[data-post-edit]")) { savePost(event.target, event.submitter); return; }
      if (event.target.matches("[data-manual-publication]")) { recordPublication(event.target, event.submitter); return; }
      if (event.target.matches("[data-results-form]")) saveResults(event.target, event.submitter);
    });
  }
  function resolveHost(target) {
    if (typeof target === "string") return document.querySelector(target);
    if (target?.nodeType === 1) return target;
    return document.querySelector("[data-social-weekly-host]");
  }
  function mount(target, options = {}) {
    const host = resolveHost(target);
    if (!host) return null;
    if (!host.querySelector("[data-social-weekly-planner]")) host.innerHTML = scaffoldHtml;
    root = host.querySelector("[data-social-weekly-planner]");
    bind(root);
    const requested = clean(options.week || host.dataset.socialWeeklyWeek || root.dataset.week || localDate());
    currentWeek = requested;
    node("[data-week-input]").value = requested;
    loadWeek(requested);
    return root;
  }
  function autoMount() {
    document.querySelectorAll("[data-social-weekly-host]").forEach((host) => {
      const planner = host.querySelector("[data-social-weekly-planner]");
      if (!planner || !mounted.has(planner)) mount(host);
    });
  }
  function refresh() { return loadWeek(currentWeek || localDate()); }

  document.addEventListener("vnext:social-weekly-mount", (event) => mount(event.detail?.target, { week:event.detail?.week }));
  document.addEventListener("vnext:session-expired", () => { loadSequence += 1; currentPlan = null; setNotice(""); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount, { once:true }); else autoMount();
  new MutationObserver(() => autoMount()).observe(document.documentElement, { childList:true, subtree:true });
  window.__LE_SOCIAL_WEEKLY_PLANNER = Object.freeze({ mount, refresh, loadWeek, render:() => currentPlan, endpoint:contract.endpoint });
}

export function socialWeeklyPlannerBrowserSource() {
  const contract = JSON.stringify(SOCIAL_WEEKLY_PLANNER_CONTRACT).replaceAll("<", "\\u003c");
  const scaffold = JSON.stringify(renderSocialWeeklyPlanner()).replaceAll("<", "\\u003c");
  return `(${socialWeeklyPlannerClient.toString()})(${contract},${scaffold});`;
}
