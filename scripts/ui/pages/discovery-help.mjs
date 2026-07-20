import { escapeAttribute, escapeHtml } from "../html.mjs";

export const DISCOVERY_HELP_STYLESHEET = "/assets/ui/discovery-help.css";

export function renderContextualHelp(contract = {}) {
  const items = Array.isArray(contract.items) ? contract.items : [];
  return `<section class="discovery-help" data-discovery-help hidden>
    <button class="discovery-help-backdrop" type="button" data-help-close aria-label="Close Help" tabindex="-1"></button>
    <div class="discovery-help-drawer" role="dialog" aria-modal="true" aria-labelledby="discovery-help-title" tabindex="-1">
      <header><div><p>Contextual help</p><h1 id="discovery-help-title">${escapeHtml(contract.title || "Help for this page")}</h1><span>${escapeHtml(contract.description || "Choose a workflow guide.")}</span></div><button type="button" data-help-close aria-label="Close Help">×</button></header>
      <div class="discovery-help-layout"><nav aria-label="Help topics">${items.map((item) => `<button type="button" data-help-topic="${escapeAttribute(item.id)}"${item.id === contract.selected ? ' aria-current="true"' : ""}>${escapeHtml(item.label)}</button>`).join("")}</nav><div class="discovery-help-content">${items.map((item) => `<article data-help-panel="${escapeAttribute(item.id)}"${item.id === contract.selected ? "" : " hidden"}><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><ul>${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul><button type="button" data-help-action="${escapeAttribute(item.action.kind)}" data-help-item="${escapeAttribute(item.id)}">${escapeHtml(item.action.label)}</button></article>`).join("")}</div></div>
    </div>
  </section>`;
}
