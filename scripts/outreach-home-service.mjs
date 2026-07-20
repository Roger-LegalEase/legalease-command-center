import { GLOBAL_CREATE_ENDPOINTS } from "./global-create-service.mjs";
import { canPerformEndpoint, roleHasCapability } from "./roles.mjs";
import { buildCampaignViews } from "./ui/view-models/campaign-view.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const OUTREACH_HOME_ENDPOINT = "/api/ui/outreach";
export const OUTREACH_HOME_VIEWS = Object.freeze([
  Object.freeze({ key:"all", label:"All" }),
  Object.freeze({ key:"draft", label:"Draft" }),
  Object.freeze({ key:"scheduled", label:"Scheduled" }),
  Object.freeze({ key:"active", label:"Active" }),
  Object.freeze({ key:"completed", label:"Completed" })
]);
export const OUTREACH_HOME_LIMITS = Object.freeze({ default:24, maximum:40 });

export class OutreachHomeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OutreachHomeValidationError";
    this.status = 400;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function selectedView(value = "all") {
  const key = clean(value).toLocaleLowerCase("en-US") || "all";
  if (!OUTREACH_HOME_VIEWS.some((view) => view.key === key)) {
    throw new OutreachHomeValidationError("The selected Outreach view is invalid.");
  }
  return key;
}

function pageSize(value) {
  if (value === undefined || value === null || value === "") return OUTREACH_HOME_LIMITS.default;
  if (!/^\d{1,3}$/.test(String(value))) throw new OutreachHomeValidationError("The Outreach page size is invalid.");
  const parsed = Number(value);
  if (parsed < 1 || parsed > OUTREACH_HOME_LIMITS.maximum) throw new OutreachHomeValidationError("The Outreach page size is out of range.");
  return parsed;
}

function pageOffset(value = "", view = "all") {
  const cursor = clean(value);
  if (!cursor) return 0;
  const match = /^outreach-([a-z]+)-(\d{1,8})$/.exec(cursor);
  if (!match || match[1] !== view) throw new OutreachHomeValidationError("The Outreach cursor is invalid for this view.");
  return Number(match[2]);
}

function compactCount(value) {
  return Number.isFinite(value) ? value : null;
}

function compactCampaign(view) {
  const href = view.source.kind === "canonical"
    ? view.exactSafeSourceLink
    : `#outreach/campaign/${encodeURIComponent(view.stableIdentity)}`;
  return {
    id:view.stableIdentity,
    name:view.name,
    href,
    campaignType:view.campaignType,
    deliveryMode:view.deliveryMode,
    audience:{
      available:view.audience.available,
      summary:view.audience.summary,
      includedCount:compactCount(view.audience.includedCount),
      excludedCount:compactCount(view.audience.excluded?.count)
    },
    status:{ key:view.status.key, label:view.status.label },
    nextAction:view.nextAction,
    nextSend:view.schedule.sent !== true && view.schedule.scheduledAt
      ? { scheduledAt:view.schedule.scheduledAt, timezone:view.schedule.timezone }
      : null,
    replies:compactCount(view.repliesAndOutcomes.replyCount),
    outcome:{
      meetings:compactCount(view.repliesAndOutcomes.meetingCount),
      outcomes:compactCount(view.repliesAndOutcomes.outcomeCount),
      summary:view.repliesAndOutcomes.outcomeSummary
    },
    owner:view.owner
  };
}

const STATUS_ORDER = Object.freeze({ active:0, scheduled:1, draft:2, paused:3, completed:4 });

function sortCampaigns(left, right) {
  return (STATUS_ORDER[left.status.key] ?? 9) - (STATUS_ORDER[right.status.key] ?? 9)
    || clean(left.nextSend?.scheduledAt).localeCompare(clean(right.nextSend?.scheduledAt), "en-US")
    || clean(left.name).localeCompare(clean(right.name), "en-US")
    || left.id.localeCompare(right.id, "en-US");
}

export function buildAuthorizedOutreachHome(state = {}, actor = {}, now = "", options = {}) {
  if (actor?.authenticated !== true || !roleHasCapability(actor.role, "read_internal")) {
    return deepFreeze({
      ok:false,
      authorized:false,
      generatedAt:clean(now) || null,
      selectedView:"all",
      views:OUTREACH_HOME_VIEWS.map((view) => ({ ...view, count:null })),
      items:[],
      nextCursor:null,
      truncated:false,
      capabilities:{ createsCampaign:false, createCampaignReason:"This account cannot view Outreach.", mutatesSource:false, launches:false, schedules:false, approves:false }
    });
  }

  const view = selectedView(options.view);
  const limit = pageSize(options.limit);
  const offset = pageOffset(options.cursor, view);
  const campaigns = buildCampaignViews(state, actor).map(compactCampaign).sort(sortCampaigns);
  const filtered = view === "all" ? campaigns : campaigns.filter((campaign) => campaign.status.key === view);
  const items = filtered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const createDecision = canPerformEndpoint(actor.role, "POST", GLOBAL_CREATE_ENDPOINTS.campaign);

  return deepFreeze({
    ok:true,
    authorized:true,
    generatedAt:clean(now) || null,
    selectedView:view,
    views:OUTREACH_HOME_VIEWS.map((option) => ({
      ...option,
      count:option.key === "all" ? campaigns.length : campaigns.filter((campaign) => campaign.status.key === option.key).length
    })),
    items,
    nextCursor:nextOffset < filtered.length ? `outreach-${view}-${nextOffset}` : null,
    truncated:nextOffset < filtered.length,
    capabilities:{
      createsCampaign:createDecision.ok,
      createCampaignReason:createDecision.ok ? null : "This account can view Outreach but cannot create campaigns.",
      mutatesSource:false,
      launches:false,
      schedules:false,
      approves:false
    }
  });
}
