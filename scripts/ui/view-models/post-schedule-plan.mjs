import { comparePostChannels, postChannelLabel } from "./post-channel-variant-sources.mjs";
import { collectPostSchedulePlanSources } from "./post-schedule-plan-sources.mjs";

const clean = (value = "") => String(value ?? "").trim();

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const POST_SCHEDULE_PLAN_STATES = deepFreeze({
  unscheduled: { key: "unscheduled", label: "Unscheduled" },
  scheduleMissing: { key: "schedule_missing", label: "Schedule missing" },
  scheduled: { key: "scheduled", label: "Scheduled" },
  invalidSchedule: { key: "invalid_schedule", label: "Invalid schedule" },
  scheduleConflict: { key: "schedule_conflict", label: "Schedule conflict" },
  alreadyPublished: { key: "already_published", label: "Already published" },
  unavailable: { key: "unavailable", label: "Unavailable" }
});

function stateValue(key) {
  return { ...Object.values(POST_SCHEDULE_PLAN_STATES).find((value) => value.key === key) };
}

function compactReference(reference = {}) {
  if (!reference || typeof reference !== "object") return null;
  const collection = clean(reference.collection || reference.sourceCollection);
  const sourceId = clean(reference.sourceId);
  if (!collection || !sourceId) return null;
  const output = { collection, sourceId };
  const relationship = clean(reference.relationship);
  if (relationship) output.relationship = relationship;
  const href = clean(reference.href);
  if (href.startsWith("#")) output.href = href;
  return output;
}

function referenceKey(reference = {}) {
  return `${clean(reference.collection)}:${clean(reference.sourceId)}:${clean(reference.relationship)}`;
}

function dedupeReferences(references = []) {
  const map = new Map();
  for (const reference of references) {
    const compact = compactReference(reference);
    if (compact) map.set(referenceKey(compact), compact);
  }
  return [...map.values()].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right), "en-US"));
}

function conflict(key, channel = null, sourceReference = null) {
  const definitions = {
    explicit_schedule_conflict: ["Stored schedule conflict", "A stored conflict record applies to this schedule."],
    invalid_stored_time: ["Invalid stored time", "The stored schedule is not a valid date and time."],
    nonexistent_local_time: ["Local time does not exist", "The stored local time falls inside a daylight-saving clock gap."],
    ambiguous_local_time: ["Local time is ambiguous", "The stored local time occurs twice and has no explicit offset."],
    invalid_timezone: ["Invalid timezone", "The stored timezone is not recognized."],
    inconsistent_channel_schedule: ["Shared and channel schedule differ", "An explicit channel schedule does not match the shared schedule."],
    comparison_unavailable: ["Schedule comparison unavailable", "The exact stored schedules are preserved, but one or both absolute instants are unavailable."],
    ambiguous_channel_schedule: ["Channel schedule is ambiguous", "More than one explicit schedule applies to the same channel."],
    published_channel_in_retry_plan: ["Published channel included in retry", "A stored retry plan includes a channel with explicit published evidence."]
  };
  const [label, explanation] = definitions[key] || ["Schedule conflict", "Stored schedule truth needs review."];
  return {
    key,
    label,
    explanation,
    channel,
    sourceReference: compactReference(sourceReference)
  };
}

function conflictKey(item = {}) {
  return `${item.key}:${item.channel || ""}:${referenceKey(item.sourceReference || {})}`;
}

function dedupeConflicts(conflicts = []) {
  const map = new Map();
  for (const item of conflicts) map.set(conflictKey(item), item);
  return [...map.values()].sort((left, right) => {
    const channelOrder = comparePostChannels(left.channel || "", right.channel || "");
    return channelOrder || conflictKey(left).localeCompare(conflictKey(right), "en-US");
  });
}

function statusInvalid(status = "") {
  return /invalid|failed|blocked/.test(clean(status).toLocaleLowerCase("en-US"));
}

function statusConflict(status = "") {
  return /conflict/.test(clean(status).toLocaleLowerCase("en-US"));
}

