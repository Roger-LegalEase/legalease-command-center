import { buildInboxView } from "./ui/view-models/inbox-view.mjs";
import { buildInboxPageView } from "./ui/view-models/inbox-page-view.mjs";
import { INBOX_INCLUDED_COLLECTIONS } from "./ui/view-models/inbox-sources.mjs";

export const INBOX_READ_COLLECTIONS = Object.freeze([
  ...INBOX_INCLUDED_COLLECTIONS,
  "activityEvents",
  "auditHistory"
]);

export function buildAuthorizedInboxPage(state = {}, actor = {}, now = "", query = {}) {
  return buildInboxPageView(buildInboxView(state, actor, now), query);
}
