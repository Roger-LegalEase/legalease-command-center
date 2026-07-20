import { escapeAttribute, escapeHtml } from "../html.mjs";
import { buildGuidedEmptyState } from "../../discovery-empty-states.mjs";
import { renderGuidedEmptyState } from "../components/guided-empty-state.mjs";

export const INVESTOR_ROOM_STYLESHEET = "/assets/ui/investor-room.css";
const unavailable = (value) => value ? escapeHtml(value) : '<span class="investor-unavailable">Unavailable</span>';
const dateValue = (value) => value && Number.isFinite(Date.parse(value))
  ? escapeHtml(new Intl.DateTimeFormat("en-US", { dateStyle:"medium" }).format(new Date(value)))
  : '<span class="investor-unavailable">Unavailable</span>';

export function renderInvestorRoom(view = {}) {
  const readiness = view.readiness || { available:false, band:"Unavailable" };
  const totalItems = (view.sections || []).reduce((sum, section) => sum + (section.items || []).length, 0);
  if (!totalItems) return `<section class="investor-room-page" data-investor-room aria-labelledby="investor-room-title"><header><div><p class="investor-eyebrow">Files</p><h1 id="investor-room-title">Investor Room</h1><p>See what is current, missing, or needs an update before sharing.</p></div></header>${renderGuidedEmptyState(buildGuidedEmptyState("investor-room", { state:readiness.available === false ? "unavailable" : "empty" }))}</section>`;
  const sections = (view.sections || []).map((section) => {
    const items = section.items.map((item) => `<li>
      <div><strong>${escapeHtml(item.name)}</strong><span class="investor-status investor-status-${escapeAttribute(item.status.key)}">${escapeHtml(item.status.label)}</span></div>
      <dl><div><dt>Owner</dt><dd>${unavailable(item.owner)}</dd></div><div><dt>Last verified</dt><dd>${dateValue(item.lastVerifiedAt)}</dd></div><div><dt>Access</dt><dd>${unavailable(item.shareStatus)}</dd></div></dl>
      ${item.status.reason ? `<p>${escapeHtml(item.status.reason)}</p>` : ""}${item.file ? `<a href="${escapeAttribute(item.file.href)}">Open ${escapeHtml(item.file.name || "File")}</a>` : ""}
    </li>`).join("");
    return `<section><h2>${escapeHtml(section.section)}</h2>${items ? `<ol>${items}</ol>` : '<p class="investor-empty">No explicit requirements are configured for this section.</p>'}</section>`;
  }).join("");
  return `<section class="investor-room-page" data-investor-room aria-labelledby="investor-room-title">
    <header><div><p class="investor-eyebrow">Files</p><h1 id="investor-room-title">Investor Room</h1><p>See what is current, missing, or needs an update before sharing.</p></div><div class="investor-readiness"><strong>${readiness.available ? `${readiness.percentage}%` : "Unavailable"}</strong><span>${escapeHtml(readiness.band || "Unavailable")}</span></div></header>
    <dl class="investor-summary"><div><dt>Current</dt><dd>${view.summary?.current || 0}</dd></div><div><dt>Needs update</dt><dd>${view.summary?.needsUpdate || 0}</dd></div><div><dt>Missing</dt><dd>${view.summary?.missing || 0}</dd></div></dl>
    <div class="investor-sections">${sections}</div>
  </section>`;
}