function scheduleFactInvalid(fact) {
  return Boolean(fact?.present && fact.exact && (!fact.valid || statusInvalid(fact.status) || fact.timezone.state === "invalid"));
}

function sameStoredLocalTruth(left, right) {
  return Boolean(left?.exact && right?.exact && left.exact === right.exact && left.timezone.exact === right.timezone.exact);
}

function bothInstantsResolved(left, right) {
  return left?.instantState === "resolved" && right?.instantState === "resolved"
    && Number.isFinite(left.epochMs) && Number.isFinite(right.epochMs);
}

function schedulesConflict(left, right) {
  return bothInstantsResolved(left, right) && left.epochMs !== right.epochMs;
}

function comparisonUnavailable(left, right) {
  return Boolean(left?.valid && right?.valid && !sameStoredLocalTruth(left, right) && !bothInstantsResolved(left, right));
}

function hasValidChannelSchedule(channelSchedules = []) {
  return channelSchedules.filter((item) => item.candidate?.valid && !statusInvalid(item.candidate.status) && !statusConflict(item.candidate.status));
}

function planConflicts(source) {
  const conflicts = source.storedConflicts.map((item) => conflict(item.key, item.channel, item.sourceReference));
  const shared = source.sharedSchedule;
  if (statusConflict(shared.status)) conflicts.push(conflict("explicit_schedule_conflict", null, shared.sourceReference));
  if (shared.instantState === "ambiguous") conflicts.push(conflict("ambiguous_local_time", null, shared.sourceReference));
  else if (shared.instantState === "nonexistent") conflicts.push(conflict("nonexistent_local_time", null, shared.sourceReference));
  else if (shared.present && shared.exact && !shared.valid) conflicts.push(conflict("invalid_stored_time", null, shared.sourceReference));
  if (shared.timezone.state === "invalid") conflicts.push(conflict("invalid_timezone", null, shared.sourceReference));

  for (const item of source.channelSchedules) {
    if (item.ambiguous) {
      conflicts.push(conflict("ambiguous_channel_schedule", item.channel));
      continue;
    }
    const candidate = item.candidate;
    if (!candidate) continue;
    if (statusConflict(candidate.status)) conflicts.push(conflict("explicit_schedule_conflict", item.channel, candidate.sourceReference));
    if (candidate.instantState === "ambiguous") {
      conflicts.push(conflict("ambiguous_local_time", item.channel, candidate.sourceReference));
    } else if (candidate.instantState === "nonexistent") {
      conflicts.push(conflict("nonexistent_local_time", item.channel, candidate.sourceReference));
    } else if (candidate.present && candidate.exact && !candidate.valid) {
      conflicts.push(conflict("invalid_stored_time", item.channel, candidate.sourceReference));
    }
    if (candidate.timezone.state === "invalid") conflicts.push(conflict("invalid_timezone", item.channel, candidate.sourceReference));
    if (schedulesConflict(shared, candidate)) {
      conflicts.push(conflict("inconsistent_channel_schedule", item.channel, candidate.sourceReference));
    } else if (comparisonUnavailable(shared, candidate)) {
      conflicts.push(conflict("comparison_unavailable", item.channel, candidate.sourceReference));
    }
  }

  const publicationByChannel = new Map(source.publication.map((item) => [item.channel, item.state]));
  for (const channel of source.retryChannels) {
    if (publicationByChannel.get(channel) === "published") {
      conflicts.push(conflict("published_channel_in_retry_plan", channel, source.sharedSchedule.sourceReference));
    }
  }
  return dedupeConflicts(conflicts);
}

