import { escapeAttribute, escapeHtml } from "../html.mjs";

export const FILES_HOME_STYLESHEET = "/assets/ui/files-home.css";

function navLink(item, selected, kind) {
  const query = kind === "collection" ? `collection=${encodeURIComponent(item.key)}` : `view=${encodeURIComponent(item.key)}`;
  return `<a href="#files?${query}" data-files-${kind}="${escapeAttribute(item.key)}"${selected ? ' aria-current="page" class="is-selected"' : ""}>${escapeHtml(item.label)}</a>`;
}

function unavailable(value, formatter = (item) => item) {
  return value === null || value === undefined || value === "" ? '<span class="files-unavailable">Unavailable</span>' : escapeHtml(formatter(value));
}

export function renderFilesHome(payload = {}) {
  const query = payload.query || { view:"home", collection:"" };
  const items = payload.items || [];
  const emptyTitle = Object.values(query).some(Boolean) && (query.view !== "home" || query.collection || query.search || query.type || query.status)
    ? "No files match this view" : "Files will appear here";
  const rows = items.map((item) => `<li class="files-row" data-file-id="${escapeAttribute(item.id)}">
    <div class="files-row-main"><span class="files-type" aria-hidden="true">${escapeHtml(item.fileType?.label?.slice(0, 1) || "F")}</span><div><a href="${escapeAttribute(item.href)}" data-file-open>${escapeHtml(item.name || "Unnamed file")}</a><span>${escapeHtml(item.fileType?.label || "Type unavailable")}</span></div></div>
    <div data-label="Collection">${unavailable(item.collection, (value) => payload.navigation?.collections?.find((entry) => entry.key === value)?.label || value)}</div>
    <div data-label="Status">${unavailable(item.status?.label)}</div>
    <div data-label="Owner">${unavailable(item.owner)}</div>
    <div data-label="Modified">${unavailable(item.modifiedAt, (value) => new Intl.DateTimeFormat("en-US", { dateStyle:"medium" }).format(new Date(value)))}</div>
    <button type="button" class="files-star" data-file-star="${escapeAttribute(item.id)}" aria-pressed="${item.starred ? "true" : "false"}" aria-label="${item.starred ? "Remove from Starred" : "Add to Starred"}: ${escapeAttribute(item.name || "file")}">${item.starred ? "★" : "☆"}</button>
  </li>`).join("");
  return `<section class="files-page" data-files-page aria-labelledby="files-title">
    <header class="files-header"><div><p class="files-eyebrow">Files</p><h1 id="files-title">Files</h1><p>Find company materials without changing their authoritative source.</p></div><button type="button" class="files-new" data-files-new>New</button></header>
    <div class="files-layout"><aside aria-label="Files navigation"><nav>${(payload.navigation?.views || []).map((item) => navLink(item, query.view === item.key && !query.collection, "view")).join("")}</nav><h2>Collections</h2><nav>${(payload.navigation?.collections || []).map((item) => navLink(item, query.collection === item.key, "collection")).join("")}</nav></aside>
    <div class="files-workspace"><form class="files-toolbar" data-files-filters role="search"><label>Search files<input type="search" name="search" value="${escapeAttribute(query.search || "")}"></label><label>Type<select name="type"><option value="">All types</option>${(payload.filters?.types || []).map((value) => `<option value="${escapeAttribute(value)}"${query.type === value ? " selected" : ""}>${escapeHtml(value.replaceAll("-", " "))}</option>`).join("")}</select></label><label>Status<select name="status"><option value="">All statuses</option>${(payload.filters?.statuses || []).map((value) => `<option value="${escapeAttribute(value)}"${query.status === value ? " selected" : ""}>${escapeHtml(value.replaceAll("-", " "))}</option>`).join("")}</select></label><label>Sort<select name="sort"><option value="recent">Recently modified</option><option value="name"${query.sort === "name" ? " selected" : ""}>Name</option><option value="owner"${query.sort === "owner" ? " selected" : ""}>Owner</option></select></label></form>
    <p class="files-status" role="status" aria-live="polite">${payload.pagination?.total || 0} file${payload.pagination?.total === 1 ? "" : "s"} in this view.</p>
    ${rows ? `<div class="files-list-head" aria-hidden="true"><span>File</span><span>Collection</span><span>Status</span><span>Owner</span><span>Modified</span><span></span></div><ol class="files-list">${rows}</ol>` : `<div class="files-empty"><h2>${emptyTitle}</h2><p>${query.search || query.type || query.status || query.collection || query.view !== "home" ? "Try changing or clearing the filters." : "Use New to add a document through the authorized Files flow."}</p></div>`}
    ${payload.pagination?.nextCursor ? `<button type="button" class="files-load-more" data-files-more="${escapeAttribute(payload.pagination.nextCursor)}">Load more</button>` : ""}</div></div>
  </section>`;
}

export function renderFilesLoading() {
  return `<section class="files-page files-loading" data-files-page aria-labelledby="files-title"><header class="files-header"><div><p class="files-eyebrow">Files</p><h1 id="files-title">Files</h1><p>Loading authorized files…</p></div></header><div role="status">Loading Files</div></section>`;
}
