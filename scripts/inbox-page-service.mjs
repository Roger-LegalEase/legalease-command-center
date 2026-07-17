import { buildInboxView } from "./ui/view-models/inbox-view.mjs";
import { buildInboxPageView } from "./ui/view-models/inbox-page-view.mjs";

export function buildAuthorizedInboxPage(state = {}, actor = {}, now = "", query = {}) {
  return buildInboxPageView(buildInboxView(state, actor, now), query);
}