function overallState(source, conflicts) {
  const selected = source.variants.selectedChannels;
  const everyPublished = selected.length > 0 && source.publication.every((item) => item.state === "published");
  if (everyPublished && source.composerDraft.readiness?.publication?.explicitEvidence === true) return "already_published";
  if (conflicts.some((item) => [
    "explicit_schedule_conflict", "inconsistent_channel_schedule", "ambiguous_channel_schedule", "ambiguous_local_time", "published_channel_in_retry_plan"
  ].includes(item.key))) return "schedule_conflict";

  const shared = source.sharedSchedule;
  if (scheduleFactInvalid(shared) || source.channelSchedules.some((item) => scheduleFactInvalid(item.candidate))) return "invalid_schedule";
  const validChannels = hasValidChannelSchedule(source.channelSchedules);
  const explicitChannelMissing = source.channelSchedules.some((item) => item.candidate?.present && !item.candidate.exact);
  const scheduleRequired = source.schedulePolicy.required === true
    || ["scheduled", "queued"].includes(source.schedulePolicy.status);
  if (shared.valid || (selected.length > 0 && validChannels.length === selected.length)) return "scheduled";
  if (explicitChannelMissing || (validChannels.length > 0 && validChannels.length < selected.length)
    || (scheduleRequired && (!shared.present || !shared.exact))) return "schedule_missing";
  return "unscheduled";
}

function channelPlan(source, schedule, overallKey) {
  const publication = source.publication.find((item) => item.channel === schedule.channel)?.state || "unavailable";
  const candidate = schedule.candidate;
  let key = "unscheduled";
  let reason = null;
  if (publication === "published") key = "already_published";
  else if (publication === "failed") key = "failed_publication";
  else if (schedule.ambiguous) {
    key = "unavailable";
    reason = "ambiguous_channel_schedule";
  } else if (candidate && (statusConflict(candidate.status)
    || candidate.instantState === "ambiguous"
    || schedulesConflict(source.sharedSchedule, candidate))) {
    key = "schedule_conflict";
  } else if (scheduleFactInvalid(candidate)) {
    key = "invalid_schedule";
  } else if (candidate?.valid) {
    key = "scheduled";
  } else if (candidate?.present && !candidate.exact) {
    key = "schedule_missing";
  } else if (source.sharedSchedule.valid) {
    key = "shared_schedule";
  } else if (overallKey === "schedule_missing") {
    key = "schedule_missing";
  }
  const timezoneUnavailable = candidate?.valid && candidate.instantState !== "resolved";
  const unavailableComparison = candidate && comparisonUnavailable(source.sharedSchedule, candidate);
  return {
    channel: schedule.channel,
    label: postChannelLabel(schedule.channel),
    scheduledAt: candidate?.present ? candidate.exact || null : null,
    timezone: candidate?.timezone?.exact || null,
    state: key,
    publicationState: publication,
    sourceReference: compactReference(candidate?.sourceReference),
    availability: {
      key: reason || timezoneUnavailable || unavailableComparison ? "unavailable" : "available",
      reason: reason || (unavailableComparison ? "comparison_unavailable" : timezoneUnavailable ? "instant_unavailable" : null)
    }
  };
}

function guidance(source, stateKey, conflicts) {
  const output = [{
    key: "separate_schedule_and_publication",
    label: "Scheduling and publishing stay separate",
    explanation: "This plan describes stored timing truth and cannot publish, approve, retry, or change a date.",
    executable: false
  }];
  if (source.sharedSchedule.valid && source.sharedSchedule.instantState === "resolved"
    && source.sharedSchedule.epochMs <= Date.parse(source.generatedAt)) {
    output.push({
      key: "schedule_due_or_past",
      label: "The stored time has arrived or passed",
      explanation: "Current repository runtime truth treats a valid past time as due; this read model does not relabel it invalid.",
      executable: false
    });
  }
  if ((source.sharedSchedule.valid && source.sharedSchedule.instantState !== "resolved")
    || source.channelSchedules.some((item) => item.candidate?.valid && item.candidate.instantState !== "resolved")) {
    output.push({
      key: "timezone_unavailable",
      label: "Timezone truth is incomplete",
      explanation: "No browser or environment timezone has been substituted for missing stored truth.",
      executable: false
    });
  }
  if (source.publication.some((item) => item.state === "published")
    && source.publication.some((item) => item.state !== "published")) {
    output.push({
      key: "preserve_published_channels",
      label: "Published channels remain complete",
      explanation: "Successful channels are distinguished from failed or scheduled channels and are not placed back into a plan.",
      executable: false
    });
  }
  const activeConflicts = conflicts.filter((item) => item.key !== "comparison_unavailable");
  if (activeConflicts.length) {
    output.push({
      key: "stored_conflict_present",
      label: "Stored schedule truth conflicts",
      explanation: "The conflict is reported without moving a date or inventing a replacement.",
      executable: false
    });
  } else if (conflicts.some((item) => item.key === "comparison_unavailable")) {
    output.push({
      key: "comparison_unavailable",
      label: "Schedule comparison is unavailable",
      explanation: "Stored local values remain exact, but no absolute comparison is fabricated.",
      executable: false
    });
  } else if (stateKey === "unscheduled") {
    output.push({
      key: "no_schedule_selected",
      label: "No schedule is stored",
      explanation: "Approval and channel selection do not create a schedule.",
      executable: false
    });
  }
  return output;
}

