import { escapeAttribute, escapeHtml } from "../html.mjs";

export const DISCOVERY_CHECKLIST_STYLESHEET = "/assets/ui/discovery-checklist.css";

export function renderDiscoveryChecklist(contract = {}) {
  const items = Array.isArray(contract.items) ? contract.items : [];
  const progress = contract.progress || { complete:0, total:items.length, percentage:0 };
  return `<section class="discovery-checklist" data-discovery-checklist aria-labelledby="discovery-checklist-title">
    <header><div><p class="discovery-checklist-eyebrow">Getting started</p><h1 id="discovery-checklist-title">${escapeHtml(contract.title || "Set up your Command Center")}</h1><p>${escapeHtml(contract.description || "Setup progress comes from current authorized product state.")}</p></div><div class="discovery-checklist-progress" aria-label="${escapeAttribute(`${progress.complete} of ${progress.total} setup items complete`)}"><strong>${escapeHtml(`${progress.complete}/${progress.total}`)}</strong><span>complete</span></div></header>
    <div class="discovery-checklist-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeAttribute(progress.percentage || 0)}"><span style="width:${Math.max(0, Math.min(100, progress.percentage || 0))}%"></span></div>
    <ol>${items.map((item) => `<li data-checklist-item="${escapeAttribute(item.id)}" data-checklist-state="${escapeAttribute(item.status?.key || "unavailable")}"><span class="discovery-checklist-mark" aria-hidden="true">${item.status?.complete ? "✓" : "○"}</span><div><h2>${escapeHtml(item.label)}</h2><p>${escapeHtml(item.status?.detail || "Current setup truth is unavailable.")}</p><span class="discovery-checklist-status">${escapeHtml(item.status?.label || "Unavailable")}</span></div><button type="button" data-checklist-action="${escapeAttribute(item.id)}">${item.status?.complete ? "Open" : "Set up"}<span class="sr-only"> ${escapeHtml(item.label)}</span></button></li>`).join("")}</ol>
    <p class="discovery-checklist-live" data-checklist-live role="status" aria-live="polite"></p>
  </section>`;
}
