import {
  collectPostReadinessSources,
  normalizeReadinessChannel,
  readinessChannelLabel
} from "./post-readiness-sources.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

export const POST_READINESS_STATES = deepFreeze([
  { key: "ready_to_schedule", label: "Ready to schedule" },
  { key: "ready_for_review", label: "Ready for review" },
  { key: "ready_to_publish", label: "Ready to publish" },
  { key: "needs_fixes", label: "Needs fixes" },
  { key: "needs_connection", label: "Needs connection" },
  { key: "needs_schedule", label: "Needs schedule" },
  { key: "needs_approval", label: "Needs approval" },
  { key: "publishing_off", label: "Publishing is off" },
  { key: "published", label: "Published" },
  { key: "unavailable", label: "Unavailable" }
]);

export const POST_READINESS_CHECK_MATRIX = deepFreeze([
  { key: "content", label: "Content", truth: "Stored copy, guidelines, review, and compliance state" },
  { key: "creative", label: "Creative", truth: "Explicit final-asset, render-quality, style, and preview state" },
  { key: "channels", label: "Channels", truth: "Selected channels and durable connection state" },
  { key: "schedule", label: "Schedule", truth: "A valid stored publishing time" },
  { key: "approval", label: "Approval", truth: "Explicit Post or related approval state" },
  { key: "publishing", label: "Publishing", truth: "Stored results and read-only publication-gate state" }
]);

export const POST_READINESS_CHECK_CATEGORIES = Object.freeze(POST_READINESS_CHECK_MATRIX.map((category) => category.label));

const STATE_BY_KEY = new Map(POST_READINESS_STATES.map((state) => [state.key, state]));

