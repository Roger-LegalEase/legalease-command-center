export const POST_COMPOSER_STYLESHEET_PATH = "assets/ui/post-composer.css";

export function renderPostComposerLoading() {
  return `<section class="vnext-composer" data-post-composer aria-labelledby="post-composer-title"><header><button type="button" class="vnext-composer-back vnext-secondary" data-composer-back>Back to Social</button><p class="vnext-composer-eyebrow">Social</p><h1 id="post-composer-title">Post composer</h1><p data-composer-status role="status">Loading this Post.</p></header><div class="vnext-composer-grid"><aside aria-label="Creative summary" data-composer-left></aside><section aria-label="Preview and shared copy" data-composer-center></section><aside aria-label="Post status" data-composer-right></aside></div></section>`;
}

function composerClient(loadingHtml) {
  const FIELD_KEYS = ["headline", "body", "hook", "cta", "hashtags"];
  let model = null;
  let localDraft = null;
  let dirty = false;
  let saving = false;
  let lastAcceptedHash = location.hash;
  let pendingDestination = null;
  let pendingOrigin = null;
  let guardDialog = null;
  let conflict = false;
  let conflictVersion = null;
  let loadPromise = null;
  let loadPostId = null;
  let loadedPostId = null;
  let recovering = false;
  let restoringHistory = false;
  let guardedHistoryTarget = null;
  let allowHistoryTraversal = false;
  let sessionExpired = false;
  let analyticsActive = false;

  const analyticsReference = Object.freeze({ workflowId:"social-post", destinationId:"social" });
  function analyticsEvent(type, detail = analyticsReference) { document.dispatchEvent(new CustomEvent(type, { detail })); }
  function startAnalytics() { if (!analyticsActive) { analyticsActive = true; analyticsEvent("vnext:workflow-started"); } }

  const app = () => document.querySelector("main#app");
  const postId = () => decodeURIComponent((String(location.hash).match(/^#social\/post\/([^?]+)/) || [])[1] || "");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
  const labelFor = (key) => ({ headline:"Headline", body:"Caption", hook:"Hook", cta:"Call to action", hashtags:"Hashtags" })[key];
  const draftValue = (key) => Array.isArray(localDraft?.[key]) ? localDraft[key].join(" ") : String(localDraft?.[key] || "");

  function ensureScaffold() {
    if (app() && !app().querySelector("[data-post-composer]")) app().innerHTML = loadingHtml;
  }
  function setMessage(message, state = "") {
    const node = app()?.querySelector("[data-composer-message]");
    if (node) { node.textContent = message; node.dataset.state = state; }
  }
  function updatePreview() {
    const preview = app()?.querySelector("[data-composer-preview]");
    if (!preview || !localDraft) return;
    preview.querySelector("[data-preview-headline]").textContent = localDraft.headline || "Untitled Post";
    preview.querySelector("[data-preview-body]").textContent = localDraft.body || "No shared copy yet.";
    preview.querySelector("[data-preview-hook]").textContent = localDraft.hook || "";
    preview.querySelector("[data-preview-cta]").textContent = localDraft.cta || "";
    preview.querySelector("[data-preview-hashtags]").textContent = (localDraft.hashtags || []).join(" ");
  }
  function updateSaveState() {
    const button = app()?.querySelector("[data-composer-save]");
    if (button) { button.disabled = saving || !dirty || !model?.capabilities?.edits; button.setAttribute("aria-busy", saving ? "true" : "false"); button.textContent = saving ? "Saving…" : "Save draft"; }
  }
  function inputMarkup(key, readOnly) {
    return '<label for="composer-' + key + '">' + labelFor(key) + '</label><textarea id="composer-' + key + '" data-composer-field="' + key + '" ' + (readOnly ? "readonly" : "") + ' aria-describedby="composer-' + key + '-error">' + escapeHtml(draftValue(key)) + '</textarea><p id="composer-' + key + '-error" class="vnext-composer-field-error" data-field-error="' + key + '" aria-live="polite"></p>';
  }
  function creativeOptions(groupKey, role) {
    const group = (model.creative?.catalog?.groups || []).find((item) => item.key === groupKey);
    const current = model.creative?.[role]?.sourceReference;
    return '<option value="">None selected</option>' + (group?.assets || []).map((item) => '<option value="' + escapeHtml(item.sourceReference.collection + ":" + item.sourceReference.sourceId) + '" data-source-collection="' + escapeHtml(item.sourceReference.collection) + '" data-source-id="' + escapeHtml(item.sourceReference.sourceId) + '" ' + (current?.collection === item.sourceReference.collection && current?.sourceId === item.sourceReference.sourceId ? "selected" : "") + '>' + escapeHtml(item.name) + '</option>').join("");
  }
  function creativeDrawer(readOnly) {
    const templates = (model.creative?.catalog?.templates || []).filter((item) => item.availability?.key === "available");
    const current = model.creative?.template?.sourceReference;
    const templateOptions = '<option value="">Choose a reviewed template</option>' + templates.map((item) => '<option value="' + escapeHtml(item.sourceReference.collection + ":" + item.sourceReference.sourceId) + '" data-source-collection="' + escapeHtml(item.sourceReference.collection) + '" data-source-id="' + escapeHtml(item.sourceReference.sourceId) + '" ' + (current?.collection === item.sourceReference.collection && current?.sourceId === item.sourceReference.sourceId ? "selected" : "") + '>' + escapeHtml(item.category?.label || "Other") + ' — ' + escapeHtml(item.name) + '</option>').join("");
    return '<details class="vnext-creative-drawer" open><summary>Choose creative</summary><p class="vnext-composer-guidance">Reviewed templates and exact approved assets only. Unavailable items cannot be selected.</p><label>Template<select data-creative-ref="template" ' + (readOnly ? "disabled" : "") + '>' + templateOptions + '</select></label><label>Logo<select data-creative-ref="logo" ' + (readOnly ? "disabled" : "") + '>' + creativeOptions("logos", "logo") + '</select></label><label>Wilma pose<select data-creative-ref="wilma" ' + (readOnly ? "disabled" : "") + '>' + creativeOptions("wilma_poses", "wilma") + '</select></label><label>Background<select data-creative-ref="background" ' + (readOnly ? "disabled" : "") + '>' + creativeOptions("backgrounds", "background") + '</select></label><label>Disclaimer<select data-creative-ref="disclaimer" ' + (readOnly ? "disabled" : "") + '>' + creativeOptions("disclaimer_blocks", "disclaimer") + '</select></label><div class="vnext-composer-actions"><button type="button" data-save-creative ' + (readOnly ? "disabled" : "") + '>Save creative</button><button type="button" class="vnext-secondary" data-render-creative ' + (readOnly ? "disabled" : "") + '>Render image</button></div><p data-creative-message role="status"></p></details>';
  }
  function channelEditor(readOnly) {
    const known = new Map((model.channels?.variants || []).map((item) => [item.channel, item]));
    const channels = ["linkedin","instagram","facebook","x","threads"];
    return '<details class="vnext-channel-editor" open><summary>Channels and variants</summary><p class="vnext-composer-guidance">Start with shared copy, then customize only what this channel needs.</p>' + channels.map((channel) => { const item = known.get(channel) || { channel, label:channel[0].toUpperCase() + channel.slice(1), content:{} }; const body = item.content?.body || {}; const mode = body.explicitlyBlank ? "blank" : body.source === "variant" ? "custom" : "fallback"; return '<fieldset data-channel-variant="' + channel + '"><legend><label><input type="checkbox" data-channel-selected ' + (item.selected ? "checked" : "") + ' ' + (readOnly ? "disabled" : "") + '> ' + escapeHtml(item.label) + '</label></legend><label>Copy behavior<select data-variant-mode ' + (readOnly ? "disabled" : "") + '><option value="fallback" ' + (mode === "fallback" ? "selected" : "") + '>Use shared copy</option><option value="custom" ' + (mode === "custom" ? "selected" : "") + '>Custom copy</option><option value="blank" ' + (mode === "blank" ? "selected" : "") + '>Explicitly blank</option></select></label><label>Channel copy<textarea data-variant-body ' + (readOnly ? "readonly" : "") + '>' + escapeHtml(body.value || "") + '</textarea></label><p>' + escapeHtml(item.guidance?.characterGuidance || "Stored format guidance is unavailable.") + '</p></fieldset>'; }).join("") + '<button type="button" data-save-variants ' + (readOnly ? "disabled" : "") + '>Save channels</button><p data-variant-message role="status"></p></details>';
  }
  function scheduleEditor(readOnly) {
    return '<details class="vnext-schedule-editor"><summary>Schedule</summary><p class="vnext-composer-guidance">Scheduling sets timing only. It never approves or publishes this Post.</p><label>Exact date and time with offset<input data-schedule-at value="' + escapeHtml(model.schedule?.scheduledAt || "") + '" placeholder="2026-08-10T09:30:00-04:00" ' + (readOnly ? "disabled" : "") + '></label><label>IANA timezone<input data-schedule-zone value="' + escapeHtml(model.schedule?.timezone || "") + '" placeholder="America/New_York" ' + (readOnly ? "disabled" : "") + '></label><button type="button" data-save-schedule ' + (readOnly ? "disabled" : "") + '>Move date</button><p data-schedule-message role="status"></p></details>';
  }
  function reviewEditor() {
    const checks = model.readiness?.checks || []; const blocks = model.review?.blockingChecks || []; const changes = model.review?.requestedChanges || [];
    return '<details class="vnext-review-editor" open><summary>Review and approval</summary><p>' + escapeHtml(model.review?.guidance?.text || "Review truth is unavailable.") + '</p><h3>Readiness</h3><ul class="vnext-review-checks">' + checks.map((check) => '<li data-check-state="' + escapeHtml(check.state) + '"><span>' + escapeHtml(check.label) + '</span><strong>' + escapeHtml(check.state) + '</strong></li>').join("") + '</ul>' + (blocks.length ? '<div class="vnext-review-block" role="alert"><h3>Blocking checks</h3><ul>' + blocks.map((block) => '<li><strong>' + escapeHtml(block.label) + '</strong> — ' + escapeHtml(block.explanation) + '</li>').join("") + '</ul></div>' : '<p class="vnext-review-ready">No current content or creative blockers.</p>') + (changes.length ? '<h3>Current feedback</h3><ul>' + changes.map((item) => '<li>' + escapeHtml(item.summary) + '</li>').join("") + '</ul>' : '') + '<label for="review-feedback">Request changes</label><textarea id="review-feedback" data-review-feedback maxlength="280"></textarea><div class="vnext-composer-actions"><button type="button" data-approve-post ' + (model.capabilities?.approves ? "" : "disabled") + '>Approve</button><button type="button" class="vnext-secondary" data-request-changes ' + (model.capabilities?.requestsChanges ? "" : "disabled") + '>Request changes</button><button type="button" class="vnext-secondary" data-regenerate ' + (model.capabilities?.regenerates ? "" : "disabled") + '>Regenerate image</button></div><p data-review-message role="status"></p><details><summary>Previous versions and activity</summary><p>Previous versions: ' + Number(model.review?.versions?.previous?.length || 0) + '</p><ul>' + (model.review?.activity || []).map((item) => '<li>' + escapeHtml(item.label) + (item.timestamp ? ' — ' + escapeHtml(item.timestamp) : '') + '</li>').join("") + '</ul></details></details>';
  }
  function publishingEditor() {
    const channels = model.publishing?.channels || [];
    return '<details class="vnext-publishing-editor" open><summary>Publishing</summary><p>' + escapeHtml(model.publishing?.guidance?.[0]?.text || "Publishing truth is unavailable.") + '</p><ul>' + channels.map((channel) => '<li data-publication-state="' + escapeHtml(channel.state?.key) + '"><strong>' + escapeHtml(channel.label) + '</strong><span>' + escapeHtml(channel.connectionState?.label || "Connection unavailable") + '</span><span>' + escapeHtml(channel.gateState?.label || "Publishing gate unavailable") + '</span><span>' + escapeHtml(channel.publicationState?.label || "Not published") + '</span></li>').join("") + '</ul><div class="vnext-composer-actions"><button type="button" data-publish-now ' + (model.capabilities?.publishes ? "" : "disabled") + '>Publish now</button><button type="button" class="vnext-secondary" data-manual-package ' + (model.capabilities?.manualPackage ? "" : "disabled") + '>Create manual package</button></div><p data-publishing-message role="status"></p><p class="vnext-composer-guidance">A manual package does not mark any channel Published. Scheduled, connected, and approved are not execution.</p></details>';
  }
  function render() {
    ensureScaffold();
    if (!model || !localDraft) return;
    const status = app().querySelector("[data-composer-status]"); if (status) status.textContent = "Editing the exact saved Post.";
    const readOnly = !model.capabilities?.edits;
    const left = app().querySelector("[data-composer-left]");
    const center = app().querySelector("[data-composer-center]");
    const right = app().querySelector("[data-composer-right]");
    left.innerHTML = '<h2>Creative</h2><dl>' + ["template","logo","wilma","background","disclaimer"].map((key) => '<div><dt>' + key[0].toUpperCase() + key.slice(1) + '</dt><dd>' + escapeHtml(model.creative?.[key]?.name || "Unavailable") + '</dd></div>').join("") + '<div><dt>Availability</dt><dd>' + escapeHtml(model.creative?.availability || "Unavailable") + '</dd></div></dl>' + (model.productionEnabled ? creativeDrawer(!model.capabilities?.creative) : "");
    center.innerHTML = '<h2>' + escapeHtml(model.post?.title || "Post") + '</h2><div class="vnext-composer-preview" data-composer-preview aria-label="Internal Post preview"><strong data-preview-headline></strong><p data-preview-body></p><p data-preview-hook></p><p><span data-preview-cta></span> <span data-preview-hashtags></span></p></div><form data-composer-form novalidate data-expected-version="' + escapeHtml(model.version) + '">' + FIELD_KEYS.map((key) => inputMarkup(key, readOnly)).join("") + '<div class="vnext-composer-save"><button type="submit" data-composer-save>Save draft</button><p data-composer-message role="status">' + (readOnly ? "This account can view Social but cannot edit Posts." : conflict ? "The saved Post changed. Your edits are still here." : dirty ? "Unsaved changes" : "Clean") + '</p><div data-conflict-actions data-current-version="' + escapeHtml(conflictVersion ?? "") + '" ' + (conflict ? "" : "hidden") + '><button type="button" class="vnext-secondary" data-keep-editing>Keep editing</button><button type="button" class="vnext-secondary" data-reload-copy>Reload saved copy</button></div></div></form>' + (model.productionEnabled ? reviewEditor() + publishingEditor() : "");
    right.innerHTML = '<h2>Status</h2><dl><div><dt>Channels</dt><dd>' + escapeHtml((model.channels?.selected || []).map((item) => item.label).join(", ") || "None selected") + '</dd></div><div><dt>Customized channels</dt><dd>' + Number(model.channels?.customizedCount || 0) + '</dd></div><div><dt>Schedule</dt><dd>' + escapeHtml(model.schedule?.display || "Unavailable") + '</dd></div><div><dt>Timezone</dt><dd>' + escapeHtml(model.schedule?.timezone || "Unavailable") + '</dd></div><div><dt>Readiness</dt><dd>' + escapeHtml(model.readiness?.state || "Unavailable") + '</dd></div><div><dt>Review</dt><dd>' + escapeHtml(model.review?.label || model.review?.state || "Unavailable") + '</dd></div><div><dt>Connection and publication</dt><dd>' + escapeHtml(model.publishing?.label || model.publishing?.state || "Unavailable") + '</dd></div></dl>' + (model.productionEnabled ? channelEditor(!model.capabilities?.variants) + scheduleEditor(!model.capabilities?.schedules) : "");
    bind(); updatePreview(); updateSaveState();
  }
  function bind() {
    app().querySelectorAll("[data-composer-field]").forEach((field) => field.addEventListener("input", () => {
      startAnalytics();
      localDraft[field.dataset.composerField] = field.dataset.composerField === "hashtags" ? field.value.split(/[\s,]+/).filter(Boolean) : field.value;
      dirty = true; conflict = false; conflictVersion = null; updatePreview(); updateSaveState(); setMessage("Unsaved changes", "unsaved_changes");
    }));
    app().querySelector("[data-composer-form]")?.addEventListener("submit", save);
    app().querySelector("[data-composer-back]")?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); if (dirty) openDiscardDialog("#queue?view=ideas", "click"); else navigate("#queue?view=ideas", "click"); });
    app().querySelector("[data-keep-editing]")?.addEventListener("click", () => setMessage("The saved Post changed. Your edits are still here.", "version_conflict"));
    app().querySelector("[data-reload-copy]")?.addEventListener("click", () => openDiscardDialog("reload", "control"));
    app().querySelector("[data-save-creative]")?.addEventListener("click", () => creativeAction("creative"));
    app().querySelector("[data-render-creative]")?.addEventListener("click", () => creativeAction("render"));
    app().querySelector("[data-save-variants]")?.addEventListener("click", () => saveVariants(false));
    app().querySelector("[data-save-schedule]")?.addEventListener("click", saveSchedule);
    app().querySelector("[data-approve-post]")?.addEventListener("click", () => reviewAction("approve"));
    app().querySelector("[data-request-changes]")?.addEventListener("click", () => reviewAction("request-changes"));
    app().querySelector("[data-regenerate]")?.addEventListener("click", () => reviewAction("regenerate"));
    app().querySelector("[data-publish-now]")?.addEventListener("click", () => publishingAction("publish"));
    app().querySelector("[data-manual-package]")?.addEventListener("click", () => publishingAction("manual-package"));
  }
  async function publishingAction(kind) {
    const message = app()?.querySelector("[data-publishing-message]");
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/" + kind, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ expectedVersion:model.version, requestId:crypto.randomUUID() }) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.message || "The publishing action could not be completed.");
      await load(true); const currentMessage = app()?.querySelector("[data-publishing-message]"); if (currentMessage) currentMessage.textContent = kind === "manual-package" ? "Manual package created. No channel was marked Published." : body.outcome === "partial" ? "Some channels published; review each channel result." : body.outcome === "published" ? "Published channels confirmed by current evidence." : "Nothing was published.";
    } catch (error) { if (message) message.textContent = error.message; }
  }
  async function reviewAction(kind) {
    const message = app()?.querySelector("[data-review-message]"); const payload = { expectedVersion:model.version, requestId:crypto.randomUUID() };
    if (kind === "request-changes") { payload.feedbackId = "social-feedback-" + crypto.randomUUID(); payload.summary = app().querySelector("[data-review-feedback]").value; }
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/" + kind, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(payload) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.message || "The review action could not be completed.");
      await load(true); const currentMessage = app()?.querySelector("[data-review-message]"); if (currentMessage) currentMessage.textContent = kind === "approve" ? "Approved. Nothing was scheduled or published." : kind === "request-changes" ? "Changes requested." : "New image ready for review; it is not approved.";
    } catch (error) { if (message) message.textContent = error.message; }
  }
  async function saveSchedule() {
    const message = app()?.querySelector("[data-schedule-message]");
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/schedule", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ scheduledAt:app().querySelector("[data-schedule-at]").value, timezone:app().querySelector("[data-schedule-zone]").value, expectedVersion:model.version, requestId:crypto.randomUUID() }) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.message || "The Post could not be moved."); await load(true); const currentMessage = app()?.querySelector("[data-schedule-message]"); if (currentMessage) currentMessage.textContent = "Schedule saved. Nothing was published.";
    } catch (error) { if (message) message.textContent = error.message; }
  }
  async function saveVariants(confirmed) {
    const message = app()?.querySelector("[data-variant-message]"); const selectedChannels = []; const variants = [];
    app()?.querySelectorAll("[data-channel-variant]").forEach((field) => { const channel = field.dataset.channelVariant; if (field.querySelector("[data-channel-selected]").checked) selectedChannels.push(channel); const mode = field.querySelector("[data-variant-mode]").value; variants.push({ channel, fields:{ body:{ mode, value:field.querySelector("[data-variant-body]").value } } }); });
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/variants", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ selectedChannels, variants, confirmCustomizedRemoval:confirmed, expectedVersion:model.version, requestId:crypto.randomUUID() }) });
      const body = await response.json(); if (!response.ok || !body.ok) { if (response.status === 409 && body.outcome === "confirmation_required" && confirm(body.message)) return saveVariants(true); throw new Error(body.message || "Channels could not be saved."); }
      await load(true); const currentMessage = app()?.querySelector("[data-variant-message]"); if (currentMessage) currentMessage.textContent = "Channels saved.";
    } catch (error) { if (message) message.textContent = error.message; }
  }
  async function creativeAction(kind) {
    const message = app()?.querySelector("[data-creative-message]");
    const selected = {};
    app()?.querySelectorAll("[data-creative-ref]").forEach((select) => { if (!select.value) return; const option = select.selectedOptions[0]; selected[select.dataset.creativeRef] = { collection:option.dataset.sourceCollection, sourceId:option.dataset.sourceId }; });
    const payload = kind === "creative" ? { template:selected.template, assets:Object.fromEntries(Object.entries(selected).filter(([key]) => key !== "template")), surfaceTone:model.creative?.surfaceTone, expectedVersion:model.version, requestId:crypto.randomUUID() } : { expectedVersion:model.version, requestId:crypto.randomUUID() };
    if (message) message.textContent = kind === "creative" ? "Saving creative…" : "Rendering…";
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/" + kind, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.message || "The creative action could not be completed.");
      await load(true); const currentMessage = app()?.querySelector("[data-creative-message]"); if (currentMessage) currentMessage.textContent = kind === "creative" ? "Creative saved." : (body.reused ? "Current image reused safely." : "Image rendered for review.");
    } catch (error) { if (message) message.textContent = error.message; }
  }
  async function save(event) {
    event.preventDefault();
    if (saving || !dirty || !model?.capabilities?.edits) return;
    const snapshot = structuredClone(localDraft);
    saving = true; updateSaveState(); setMessage("Saving…", "saving");
    let responseReceived = false;
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/save", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ fields:snapshot, expectedVersion:model.version }) });
      responseReceived = true;
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.message || "The Post could not be saved."), { status:response.status, body });
      model = body; localDraft = structuredClone(body.fields); dirty = false; conflict = false; conflictVersion = null; render(); setMessage("Saved", "saved");
      if (analyticsActive) analyticsEvent("vnext:workflow-completed");
      analyticsActive = false;
    } catch (error) {
      if (analyticsActive) analyticsEvent(error.status === 400 ? "vnext:validation-blocked" : "vnext:action-failed", { ...analyticsReference, actionId:"save-draft", reasonCode:error.status === 400 ? "validation" : error.status === 409 ? "conflict" : error.status === 401 ? "session-expired" : error.status === 403 ? "unauthorized" : "write-unavailable" });
      if (error.status === 401) {
        sessionExpired = true; model = null; localDraft = null; dirty = false; conflict = false; conflictVersion = null; pendingDestination = null; closeGuard(false);
        app().innerHTML = '<section data-vnext-shell-state="session_expired"><h1>Session expired</h1><p>Sign in again to continue.</p></section>';
        return;
      }
      dirty = true; conflict = error.status === 409; conflictVersion = conflict && Number.isSafeInteger(error.body?.currentVersion) ? error.body.currentVersion : null; setMessage(responseReceived ? error.message : "Connection lost before the save result was confirmed. Your edits are still here. Saved or changed: unknown. Nothing was sent, published, or uploaded. Reconnect and check the saved Post before trying again.", error.status === 409 ? "version_conflict" : error.status === 400 ? "validation_error" : error.status === 403 ? "authorization_error" : "recoverable_error");
      const actions = app()?.querySelector("[data-conflict-actions]"); if (actions) actions.hidden = !conflict;
      if (actions) actions.dataset.currentVersion = conflictVersion ?? "";
      const field = error.body?.field; if (field) { const node = app()?.querySelector('[data-field-error="' + CSS.escape(field) + '"]'); if (node) node.textContent = error.message; }
    } finally { saving = false; updateSaveState(); }
  }
  async function reloadSavedCopy() { dirty = false; conflict = false; conflictVersion = null; await load(true); }
  function closeGuard(stay = true) {
    if (!guardDialog) return;
    if (stay && lastAcceptedHash && location.hash !== lastAcceptedHash) history.replaceState(null, "", lastAcceptedHash);
    document.querySelector(".vnext-app-shell")?.removeAttribute("inert"); guardDialog.close(); guardDialog.remove(); guardDialog = null; pendingDestination = null; pendingOrigin = null;
  }
  function openDiscardDialog(destination, origin = "click") {
    if (!dirty) { if (destination === "reload") reloadSavedCopy(); else navigate(destination, origin); return; }
    if (guardDialog) return;
    pendingDestination = destination; pendingOrigin = origin;
    const previousFocus = document.activeElement;
    guardDialog = document.createElement("dialog"); guardDialog.className = "vnext-composer vnext-composer-guard"; guardDialog.setAttribute("aria-labelledby", "vnext-composer-guard-title");
    guardDialog.innerHTML = '<form method="dialog" class="vnext-composer-dialog"><h2 id="vnext-composer-guard-title">Unsaved changes</h2><p>Leaving will discard browser-local edits.</p><button value="stay" data-stay>Stay</button><button value="leave" class="vnext-secondary" data-leave>Leave without saving</button></form>';
    document.body.append(guardDialog); guardDialog.showModal(); guardDialog.querySelector("[data-stay]").focus();
    guardDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeGuard(true); previousFocus?.focus(); });
    guardDialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const controls = [...guardDialog.querySelectorAll('button:not([disabled])')];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    guardDialog.querySelector("[data-stay]").addEventListener("click", () => { closeGuard(true); previousFocus?.focus(); });
    guardDialog.querySelector("[data-leave]").addEventListener("click", () => { const target = pendingDestination, source = pendingOrigin; if (analyticsActive) analyticsEvent("vnext:workflow-abandoned", { ...analyticsReference, reasonCode:"navigation" }); analyticsActive = false; dirty = false; localDraft = null; closeGuard(false); if (target === "reload") reloadSavedCopy(); else if (source === "history") { allowHistoryTraversal = true; history.back(); } else navigate(target, source); });
  }
  function navigate(destination, origin) {
    if (!destination) return;
    location.hash = String(destination).replace(/^#/, "");
  }
  async function load(force = false) {
    const requestedPostId = postId();
    if (!requestedPostId || sessionExpired) return;
    if (!force && loadedPostId === requestedPostId && app()?.querySelector("[data-post-composer]")) return;
    if (loadPromise && !force && loadPostId === requestedPostId) return loadPromise;
    const currentLoad = (async () => {
    ensureScaffold();
    const response = await fetch("/api/ui/social/post/" + encodeURIComponent(requestedPostId) + "/composer");
    const body = await response.json();
    if (postId() !== requestedPostId) return;
    if (response.status === 401) { sessionExpired = true; model = null; localDraft = null; dirty = false; pendingDestination = null; closeGuard(false); app().innerHTML = '<section data-vnext-shell-state="session_expired"><h1>Session expired</h1></section>'; return; }
    loadedPostId = requestedPostId;
    if (!response.ok || !body.ok) { ensureScaffold(); const shell = app()?.querySelector("[data-post-composer]"); if (shell) shell.innerHTML = '<header><a href="#queue?view=ideas">Back to Social</a><h1>Post unavailable</h1><p data-composer-unavailable role="status">This Post is unavailable. No protected details were loaded.</p></header>'; return; }
    model = body; localDraft = structuredClone(body.fields); if (force) dirty = false; lastAcceptedHash = location.hash; render();
    })();
    loadPromise = currentLoad; loadPostId = requestedPostId;
    try { await currentLoad; } finally { if (loadPromise === currentLoad) { loadPromise = null; loadPostId = null; } }
  }
  function recoverSurface() {
    if (sessionExpired || recovering || !/^#social\/post\//.test(location.hash) || app()?.querySelector("[data-post-composer]")) return;
    recovering = true; queueMicrotask(() => { recovering = false; if (model && localDraft) render(); else load(); });
  }
  document.addEventListener("click", (event) => { const link = event.target.closest("a[href^='#'], [data-global-search-result][data-href^='#']"); if (!link || !dirty || guardDialog) return; const target = link.getAttribute("href") || link.dataset.href; if (target === location.hash) return; event.preventDefault(); event.stopImmediatePropagation(); openDiscardDialog(target, "click"); }, true);
  window.addEventListener("hashchange", (event) => { if (restoringHistory || allowHistoryTraversal) return; if (dirty) { if (!guardDialog) { const target = "#" + String(event.newURL).split("#")[1]; history.replaceState(null, "", lastAcceptedHash); openDiscardDialog(target, "hash"); } return; } if (/^#social\/post\//.test(location.hash)) load(); });
  window.addEventListener("popstate", () => {
    if (allowHistoryTraversal) { allowHistoryTraversal = false; if (/^#social\/post\//.test(location.hash)) load(); return; }
    if (restoringHistory) { const target = guardedHistoryTarget; guardedHistoryTarget = null; setTimeout(() => { restoringHistory = false; if (dirty && !guardDialog) openDiscardDialog(target, "history"); }, 0); return; }
    if (dirty && !guardDialog && location.hash !== lastAcceptedHash) { guardedHistoryTarget = location.hash; restoringHistory = true; history.forward(); }
  });
  window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  window.addEventListener("vnext:session-expired", () => {
    sessionExpired = true; model = null; localDraft = null; dirty = false; conflict = false; conflictVersion = null; loadedPostId = null; pendingDestination = null; guardedHistoryTarget = null; restoringHistory = false; allowHistoryTraversal = false; closeGuard(false);
    if (app()) app().innerHTML = '<section data-vnext-shell-state="session_expired"><h1>Session expired</h1><p>Sign in again to continue.</p></section>';
  });
  new MutationObserver(recoverSurface).observe(document.body, { childList:true, subtree:true });
  if (/^#social\/post\//.test(location.hash)) { load(); setTimeout(recoverSurface, 100); setTimeout(recoverSurface, 500); }
}

export function postComposerBrowserSource() {
  return `(${composerClient.toString()})(${JSON.stringify(renderPostComposerLoading()).replaceAll("<", "\\u003c")});`;
}
