import { roleHasCapability } from "./roles.mjs";
import { buildPostSchedulePlan } from "./ui/view-models/post-schedule-plan.mjs";

export const SOCIAL_CALENDAR_ENDPOINT = "/api/ui/social/calendar";
const clean = (value = "") => String(value ?? "").trim();
const safeTitle = (value) => clean(value).slice(0, 180) || "Untitled Post";

export function buildSocialCalendarContract(state = {}, actor = {}, options = {}) {
  const generatedAt = clean(options.generatedAt || options.now);
  if (actor?.authenticated !== true || !roleHasCapability(actor.role, "read_internal")) return { ok:false, outcome:"unavailable", generatedAt, items:[], unscheduled:[] };
  const items = [];
  const unscheduled = [];
  for (const post of Array.isArray(state.posts) ? state.posts : []) {
    if (!clean(post?.id)) continue;
    const plan = buildPostSchedulePlan(state, actor, post.id, generatedAt);
    if (!plan.postId) continue;
    const item = { postId:plan.postId, href:`#social/post/${encodeURIComponent(plan.postId)}`, title:safeTitle(post.headline || post.title), state:plan.state?.key || "unavailable", scheduledAt:plan.scheduledAt || null, timezone:plan.timezone || null, channels:(plan.channelPlans || []).map((channel) => ({ channel:channel.channel, label:channel.label, state:channel.state })) };
    if (item.state === "unscheduled" || item.state === "schedule_missing") unscheduled.push(item); else items.push(item);
  }
  const sort = (left, right) => clean(left.scheduledAt).localeCompare(clean(right.scheduledAt), "en-US") || left.postId.localeCompare(right.postId, "en-US");
  items.sort(sort); unscheduled.sort((left, right) => left.title.localeCompare(right.title, "en-US") || left.postId.localeCompare(right.postId, "en-US"));
  return { ok:true, generatedAt, views:["month","week"], channelFilter:"all", items, unscheduled, counts:{ scheduled:items.length, unscheduled:unscheduled.length }, capabilities:{ reads:true, moves:false, publishes:false, approves:false } };
}
