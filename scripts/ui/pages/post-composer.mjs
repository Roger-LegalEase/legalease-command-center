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
  function render() {
    ensureScaffold();
    if (!model || !localDraft) return;
    const readOnly = !model.capabilities?.edits;
    const left = app().querySelector("[data-composer-left]");
    const center = app().querySelector("[data-composer-center]");
    const right = app().querySelector("[data-composer-right]");
    left.innerHTML = '<h2>Creative</h2><dl>' + ["template","logo","wilma","background","disclaimer"].map((key) => '<div><dt>' + key[0].toUpperCase() + key.slice(1) + '</dt><dd>' + escapeHtml(model.creative?.[key]?.name || "Unavailable") + '</dd></div>').join("") + '<div><dt>Availability</dt><dd>' + escapeHtml(model.creative?.availability || "Unavailable") + '</dd></div></dl>';
    center.innerHTML = '<h2>' + escapeHtml(model.post?.title || "Post") + '</h2><div class="vnext-composer-preview" data-composer-preview aria-label="Internal Post preview"><strong data-preview-headline></strong><p data-preview-body></p><p data-preview-hook></p><p><span data-preview-cta></span> <span data-preview-hashtags></span></p></div><form data-composer-form novalidate data-expected-version="' + escapeHtml(model.version) + '">' + FIELD_KEYS.map((key) => inputMarkup(key, readOnly)).join("") + '<div class="vnext-composer-save"><button type="submit" data-composer-save>Save draft</button><p data-composer-message role="status">' + (readOnly ? "This account can view Social but cannot edit Posts." : conflict ? "The saved Post changed. Your edits are still here." : dirty ? "Unsaved changes" : "Clean") + '</p><div data-conflict-actions data-current-version="' + escapeHtml(conflictVersion ?? "") + '" ' + (conflict ? "" : "hidden") + '><button type="button" class="vnext-secondary" data-keep-editing>Keep editing</button><button type="button" class="vnext-secondary" data-reload-copy>Reload saved copy</button></div></div></form>';
    right.innerHTML = '<h2>Status</h2><dl><div><dt>Channels</dt><dd>' + escapeHtml((model.channels?.selected || []).map((item) => item.label).join(", ") || "None selected") + '</dd></div><div><dt>Customized channels</dt><dd>' + Number(model.channels?.customizedCount || 0) + '</dd></div><div><dt>Schedule</dt><dd>' + escapeHtml(model.schedule?.display || "Unavailable") + '</dd></div><div><dt>Timezone</dt><dd>' + escapeHtml(model.schedule?.timezone || "Unavailable") + '</dd></div><div><dt>Readiness</dt><dd>' + escapeHtml(model.readiness?.state || "Unavailable") + '</dd></div><div><dt>Review</dt><dd>' + escapeHtml(model.review?.label || model.review?.state || "Unavailable") + '</dd></div><div><dt>Connection and publication</dt><dd>' + escapeHtml(model.publishing?.label || model.publishing?.state || "Unavailable") + '</dd></div></dl>';
    bind(); updatePreview(); updateSaveState();
  }
  function bind() {
    app().querySelectorAll("[data-composer-field]").forEach((field) => field.addEventListener("input", () => {
      localDraft[field.dataset.composerField] = field.dataset.composerField === "hashtags" ? field.value.split(/[\s,]+/).filter(Boolean) : field.value;
      dirty = true; conflict = false; conflictVersion = null; updatePreview(); updateSaveState(); setMessage("Unsaved changes", "unsaved_changes");
    }));
    app().querySelector("[data-composer-form]")?.addEventListener("submit", save);
    app().querySelector("[data-composer-back]")?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); if (dirty) openDiscardDialog("#queue?view=ideas", "click"); else navigate("#queue?view=ideas", "click"); });
    app().querySelector("[data-keep-editing]")?.addEventListener("click", () => setMessage("The saved Post changed. Your edits are still here.", "version_conflict"));
    app().querySelector("[data-reload-copy]")?.addEventListener("click", () => openDiscardDialog("reload", "control"));
  }
  async function save(event) {
    event.preventDefault();
    if (saving || !dirty || !model?.capabilities?.edits) return;
    const snapshot = structuredClone(localDraft);
    saving = true; updateSaveState(); setMessage("Saving…", "saving");
    try {
      const response = await fetch("/api/ui/social/post/" + encodeURIComponent(postId()) + "/save", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ fields:snapshot, expectedVersion:model.version }) });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.message || "The Post could not be saved."), { status:response.status, body });
      model = body; localDraft = structuredClone(body.fields); dirty = false; conflict = false; conflictVersion = null; render(); setMessage("Saved", "saved");
    } catch (error) {
      if (error.status === 401) {
        sessionExpired = true; model = null; localDraft = null; dirty = false; conflict = false; conflictVersion = null; pendingDestination = null; closeGuard(false);
        app().innerHTML = '<section data-vnext-shell-state="session_expired"><h1>Session expired</h1><p>Sign in again to continue.</p></section>';
        return;
      }
      dirty = true; conflict = error.status === 409; conflictVersion = conflict && Number.isSafeInteger(error.body?.currentVersion) ? error.body.currentVersion : null; setMessage(error.message, error.status === 409 ? "version_conflict" : error.status === 400 ? "validation_error" : error.status === 403 ? "authorization_error" : "recoverable_error");
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
    guardDialog.querySelector("[data-leave]").addEventListener("click", () => { const target = pendingDestination, source = pendingOrigin; dirty = false; localDraft = null; closeGuard(false); if (target === "reload") reloadSavedCopy(); else if (source === "history") { allowHistoryTraversal = true; history.back(); } else navigate(target, source); });
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