function validNow(value = "") {
  const text = clean(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function status(key) {
  const labels = { passed: "Passed", needs_attention: "Needs attention", blocked: "Blocked", unavailable: "Unavailable" };
  return { key, label: labels[key] };
}

function sourceReference(collection, sourceId) {
  const id = clean(sourceId);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? { collection, sourceId: id } : null;
}

function check(key, category, label, statusKey, explanation, blocking, actionHint, sourceRef, hardFailure = false) {
  return {
    key,
    category,
    label,
    status: status(statusKey),
    explanation,
    blocking: blocking === true,
    hardFailure: hardFailure === true,
    actionHint: clean(actionHint) || null,
    sourceReference: sourceRef || null
  };
}

function guidelineText(failure = {}) {
  return lower(typeof failure === "string" ? failure : [
    failure.ruleId, failure.rule, failure.key, failure.type, failure.category,
    failure.message, failure.summary, failure.reason
  ].join(" "));
}

function contentChecks(context) {
  const post = context.post;
  const postRef = sourceReference("posts", post.id);
  const body = clean(post.body || post.caption || post.text);
  const guidelines = post.guidelinesGate || post.guidelines_gate;
  const checks = [];
  if (!body) checks.push(check("content_present", "Content", "Post content", "blocked", "The Post has no content to review.", true, "Add Post content", postRef));
  else checks.push(check("content_present", "Content", "Post content", "passed", "Post content is present.", false, "", postRef));

  if (!guidelines || typeof guidelines.passed !== "boolean") {
    checks.push(check("content_safety", "Content", "Content safety", "unavailable", "Stored content-check results are unavailable.", true, "Run the reviewed content checks", postRef));
    return checks;
  }

  const failures = list(guidelines.hardFails);
  const outcome = failures.some((failure) => /outcome.?promise|guarantee|promise/.test(guidelineText(failure)));
  const disclaimer = failures.some((failure) => /disclaimer|required.?notice/.test(guidelineText(failure)));
  const personalization = failures.some((failure) => /personalization|unsupported.?token|invalid.?token/.test(guidelineText(failure)));
  if (outcome) checks.push(check("content_outcome_claims", "Content", "Outcome claims", "blocked", "The copy contains a prohibited outcome promise.", true, "Remove the outcome promise", postRef, true));
  if (disclaimer) checks.push(check("content_disclaimer", "Content", "Required disclaimer", "blocked", "A required disclaimer is missing or invalid.", true, "Add the required disclaimer", postRef, true));
  if (personalization) checks.push(check("content_personalization", "Content", "Personalization", "blocked", "The copy contains unsupported personalization.", true, "Fix personalization", postRef, true));
  const remainingFailures = failures.filter((failure) => {
    const text = guidelineText(failure);
    return !/outcome.?promise|guarantee|promise|disclaimer|required.?notice|personalization|unsupported.?token|invalid.?token/.test(text);
  });
  if (remainingFailures.length || (guidelines.passed === false && failures.length === 0)) {
    checks.push(check("content_safety", "Content", "Content safety", "blocked", "One or more hard content checks failed.", true, "Fix content", postRef, true));
  } else if (!failures.length && guidelines.passed === true) {
    checks.push(check("content_safety", "Content", "Content safety", "passed", "Stored content checks passed.", false, "", postRef));
  }
  if (lower(post.complianceRisk || post.compliance_risk) === "high" || post.reviewRequired === true) {
    checks.push(check("content_review", "Content", "Content review", "needs_attention", "This content explicitly requires review.", true, "Review Post", postRef));
  }
  return checks;
}

function latestImage(context) {
  return [...context.postImages].sort((left, right) =>
    Number(right.versionNumber || right.imageVersion || 0) - Number(left.versionNumber || left.imageVersion || 0)
    || clean(right.createdAt || right.created_at).localeCompare(clean(left.createdAt || left.created_at), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  )[0] || null;
}

function creativeChecks(context) {
  const post = context.post;
  const postRef = sourceReference("posts", post.id);
  if (post.imageIntentionallyOmitted === true || post.image_intentionally_omitted === true) {
    return [check("creative", "Creative", "Creative", "passed", "Creative is explicitly not required for this Post.", false, "", postRef)];
  }
  const image = latestImage(context);
  if (!context.sourcePresence.postImages && !image) {
    return [check("creative", "Creative", "Creative", "unavailable", "Stored creative readiness is unavailable.", true, "Review creative", postRef)];
  }
  if (!image) return [check("creative", "Creative", "Creative", "blocked", "Required creative is missing.", true, "Add creative", postRef)];
  const imageRef = sourceReference("postImages", image.id);
  const generation = lower(image.generationStatus || image.generation_status || image.imageStatus);
  if (/failed|qa_failed|blocked|error/.test(generation)) {
    return [check("creative", "Creative", "Creative", "blocked", "Creative generation did not complete successfully.", true, "Fix creative", imageRef, true)];
  }
  if (image.renderQa?.passed === false || image.renderQA?.passed === false) {
    return [check("creative_quality", "Creative", "Creative quality", "blocked", "Creative quality checks failed.", true, "Fix creative", imageRef, true)];
  }
  const styleGate = image.styleGate || image.creativeDirection?.styleGate;
  if (styleGate?.passed === false || image.brandTreatmentPassed === false) {
    return [check("creative_brand", "Creative", "Brand treatment", "blocked", "Required brand treatment did not pass.", true, "Fix brand treatment", imageRef, true)];
  }
  const explicitlyReady = image.finalImageReady === true || image.final_image_ready === true;
  const qualityPassed = image.renderQa?.passed === true || image.renderQA?.passed === true;
  const stylePassed = styleGate?.passed === true || image.brandTreatmentPassed === true;
  if (explicitlyReady && qualityPassed && stylePassed) {
    return [check("creative", "Creative", "Creative", "passed", "Final creative and its quality checks passed.", false, "", imageRef)];
  }
  return [check("creative", "Creative", "Creative", "unavailable", "An asset reference exists, but final creative quality is not established.", true, "Review creative", imageRef)];
}

function channelChecks(context) {
  if (!context.channels.length) {
    return [check("channels_selected", "Channels", "Selected channels", "blocked", "No channel is selected.", true, "Choose a channel", sourceReference("posts", context.post.id))];
  }
  return context.accounts.map(({ channel, account }) => {
    const label = readinessChannelLabel(channel);
    if (!context.sourcePresence.socialAccounts) {
      return check(`channel_${channel}`, "Channels", label, "unavailable", `${label} connection status is unavailable.`, true, `Review ${label} connection`, sourceReference("posts", context.post.id));
    }
    if (!account) return check(`channel_${channel}`, "Channels", label, "blocked", `${label} is not connected.`, true, `Connect ${label}`, sourceReference("posts", context.post.id));
    const accountStatus = lower(account.status || account.connectionStatus);
    const durableIdentity = Boolean(account.connectedAt || account.externalAccountId || account.accountId || account.accountName);
    const connected = account.connected === true || (accountStatus === "connected" && durableIdentity)
      || (Boolean(account.connectedAt) && !/expired|error|disconnect|refresh/.test(accountStatus));
    if (!connected) return check(`channel_${channel}`, "Channels", label, /error|refresh|attention/.test(accountStatus) ? "needs_attention" : "blocked", /error|refresh|attention/.test(accountStatus) ? `${label} needs connection attention.` : `${label} is not connected.`, true, `Connect ${label}`, sourceReference("socialAccounts", account.id));
    const gate = context.gates && Object.prototype.hasOwnProperty.call(context.gates, channel) ? context.gates[channel] : null;
    if (gate === true) return check(`channel_${channel}`, "Channels", label, "passed", `${label} is connected and controlled publishing is enabled.`, false, "", sourceReference("socialAccounts", account.id));
    if (gate === false) return check(`channel_${channel}`, "Channels", label, "needs_attention", `${label} is connected, but publishing is off.`, false, "Review publishing options", sourceReference("socialAccounts", account.id));
    return check(`channel_${channel}`, "Channels", label, "unavailable", `${label} connection is stored, but publishing-gate status is unavailable.`, true, "Review channel status", sourceReference("socialAccounts", account.id));
  });
}

function approvalValue(context) {
  const post = context.post;
  const explicit = clean(post.approvalStatus || post.approval_status);
  if (explicit) return lower(explicit);
  const ordered = [...context.approvals].sort((left, right) =>
    clean(right.updatedAt || right.updated_at || right.createdAt || right.created_at).localeCompare(clean(left.updatedAt || left.updated_at || left.createdAt || left.created_at), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
  return lower(ordered[0]?.status);
}

function isApproved(context) {
  const state = lower(context.post.status);
  return ["approved", "scheduled", "publishing", "posted", "published", "retry_ready"].includes(state)
    || /approved|complete/.test(approvalValue(context)) || Boolean(context.post.approvedAt || context.post.approved_at);
}

function approvalSatisfied(context) {
  return isApproved(context) || context.post.approvalRequired === false || context.post.approval_required === false;
}

function hasScheduleField(post = {}) {
  return ["scheduledFor", "scheduled_at", "planned_date", "plannedDate"]
    .some((field) => Object.prototype.hasOwnProperty.call(post, field));
}

function hasPublicationProgress(context) {
  const raw = context.post.per_channel_publish_status || context.post.perChannelPublishStatus || {};
  return ["scheduled", "publishing", "posted", "published"].includes(lower(context.post.status))
    || Object.values(raw).some((value) => /scheduled|queued|pending|posted|published|success|complete|failed|blocked|error|retry/.test(lower(value)));
}

function scheduleCheck(context, hardBlocked) {
  const post = context.post;
  const postRef = sourceReference("posts", post.id);
  const raw = clean(post.scheduledFor || post.scheduled_at || post.planned_date || post.plannedDate);
  const scheduleStatus = lower(post.scheduleStatus || post.schedule_status);
  if (hardBlocked || !approvalSatisfied(context) || hasPublicationProgress(context)) return check("schedule", "Schedule", "Schedule", "passed", "No schedule is needed for the current step.", false, "", postRef);
  if (!hasScheduleField(post)) return check("schedule", "Schedule", "Schedule", "unavailable", "Schedule source data is unavailable.", true, "Review schedule status", postRef);
  if (/invalid|conflict|failed|blocked/.test(scheduleStatus)) return check("schedule", "Schedule", "Schedule", "blocked", "The selected schedule is invalid or conflicting.", true, "Choose a valid schedule", postRef);
  if (raw && !context.postView.schedule.scheduled) return check("schedule", "Schedule", "Schedule", "blocked", "The selected schedule is invalid.", true, "Choose a valid schedule", postRef);
  if (context.postView.schedule.scheduled) return check("schedule", "Schedule", "Schedule", "passed", "A valid schedule is selected.", false, "", postRef);
  if (["scheduled", "queued"].includes(lower(post.status)) || post.scheduleRequired === true) return check("schedule", "Schedule", "Schedule", "blocked", "A schedule is required but missing.", true, "Choose a schedule", postRef);
  return check("schedule", "Schedule", "Schedule", "needs_attention", "No schedule is selected.", false, "Choose a schedule", postRef);
}

function approvalCheck(context, hardBlocked) {
  const ref = sourceReference("posts", context.post.id);
  if (hardBlocked) return check("approval", "Approval", "Approval", "blocked", "Approval is blocked until hard failures are fixed.", true, "Fix blocking checks", ref);
  if (context.post.approvalRequired === false || context.post.approval_required === false) return check("approval", "Approval", "Approval", "passed", "Approval is explicitly not required.", false, "", ref);
  if (isApproved(context)) return check("approval", "Approval", "Approval", "passed", "The Post is approved; publication has not been inferred.", false, "", ref);
  const value = approvalValue(context);
  if (/required|not_requested|needs_review|review_required/.test(value)) return check("approval", "Approval", "Approval", "needs_attention", "The Post is ready to enter review.", true, "Review Post", ref);
  if (/reject|declin|changes|blocked/.test(value)) return check("approval", "Approval", "Approval", "blocked", "Approval requires changes.", true, "Fix requested changes", ref);
  if (/await|pending|requested|in_review/.test(value)) return check("approval", "Approval", "Approval", "needs_attention", "The Post is awaiting approval.", true, "Review Post", ref);
  return check("approval", "Approval", "Approval", "unavailable", "Approval status is unavailable.", true, "Review approval status", ref);
}

function channelResultStates(context) {
  const results = new Map();
  const events = [...context.publishEvents].sort((left, right) =>
    clean(left.occurredAt || left.occurred_at || left.updatedAt || left.updated_at || left.createdAt || left.created_at)
      .localeCompare(clean(right.occurredAt || right.occurred_at || right.updatedAt || right.updated_at || right.createdAt || right.created_at), "en-US")
    || clean(left.id).localeCompare(clean(right.id), "en-US")
    || stableSerialize(left).localeCompare(stableSerialize(right), "en-US")
  );
  for (const event of events) {
    const channel = normalizeReadinessChannel(event.channel || event.platform);
    const value = lower(event.statusAfter || event.status || event.eventType || event.action);
    if (!context.channels.includes(channel)) continue;
    if (/posted|published|success|complete/.test(value)) results.set(channel, "published");
    else if (/scheduled|queued|pending/.test(value)) results.set(channel, "scheduled");
    else if (/failed|blocked|error|retry/.test(value)) results.set(channel, "failed");
  }
  const raw = context.post.per_channel_publish_status || context.post.perChannelPublishStatus || {};
  for (const channel of context.channels) {
    const value = lower(raw[channel]);
    if (/posted|published|success|complete/.test(value)) results.set(channel, "published");
    else if (/scheduled|queued|pending/.test(value)) results.set(channel, "scheduled");
    else if (/failed|blocked|error|retry/.test(value)) results.set(channel, "failed");
  }
  if (context.channels.length === 1 && context.postView.status?.key === "published" && !results.has(context.channels[0])) {
    results.set(context.channels[0], "published");
  }
  return results;
}

function publishingChecks(context) {
  const ref = sourceReference("posts", context.post.id);
  const results = channelResultStates(context);
  const published = context.channels.filter((channel) => results.get(channel) === "published");
  const scheduled = context.channels.filter((channel) => results.get(channel) === "scheduled");
  const failed = context.channels.filter((channel) => results.get(channel) === "failed");
  const checks = [];
  if (context.channels.length && published.length === context.channels.length) {
    checks.push(check("publishing", "Publishing", "Publishing", "passed", "Every selected channel has an explicit published result.", false, "Open published result", ref));
  } else if (published.length && (published.length < context.channels.length || failed.length)) {
    checks.push(check("publishing", "Publishing", "Publishing", "needs_attention", "The Post has a partial channel result.", true, "Review channel results", ref));
  } else if (failed.length) {
    checks.push(check("publishing", "Publishing", "Publishing", "needs_attention", "A channel publication result needs attention.", true, "Review channel results", ref));
  } else if (context.postView.status?.key === "published" && context.channels.length > 1) {
    checks.push(check("publishing", "Publishing", "Publishing", "unavailable", "Publication is recorded, but selected-channel results are incomplete.", true, "Review channel results", ref));
  } else if (scheduled.length || lower(context.post.status) === "scheduled") {
    checks.push(check("publishing", "Publishing", "Publishing", "needs_attention", "The Post is scheduled but has not been published.", false, "Review schedule", ref));
  } else if (!context.gates) {
    checks.push(check("publishing", "Publishing", "Publishing", "unavailable", "Publishing status is unavailable.", true, "Review publishing status", ref));
  } else if (context.channels.some((channel) => context.gates[channel] === false)) {
    const manual = context.post.manualPublishingAvailable === true || context.post.manual_publishing_available === true;
    checks.push(check("publishing", "Publishing", "Publishing", "needs_attention", manual ? "Controlled publishing is off; manual publishing is explicitly available." : "Publishing is off for at least one selected channel.", false, manual ? "Publish manually" : "Review publishing options", ref));
  } else if (context.channels.length && context.channels.every((channel) => context.gates[channel] === true)) {
    checks.push(check("publishing", "Publishing", "Publishing", "passed", "Controlled publication is available after all other checks pass.", false, "", ref));
  } else {
    checks.push(check("publishing", "Publishing", "Publishing", "unavailable", "Publishing status is unavailable for at least one selected channel.", true, "Review publishing status", ref));
  }
  if ((published.length || context.postView.status?.key === "published") && context.postView.resultSummary?.metricsAvailable !== true) {
    checks.push(check("publishing_results", "Publishing", "Published results", "unavailable", "Publication is recorded, but analytics are unavailable.", false, "Open published result", ref));
  }
  return checks;
}

function stateAndNextStep(context, checks) {
  const find = (key) => checks.find((item) => item.key === key);
  const contentBlocked = checks.some((item) => item.category === "Content" && item.status.key === "blocked");
  const creativeBlocked = checks.some((item) => item.category === "Creative" && item.status.key === "blocked");
  const channelBlocked = checks.find((item) => item.category === "Channels" && ["blocked", "needs_attention"].includes(item.status.key) && item.blocking);
  const approval = find("approval");
  const schedule = find("schedule");
  const publishing = find("publishing");
  const allPublished = publishing?.status.key === "passed" && /every selected channel/i.test(publishing.explanation);
  const partialResult = publishing?.status.key === "needs_attention" && /partial channel result|channel publication result needs attention/i.test(publishing.explanation);
  const scheduledResult = publishing?.status.key === "needs_attention" && /scheduled but has not been published/i.test(publishing.explanation);
  const contentReview = checks.some((item) => item.category === "Content" && item.blocking && item.status.key === "needs_attention");
  let key = "unavailable";
  let next = { key: "review_post", label: "Review Post", explanation: "Review the unavailable source information." };
  if (allPublished) {
    key = "published";
    next = { key: "open_published_result", label: "Open published result", explanation: "Review the stored publication result." };
  } else if (partialResult) {
    key = "needs_fixes";
    next = { key: "review_channel_results", label: "Review channel results", explanation: "Resolve the partial publication result without republishing successful channels." };
  } else if (schedule?.status.key === "blocked" && /required but missing/.test(schedule.explanation)
    && !contentBlocked && !creativeBlocked && approval?.status.key !== "blocked") {
    key = "needs_schedule";
    next = { key: "choose_schedule", label: "Choose a schedule", explanation: "Add a valid schedule." };
  } else if (contentBlocked || creativeBlocked || schedule?.status.key === "blocked" || approval?.status.key === "blocked") {
    key = "needs_fixes";
    next = contentBlocked
      ? { key: "fix_content", label: "Fix content", explanation: "Resolve the blocking content checks." }
      : creativeBlocked
        ? { key: "add_creative", label: "Add creative", explanation: "Resolve the blocking creative checks." }
        : schedule?.status.key === "blocked"
          ? { key: "choose_schedule", label: "Choose a schedule", explanation: "Resolve the invalid or missing schedule." }
          : { key: "fix_requested_changes", label: "Fix requested changes", explanation: "Resolve the blocking approval feedback." };
  } else if (channelBlocked) {
    key = "needs_connection";
    next = { key: `connect_${channelBlocked.key.replace("channel_", "")}`, label: channelBlocked.actionHint, explanation: "Resolve the selected channel connection." };
  } else if (contentReview) {
    key = "ready_for_review";
    next = { key: "review_post", label: "Review Post", explanation: "Complete the explicitly required content review." };
  } else if (checks.some((item) => item.status.key === "unavailable" && item.blocking)) {
    key = "unavailable";
  } else if (approval?.status.key === "needs_attention") {
    const readyForReview = /ready to enter review/.test(approval.explanation);
    key = readyForReview ? "ready_for_review" : "needs_approval";
    next = readyForReview
      ? { key: "review_post", label: "Review Post", explanation: "Start the required Post review." }
      : { key: "request_approval", label: "Request approval", explanation: "Complete the existing approval workflow." };
  } else if (schedule?.status.key === "needs_attention") {
    key = "ready_to_schedule";
    next = { key: "schedule_post", label: "Schedule Post", explanation: "Choose a schedule without publishing anything." };
  } else if (publishing?.status.key === "needs_attention" && /Publishing is off|publishing is off|Controlled publishing is off/.test(publishing.explanation)) {
    key = "publishing_off";
    const manual = context.post.manualPublishingAvailable === true || context.post.manual_publishing_available === true;
    next = manual
      ? { key: "publish_manually", label: "Publish manually", explanation: "Use the separately controlled manual publishing workflow." }
      : { key: "review_publishing", label: "Review publishing", explanation: "Publishing remains disabled." };
  } else if (scheduledResult || (approval?.status.key === "passed" && schedule?.status.key === "passed" && publishing?.status.key === "passed")) {
    key = "ready_to_publish";
    next = { key: "review_post", label: "Review Post", explanation: "The Post is ready for a separately controlled publication step." };
  }
  const href = next.key.startsWith("connect_") || next.key === "review_publishing"
    ? "#settings"
    : next.key === "request_approval" ? "#queue" : context.postView.href || null;
  return { state: { ...STATE_BY_KEY.get(key) }, nextStep: { ...next, href } };
}

function unavailableResult(postId, now, reason = "unavailable") {
  return deepFreeze({
    postId: clean(postId) || null,
    generatedAt: validNow(now),
    available: false,
    availability: { key: "unavailable", reason },
    state: { ...STATE_BY_KEY.get("unavailable") },
    headline: "Post readiness unavailable",
    summary: "The Post or its authorized readiness sources are unavailable.",
    nextStep: null,
    counts: { total: null, passed: null, needsAttention: null, blocked: null, unavailable: null },
    checks: [],
    sourceAvailability: { postView: false, content: false, creative: false, channels: false, schedule: false, approval: false, publishing: false, analytics: false },
    performance: { sourceCandidatesExamined: 0 }
  });
}

export function buildPostReadiness(state = {}, actor = {}, postId = "", now = "") {
  const context = collectPostReadinessSources(state, actor, postId);
  if (!context.authorized || !context.found || !context.postView) return unavailableResult(postId, now, context.reason);
  const firstChecks = [...contentChecks(context), ...creativeChecks(context), ...channelChecks(context)];
  const hardBlocked = firstChecks.some((item) => item.hardFailure);
  const checks = [
    ...firstChecks,
    scheduleCheck(context, hardBlocked),
    approvalCheck(context, hardBlocked),
    ...publishingChecks(context)
  ];
  const counts = {
    total: checks.length,
    passed: checks.filter((item) => item.status.key === "passed").length,
    needsAttention: checks.filter((item) => item.status.key === "needs_attention").length,
    blocked: checks.filter((item) => item.status.key === "blocked").length,
    unavailable: checks.filter((item) => item.status.key === "unavailable").length
  };
  const resolved = stateAndNextStep(context, checks);
  const blocking = checks.filter((item) => item.blocking && item.status.key !== "passed").length;
  const result = {
    postId: clean(context.post.id),
    generatedAt: validNow(now),
    available: true,
    availability: { key: "available", reason: null },
    state: resolved.state,
    headline: resolved.state.key === "needs_fixes"
      ? `${blocking} ${blocking === 1 ? "fix" : "fixes"} before scheduling`
      : resolved.state.label,
    summary: blocking ? `${blocking} blocking readiness check${blocking === 1 ? "" : "s"} need attention.` : "No blocking readiness checks remain.",
    nextStep: resolved.nextStep,
    counts,
    checks,
    sourceAvailability: {
      postView: true,
      content: Boolean(context.post.guidelinesGate || context.post.guidelines_gate),
      creative: Boolean(latestImage(context) || context.post.imageIntentionallyOmitted || context.post.image_intentionally_omitted),
      channels: context.channels.length > 0,
      schedule: hasScheduleField(context.post),
      approval: approvalValue(context) !== "" || context.post.approvalRequired === false || isApproved(context),
      publishing: Boolean(context.gates) || context.postView.resultSummary?.available === true,
      analytics: context.postView.resultSummary?.metricsAvailable === true
    },
    performance: { sourceCandidatesExamined: context.candidatesExamined }
  };
  return deepFreeze(result);
}
