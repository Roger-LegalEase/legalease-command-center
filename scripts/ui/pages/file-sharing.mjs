import { escapeAttribute, escapeHtml } from "../html.mjs";
import { FILE_SHARING_CONTRACT } from "../../ui-actions/files-sharing.mjs";

export function renderFileSharingControls({ file = {}, sharing = {}, canManage = false } = {}) {
  const roles = sharing.allowedRoles || [];
  return `<section class="file-sharing-controls" data-file-sharing data-source-kind="${escapeAttribute(file.sourceRef?.sourceKind || "")}" data-source-id="${escapeAttribute(file.sourceRef?.sourceId || "")}" aria-labelledby="file-sharing-title"><h2 id="file-sharing-title">Access</h2><p>Storage location does not make this File public.</p>${roles.length ? `<ul>${roles.map((role) => `<li><span>${escapeHtml(role)}</span>${canManage && role !== "owner" ? `<button type="button" data-file-access-action="revoke" data-target-role="${escapeAttribute(role)}">Revoke ${escapeHtml(role)} access</button>` : ""}</li>`).join("")}</ul>` : '<p class="file-detail-unavailable">No explicit role access is available.</p>'}${canManage ? `<form data-file-access-form><label>Grant role<select name="targetRole"><option value="admin">Admin</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></label><button type="submit">Grant access</button></form>` : ""}<p>${escapeHtml(FILE_SHARING_CONTRACT.reason)}</p><div data-file-access-status role="status" aria-live="polite"></div></section>`;
}
