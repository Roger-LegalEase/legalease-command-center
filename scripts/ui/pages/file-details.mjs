import { escapeAttribute, escapeHtml } from "../html.mjs";

export const FILE_DETAILS_STYLESHEET = "/assets/ui/file-details.css";

const unavailable = (value) => value === null || value === undefined || value === "" ? '<span class="file-detail-unavailable">Unavailable</span>' : escapeHtml(value);

function previewHtml(preview, name) {
  if (!preview?.available) return `<div class="file-preview-unavailable"><strong>Preview unavailable</strong><p>${escapeHtml(preview?.message || "File metadata is still available.")}</p></div>`;
  if (preview.kind === "image") return `<img src="${escapeAttribute(preview.href)}" alt="Preview of ${escapeAttribute(name || "file")}">`;
  if (preview.kind === "pdf") return `<iframe src="${escapeAttribute(preview.href)}" title="Preview of ${escapeAttribute(name || "PDF file")}"></iframe>`;
  if (["text", "markdown"].includes(preview.kind)) return `<div class="file-text-preview" data-file-text-preview data-source="${escapeAttribute(preview.href)}" role="region" aria-label="Text preview"><p>Loading authorized preview…</p></div>`;
  return `<a class="file-detail-primary" href="${escapeAttribute(preview.href)}">Open reviewed source</a>`;
}

export function renderFileDetails(details = {}, { sharingControls = "" } = {}) {
  if (!details?.file) return `<section class="file-detail-state" role="alert"><h1>File not available</h1><p>The file may not exist or this account may not have access.</p><a href="#files">Back to Files</a></section>`;
  const file = details.file;
  return `<section class="file-detail-page" data-file-details aria-labelledby="file-detail-title">
    <header class="file-detail-header"><div><a href="#files">Files</a><p>${escapeHtml(file.fileType?.label || "File")}</p><h1 id="file-detail-title">${escapeHtml(file.name || "Unnamed file")}</h1></div><div class="file-detail-actions">${details.actions.canOpen ? `<a class="file-detail-primary" href="${escapeAttribute(details.actions.openHref)}">Open</a>` : ""}${details.actions.canDownload ? `<a href="${escapeAttribute(details.actions.downloadHref)}" download>Download</a>` : ""}</div></header>
    <nav class="file-detail-tabs" role="tablist" aria-label="File details">${details.tabs.map((tab, index) => `<button type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" data-file-tab="${escapeAttribute(tab.toLowerCase())}">${escapeHtml(tab)}</button>`).join("")}</nav>
    <div class="file-detail-panel" role="tabpanel" data-file-panel="preview">${previewHtml(details.preview, file.name)}</div>
    <div class="file-detail-panel" role="tabpanel" data-file-panel="details" hidden><dl><div><dt>Status</dt><dd>${unavailable(file.status?.label)}</dd></div><div><dt>Owner</dt><dd>${unavailable(file.owner)}</dd></div><div><dt>Modified</dt><dd>${unavailable(file.modifiedAt)}</dd></div><div><dt>Verified</dt><dd>${unavailable(file.verifiedAt)}</dd></div><div><dt>Authoritative source</dt><dd>${escapeHtml(file.sourceRef.collection)}</dd></div></dl></div>
    <div class="file-detail-panel" role="tabpanel" data-file-panel="activity" hidden>${details.activity.length ? `<ol class="file-activity">${details.activity.map((event) => `<li><strong>${escapeHtml(event.label)}</strong><time datetime="${escapeAttribute(event.occurredAt)}">${escapeHtml(event.occurredAt)}</time></li>`).join("")}</ol>` : '<p class="file-detail-unavailable">No authorized activity is available.</p>'}</div>
    <div class="file-detail-panel" role="tabpanel" data-file-panel="sharing" hidden><p><strong>Visibility:</strong> ${escapeHtml(details.sharing.visibility)}</p><p><strong>Access:</strong> ${details.sharing.allowedRoles.length ? escapeHtml(details.sharing.allowedRoles.join(", ")) : '<span class="file-detail-unavailable">Unavailable</span>'}</p><p>Storage location does not grant public access.</p>${sharingControls}</div>
    <div class="file-detail-panel" role="tabpanel" data-file-panel="related" hidden>${details.related.length ? `<ul class="file-related">${details.related.map((item) => `<li><a href="${escapeAttribute(item.href)}">Open related ${escapeHtml(item.kind)}</a></li>`).join("")}</ul>` : '<p class="file-detail-unavailable">No related records are available.</p>'}</div>
  </section>`;
}
