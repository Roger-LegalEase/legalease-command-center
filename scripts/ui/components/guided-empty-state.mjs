import { escapeAttribute, escapeHtml } from "../html.mjs";
import { validateGuidedEmptyState } from "../../discovery-empty-states.mjs";

export function renderGuidedEmptyState(contract = {}) {
  validateGuidedEmptyState(contract);
  return `<section class="guided-empty-state" data-guided-empty-state="${escapeAttribute(contract.area)}" data-guided-empty-kind="${escapeAttribute(contract.state)}" aria-labelledby="guided-empty-${escapeAttribute(contract.area)}-title"${["unavailable", "unauthorized"].includes(contract.state) ? ' role="alert"' : ""}>
    <span class="guided-empty-icon" aria-hidden="true">${contract.state === "unauthorized" ? "◇" : contract.state === "unavailable" ? "!" : "＋"}</span>
    <div><h2 id="guided-empty-${escapeAttribute(contract.area)}-title">${escapeHtml(contract.title)}</h2><p>${escapeHtml(contract.purpose)}</p><p class="guided-empty-next"><strong>What happens next:</strong> ${escapeHtml(contract.next)}</p>${contract.example ? `<p class="guided-empty-example">${escapeHtml(contract.example)}</p>` : ""}</div>
    <button type="button" data-guided-empty-action="${escapeAttribute(contract.action.kind)}" data-guided-empty-area="${escapeAttribute(contract.area)}">${escapeHtml(contract.action.label)}</button>
  </section>`;
}
