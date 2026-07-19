import { roleHasCapability } from "./roles.mjs";
import { buildPostSchedulePlan } from "./ui/view-models/post-schedule-plan.mjs";

export const SOCIAL_SCHEDULE_ENDPOINT = "/api/ui/social/post/:postId/schedule";
const clean = (value = "") => String(value ?? "").trim();
function fail(message, status = 400, outcome = "validation_error") { throw Object.assign(new Error(message), { status, outcome }); }
function authorize(actor) { if (actor?.authenticated !== true || !roleHasCapability(actor.role, "manage_content_drafts")) fail("This Social action is not available.", 403, "forbidden"); }

function validZone(value) {
  const zone = clean(value);
  if (!zone || zone.length > 80 || !/^[A-Za-z][A-Za-z0-9_+\-/]+$/.test(zone)) return "";
  try { new Intl.DateTimeFormat("en-US", { timeZone:zone }).format(0); return zone; } catch { return ""; }
}

function explicitInstant(value) {
  const timestamp = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return null;
  const epoch = Date.parse(timestamp);
  return Number.isFinite(epoch) ? { timestamp, epoch } : null;
}

function timezoneMatchesLocal(timestamp, epoch, timezone) {
  const local = timestamp.slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:timezone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(epoch);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}` === local;
}

export function planSocialScheduleMutation(state, actor, postId, input = {}, now = new Date().toISOString()) {
  authorize(actor);
  const matches = (Array.isArray(state?.posts) ? state.posts : []).filter((post) => clean(post?.id) === clean(postId));
  if (matches.length !== 1) fail("This Post is unavailable.", 404, "unavailable");
  const post = matches[0];
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== Number(post._version)) fail("The Post changed. Reload before scheduling.", 409, "version_conflict");
  if (!clean(input.requestId) || clean(input.requestId).length > 160) fail("A bounded request ID is required.");
  const instant = explicitInstant(input.scheduledAt);
  const timezone = validZone(input.timezone);
  if (!instant) fail("Choose an exact date and time with an explicit offset.");
  if (!timezone) fail("Choose an explicit IANA timezone.");
  if (!timezoneMatchesLocal(instant.timestamp, instant.epoch, timezone)) fail("The date, offset, and timezone do not describe the same local time.", 409, "invalid_local_time");
  const currentEpoch = Date.parse(now);
  if (!Number.isFinite(currentEpoch) || instant.epoch <= currentEpoch || instant.epoch > currentEpoch + 366 * 24 * 60 * 60 * 1000) fail("Choose a future time within one year.");
  const plan = buildPostSchedulePlan(state, actor, postId, now);
  if (plan.state?.key === "schedule_conflict" || (plan.conflicts || []).some((item) => item.key === "published_channel_in_retry_plan")) fail("Resolve the current schedule conflict before moving this Post.", 409, "schedule_conflict");
  if ((plan.channelPlans || []).some((item) => item.publicationState === "published")) fail("A published channel cannot be returned to scheduling.", 409, "published_channel");
  return Object.freeze({ post, plan, patch:{ scheduledFor:instant.timestamp, timezone, scheduleStatus:"scheduled" } });
}

export async function saveSocialSchedule(dependencies, state, actor, postId, input = {}) {
  if (typeof dependencies?.commitPostMutation !== "function") fail("Schedule persistence is unavailable.", 503, "unavailable");
  const now = typeof dependencies.now === "function" ? dependencies.now() : new Date().toISOString();
  const plan = planSocialScheduleMutation(state, actor, postId, input, now);
  const result = await dependencies.commitPostMutation({
    postId:clean(postId), expectedVersion:input.expectedVersion, requestId:clean(input.requestId), actorId:clean(actor.id || actor.actorId), patch:plan.patch,
    activity:{ type:"social_post_scheduled", postId:clean(postId), summary:`Post moved to ${plan.patch.scheduledFor} (${plan.patch.timezone}).` },
    audit:{ action:"social_post_schedule_saved", resourceType:"post", resourceId:clean(postId), scheduledAt:plan.patch.scheduledFor, timezone:plan.patch.timezone }
  });
  return { ok:true, outcome:"scheduled", version:result.version, schedule:{ scheduledAt:plan.patch.scheduledFor, timezone:plan.patch.timezone } };
}