function unavailableResult(source) {
  return deepFreeze({
    postId: null,
    href: null,
    generatedAt: source.generatedAt,
    state: stateValue("unavailable"),
    scheduledAt: null,
    timezone: null,
    selectedChannels: [],
    channelPlans: [],
    conflicts: [],
    guidance: [],
    sourceReferences: [],
    availability: { key: "unavailable", reason: source.reason, counts: null },
    performance: { sourceCandidatesExamined: 0, postsProjected: 0 },
    capabilities: {
      writesSchedules: false,
      movesDates: false,
      drags: false,
      approves: false,
      publishes: false,
      retries: false,
      callsProviders: false,
      writesStorage: false,
      mutatesSource: false,
      mutatesPost: false,
      mutatesVariant: false
    }
  });
}

export function buildPostSchedulePlan(state = {}, actor = {}, postId = "", now = "") {
  const source = collectPostSchedulePlanSources(state, actor, postId, now);
  if (!source.authorized || !source.found) return unavailableResult(source);
  const conflicts = planConflicts(source);
  const stateKey = overallState(source, conflicts);
  const channelPlans = source.channelSchedules
    .map((schedule) => channelPlan(source, schedule, stateKey))
    .sort((left, right) => comparePostChannels(left.channel, right.channel));
  const unavailableFields = (source.sharedSchedule.valid && source.sharedSchedule.instantState !== "resolved" ? 1 : 0)
    + channelPlans.filter((plan) => plan.availability.key === "unavailable").length
    + channelPlans.filter((plan) => plan.publicationState === "unavailable").length
    + source.conflictLifecycleUnavailable;
  const sourceReferences = dedupeReferences([
    ...source.composerDraft.sourceReferences,
    ...source.variants.sourceReferences,
    source.sharedSchedule.sourceReference,
    ...channelPlans.map((plan) => plan.sourceReference),
    ...conflicts.map((item) => item.sourceReference)
  ]);
  return deepFreeze({
    postId: source.postView.id,
    href: source.postView.href,
    generatedAt: source.generatedAt,
    state: stateValue(stateKey),
    scheduledAt: source.sharedSchedule.present ? source.sharedSchedule.exact || null : null,
    timezone: source.sharedSchedule.timezone.exact,
    selectedChannels: [...source.variants.selectedChannels],
    channelPlans,
    conflicts,
    guidance: guidance(source, stateKey, conflicts),
    sourceReferences,
    availability: {
      key: unavailableFields ? "partial" : "available",
      reason: unavailableFields ? "schedule_truth_incomplete" : null,
      counts: {
        selectedChannels: source.variants.selectedChannels.length,
        channelPlans: channelPlans.length,
        scheduledPlans: channelPlans.filter((plan) => ["scheduled", "shared_schedule"].includes(plan.state)).length,
        conflicts: conflicts.length,
        unavailableFields
      }
    },
    performance: {
      sourceCandidatesExamined: source.diagnostics.sourceCandidatesExamined,
      postsProjected: 1
    },
    capabilities: {
      writesSchedules: false,
      movesDates: false,
      drags: false,
      approves: false,
      publishes: false,
      retries: false,
      callsProviders: false,
      writesStorage: false,
      mutatesSource: false,
      mutatesPost: false,
      mutatesVariant: false
    }
  });
}
