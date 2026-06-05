import crypto from "node:crypto";

const bucketDefinitions = [
  {
    key: "blocked_live_systems",
    label: "Blocked live systems",
    summary: "Fix or park live-system blockers before operating the rest of the day."
  },
  {
    key: "due_today",
    label: "Scheduled or due today",
    summary: "Review work scheduled or due today."
  },
  {
    key: "overdue_followups",
    label: "Overdue partner/revenue follow-ups",
    summary: "Close overdue partner or revenue follow-ups."
  },
  {
    key: "ready_to_ship",
    label: "Ready-to-ship content",
    summary: "Move approved work into the scheduled publishing workflow."
  },
  {
    key: "bulk_review",
    label: "Bulk Review/Approval",
    summary: "Batch-review imported calendar drafts and identical-decision work."
  },
  {
    key: "creative_prep",
    label: "Creative/Image Prep",
    summary: "Prepare missing images, assets, public image links, or proof-to-content visuals."
  },
  {
    key: "reports_proof",
    label: "Reports/proof-to-content review",
    summary: "Review proof, reports, and evidence that can become updates."
  },
  {
    key: "rcap_watch",
    label: "RCAP/watch items",
    summary: "Watch RCAP readiness without making it live."
  },
  {
    key: "paused_future",
    label: "Paused/future items",
    summary: "Keep paused channels and future scheduled work out of daily attention."
  }
];

const bucketOrder = new Map(bucketDefinitions.map((bucket, index) => [bucket.key, index]));

function list(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value = "") {
  return String(value || "").trim();
}

function isoNow(options = {}) {
  return new Date(options.now || Date.now()).toISOString();
}

function isoDay(value = "") {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return asText(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function timestampMs(value = "") {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function itemRecord({ id, title, detail = "", type = "work_item", route = "queue", source = "", createdAt = "", extra = {} }) {
  return {
    id: asText(id) || `${type}-${crypto.randomUUID().slice(0, 8)}`,
    title: asText(title) || "Review item",
    detail: asText(detail),
    type,
    route,
    source,
    createdAt: createdAt || "",
    ...extra
  };
}

function socialAccount(state = {}, platform = "") {
  return list(state.socialAccounts).find(account => account.platform === platform) || {};
}

function gateEnabled(state = {}, platform = "") {
  const gate = state.runtime?.livePostingGates?.[platform] || {};
  return Boolean(gate.enabled);
}

function accountConnected(account = {}) {
  return Boolean(account.connected || account.status === "connected" || account.connectedAt);
}

function postPlatform(post = {}) {
  return asText(post.platform || post.channel || post.targetChannels?.[0]).toLowerCase();
}

function isMetaPlatform(platform = "") {
  return ["facebook", "instagram"].includes(asText(platform).toLowerCase());
}

function postScheduledAt(post = {}) {
  return asText(post.scheduledFor || post.scheduled_at || post.scheduledAt);
}

function isImportedCalendarPost(post = {}) {
  return /campaign_upload|social_calendar|import/i.test([post.sourceType, post.sourceReference, post.sourceTitle].join(" "));
}

function postIsDeleted(post = {}) {
  return post.status === "deleted" || Boolean(post.deletedAt);
}

function postIsPublished(post = {}) {
  return ["posted", "manually_posted", "published"].includes(asText(post.status).toLowerCase()) || Boolean(post.postedAt || post.manuallyPostedAt);
}

function postNeedsImage(post = {}) {
  if (postIsDeleted(post) || postIsPublished(post)) return false;
  const status = asText(post.status).toLowerCase();
  if (/image|asset|creative/.test(status)) return true;
  if (post.imageBrief === "" || post.image_direction === "") return true;
  if (post.imageBrief || post.imageDirection || post.overlayText || post.wilmaPreference) return false;
  return false;
}

function postNeedsBulkReview(post = {}) {
  if (!isImportedCalendarPost(post) || postIsDeleted(post) || postIsPublished(post)) return false;
  const platform = postPlatform(post);
  const status = asText(post.status).toLowerCase();
  if (isMetaPlatform(platform)) return false;
  if (["scheduled", "posted", "manually_posted", "approved"].includes(status) && postScheduledAt(post)) return false;
  if (postNeedsImage(post)) return false;
  return ["", "draft", "needs_review", "review", "ready_for_review"].includes(status);
}

function postIsReadyToShip(post = {}) {
  if (postIsDeleted(post) || postIsPublished(post)) return false;
  const status = asText(post.status).toLowerCase();
  if (!["approved", "retry_ready"].includes(status)) return false;
  return !postScheduledAt(post);
}

function postIsDueToday(post = {}, today = isoDay()) {
  if (postIsDeleted(post) || postIsPublished(post)) return false;
  const scheduled = postScheduledAt(post);
  if (!scheduled) return false;
  return isoDay(scheduled) <= today && ["scheduled", "approved", "retry_ready"].includes(asText(post.status).toLowerCase());
}

function postIsPausedOrFuture(post = {}, today = isoDay()) {
  if (postIsDeleted(post) || postIsPublished(post)) return false;
  const platform = postPlatform(post);
  const scheduled = postScheduledAt(post);
  if (isMetaPlatform(platform) || post.publishingStatus === "meta_paused") return true;
  return Boolean(scheduled && isoDay(scheduled) > today && ["scheduled", "approved"].includes(asText(post.status).toLowerCase()));
}

function taskDueDate(task = {}) {
  return asText(task.dueDate || task.due_date || task.nextFollowUpDate || task.next_follow_up_date);
}

function taskOpen(task = {}) {
  return !["done", "complete", "completed", "archived", "deleted"].includes(asText(task.status).toLowerCase());
}

function isPartnerFollowup(task = {}) {
  return /partner|follow|revenue|investor|sponsor|proposal/i.test([task.sourceType, task.category, task.title, task.description, task.notes].join(" "));
}

function isReportLike(item = {}) {
  return /report|proof|evidence|investor|data room|data_room/i.test([item.type, item.reportType, item.reportTitle, item.title, item.status, item.nextAction].join(" "));
}

function isRcapLike(item = {}) {
  return /rcap|wilma|briefcase|partner journey|partner page|document generation/i.test([item.id, item.artifact, item.title, item.name, item.status, item.review_state].join(" "));
}

function bucketItemIds(session = {}, bucketKey = "") {
  const ids = new Set();
  for (const item of list(session.parked_items)) if (!bucketKey || item.bucket_key === bucketKey) ids.add(item.item_id);
  for (const item of list(session.skipped_bucket_keys)) if (!bucketKey || item.bucket_key === bucketKey) ids.add(item.item_id || item.bucket_key);
  return ids;
}

function bucketCleared(bucket = {}, session = {}) {
  if (list(session.completed_bucket_keys).includes(bucket.key) || list(session.skipped_bucket_keys).includes(bucket.key)) return true;
  const parked = bucketItemIds(session, bucket.key);
  return list(bucket.items).every(item => parked.has(item.id));
}

function firstUnclearedBucket(snapshot = {}, session = {}) {
  return list(snapshot.buckets).find(bucket => bucket.items?.length && !bucketCleared(bucket, session)) || null;
}

function sortBuckets(buckets = []) {
  return buckets
    .map(bucket => ({ ...bucket, count: list(bucket.items).length }))
    .filter(bucket => bucket.count > 0)
    .sort((a, b) => (bucketOrder.get(a.key) ?? 999) - (bucketOrder.get(b.key) ?? 999));
}

export function buildDailyRunSnapshot(state = {}, options = {}) {
  const now = isoNow(options);
  const today = isoDay(now);
  const buckets = Object.fromEntries(bucketDefinitions.map(definition => [definition.key, { ...definition, items: [] }]));

  if (gateEnabled(state, "linkedin") && !accountConnected(socialAccount(state, "linkedin"))) {
    buckets.blocked_live_systems.items.push(itemRecord({
      id: "linkedin-live-disconnected",
      title: "LinkedIn live gate is on but LinkedIn is disconnected",
      detail: "Reconnect LinkedIn or park the blocker for this session.",
      type: "blocked_live_system",
      route: "settings",
      source: "live_gate"
    }));
  }
  if (gateEnabled(state, "x") && !accountConnected(socialAccount(state, "x"))) {
    buckets.blocked_live_systems.items.push(itemRecord({
      id: "x-live-disconnected",
      title: "X live gate is on but X is disconnected",
      detail: "Reconnect X or park the blocker for this session.",
      type: "blocked_live_system",
      route: "settings",
      source: "live_gate"
    }));
  }
  if (state.persistence === "supabase_unavailable" || state.schemaStatus?.stale || state.persistenceError) {
    buckets.blocked_live_systems.items.push(itemRecord({
      id: "storage-blocked",
      title: "Storage needs attention",
      detail: "Durable storage is reporting a problem.",
      type: "blocked_live_system",
      route: "os-health",
      source: "storage"
    }));
  }
  if (list(state.publishEvents).some(event => /failed|error/i.test([event.status, event.result, event.error].join(" ")))) {
    buckets.blocked_live_systems.items.push(itemRecord({
      id: "publishing-worker-failing",
      title: "Publishing worker needs review",
      detail: "A recent publishing event failed.",
      type: "blocked_live_system",
      route: "posted",
      source: "publishing_worker"
    }));
  }

  for (const post of list(state.posts)) {
    const platform = postPlatform(post);
    const title = post.title || post.headline || post.caption || "Social post";
    const base = {
      id: post.id,
      title,
      detail: postScheduledAt(post) ? `Scheduled: ${postScheduledAt(post)}` : post.caption || post.body || "",
      type: "social_post",
      route: "queue",
      source: isImportedCalendarPost(post) ? "imported_calendar" : "queue",
      createdAt: post.createdAt || post.created_at || "",
      extra: {
        platform,
        status: post.status || "",
        scheduled_at: postScheduledAt(post),
        imported_calendar: isImportedCalendarPost(post)
      }
    };
    if (postIsDueToday(post, today)) buckets.due_today.items.push(itemRecord(base));
    else if (postIsReadyToShip(post)) buckets.ready_to_ship.items.push(itemRecord(base));
    else if (postNeedsBulkReview(post)) buckets.bulk_review.items.push(itemRecord(base));
    else if (postNeedsImage(post)) buckets.creative_prep.items.push(itemRecord(base));
    else if (postIsPausedOrFuture(post, today)) buckets.paused_future.items.push(itemRecord(base));
  }

  for (const task of list(state.tasks)) {
    const due = taskDueDate(task);
    if (!taskOpen(task) || !due || due > today || !isPartnerFollowup(task)) continue;
    buckets.overdue_followups.items.push(itemRecord({
      id: task.id,
      title: task.title || "Partner follow-up",
      detail: task.nextAction || task.description || `Due ${due}`,
      type: "partner_followup",
      route: "tasks",
      source: task.sourceType || "task",
      createdAt: task.createdAt || task.created_at || ""
    }));
  }

  for (const partner of list(state.partners)) {
    const due = asText(partner.nextFollowUpDate || partner.next_follow_up_date || partner.dueDate);
    if (!due || due > today) continue;
    buckets.overdue_followups.items.push(itemRecord({
      id: partner.id,
      title: partner.organizationName || partner.name || "Partner follow-up",
      detail: partner.nextAction || "Review partner follow-up.",
      type: "partner_followup",
      route: "partners",
      source: "partner",
      createdAt: partner.createdAt || ""
    }));
  }

  for (const report of list(state.reports)) {
    if (!isReportLike(report) || /complete|approved|archived/i.test(asText(report.status))) continue;
    buckets.reports_proof.items.push(itemRecord({
      id: report.id,
      title: report.reportTitle || report.title || "Report review",
      detail: report.nextAction || report.notes || "Review report or proof item.",
      type: "report",
      route: "reports",
      source: "report",
      createdAt: report.createdAt || report.updatedAt || ""
    }));
  }

  for (const evidence of [...list(state.evidencePackNotes), ...list(state.dataRoomItems)]) {
    if (!isReportLike(evidence) || /complete|approved|archived/i.test(asText(evidence.status || evidence.review_state))) continue;
    buckets.reports_proof.items.push(itemRecord({
      id: evidence.id,
      title: evidence.title || evidence.artifact || "Proof-to-content review",
      detail: evidence.nextAction || evidence.summary || evidence.notes || "Review proof item.",
      type: "proof_to_content",
      route: "proof",
      source: "proof",
      createdAt: evidence.createdAt || evidence.updatedAt || ""
    }));
  }

  for (const item of [...list(state.reviewStates), ...list(state.productionActivationRuns), ...list(state.partnerProgramArtifacts)]) {
    if (!isRcapLike(item)) continue;
    buckets.rcap_watch.items.push(itemRecord({
      id: item.id || item.key || item.artifact,
      title: item.artifact || item.title || item.name || "RCAP watch item",
      detail: item.next_required_action || item.status || item.review_state || "Waiting",
      type: "rcap_watch",
      route: "production-activation-rcap",
      source: "rcap",
      createdAt: item.createdAt || item.updatedAt || ""
    }));
  }

  const ordered = sortBuckets(Object.values(buckets));
  return {
    snapshot_at: now,
    current_bucket_key: ordered[0]?.key || "",
    buckets: ordered,
    counts: dailyRunCountsFromBuckets(ordered)
  };
}

export function dailyRunCountsFromBuckets(buckets = []) {
  const byKey = Object.fromEntries(list(buckets).map(bucket => [bucket.key, list(bucket.items).length]));
  return {
    blocked: byKey.blocked_live_systems || 0,
    due_today: byKey.due_today || 0,
    overdue_followups: byKey.overdue_followups || 0,
    ready_to_approve: (byKey.bulk_review || 0) + (byKey.ready_to_ship || 0),
    scheduled_today: byKey.due_today || 0,
    bulk_review: byKey.bulk_review || 0,
    creative_prep: byKey.creative_prep || 0,
    paused_future: byKey.paused_future || 0
  };
}

export function createDailyRunSession(state = {}, options = {}) {
  const now = isoNow(options);
  const snapshot = buildDailyRunSnapshot(state, { now });
  const session = {
    session_id: options.session_id || `daily-run-${now.slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`,
    started_at: now,
    last_active_at: now,
    completed_at: "",
    abandoned_at: "",
    status: "active",
    bucket_snapshot: snapshot,
    current_bucket_key: snapshot.current_bucket_key,
    completed_bucket_keys: [],
    skipped_bucket_keys: [],
    parked_items: [],
    new_since_start: { items: [], count: 0 },
    session_counts: {
      items_reviewed: 0,
      items_approved: 0,
      posts_scheduled: 0,
      posts_published: 0,
      followups_prepared: 0,
      blockers_parked: 0,
      blockers_remaining: dailyRunCountsFromBuckets(snapshot.buckets).blocked
    },
    tomorrow_first_move: dailyRunTomorrowFirstMove({ bucket_snapshot: snapshot, current_bucket_key: snapshot.current_bucket_key })
  };
  const sessions = [session, ...list(state.dailyRunSessions).filter(item => item.status !== "active")].slice(0, 30);
  return { state: { ...state, dailyRunSessions: sessions }, session };
}

export function dailyRunSessionIsStale(session = {}, options = {}) {
  if (!session || session.status !== "active") return false;
  const now = new Date(options.now || Date.now());
  const started = new Date(session.started_at || 0);
  const lastActive = new Date(session.last_active_at || session.started_at || 0);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(started.getTime())) return false;
  if (isoDay(now.toISOString()) !== isoDay(started.toISOString())) return true;
  return Number.isFinite(lastActive.getTime()) && now.getTime() - lastActive.getTime() > 8 * 60 * 60 * 1000;
}

function snapshotItemIdSet(snapshot = {}) {
  const ids = new Set();
  for (const bucket of list(snapshot.buckets)) {
    for (const item of list(bucket.items)) ids.add(item.id);
  }
  return ids;
}

export function computeNewSinceStart(state = {}, session = {}, options = {}) {
  const snapshotIds = snapshotItemIdSet(session.bucket_snapshot || {});
  const startedAt = timestampMs(session.started_at);
  const candidates = [];
  for (const post of list(state.posts)) {
    const createdAt = post.createdAt || post.created_at || post.updatedAt || "";
    if (!post.id || snapshotIds.has(post.id) || timestampMs(createdAt) <= startedAt || postIsDeleted(post)) continue;
    candidates.push(itemRecord({
      id: post.id,
      title: post.title || post.caption || "New social post",
      detail: post.caption || post.body || "",
      type: "social_post",
      route: "queue",
      source: isImportedCalendarPost(post) ? "imported_calendar" : "queue",
      createdAt
    }));
  }
  for (const task of list(state.tasks)) {
    const createdAt = task.createdAt || task.created_at || task.updatedAt || "";
    if (!task.id || snapshotIds.has(task.id) || timestampMs(createdAt) <= startedAt || !taskOpen(task)) continue;
    candidates.push(itemRecord({
      id: task.id,
      title: task.title || "New task",
      detail: task.description || task.nextAction || "",
      type: "task",
      route: "tasks",
      source: task.sourceType || "task",
      createdAt
    }));
  }
  return { items: candidates.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt)), count: candidates.length };
}

export function activeDailyRunSession(state = {}, options = {}) {
  const session = list(state.dailyRunSessions).find(item => item.status === "active") || null;
  if (!session) return { session:null, stale:false, newSinceStart:{ items:[], count:0 }, criticalBanner:null };
  const newSinceStart = computeNewSinceStart(state, session, options);
  const currentSnapshot = buildDailyRunSnapshot(state, options);
  const parkedIds = bucketItemIds(session, "blocked_live_systems");
  const criticalItems = list(currentSnapshot.buckets.find(bucket => bucket.key === "blocked_live_systems")?.items)
    .filter(item => !snapshotItemIdSet(session.bucket_snapshot).has(item.id) && !parkedIds.has(item.id));
  return {
    session: { ...session, new_since_start: newSinceStart },
    stale: dailyRunSessionIsStale(session, options),
    newSinceStart,
    criticalBanner: criticalItems.length ? {
      title: "New live-system blocker detected",
      items: criticalItems,
      message: "This can affect publishing already in flight. Park it if it cannot be solved in this session."
    } : null
  };
}

export function dailyRunTomorrowFirstMove(session = {}) {
  const bucket = firstUnclearedBucket(session.bucket_snapshot || {}, session);
  if (!bucket) return "Start with a fresh Daily Run.";
  return `${bucket.label}: ${bucket.summary}`;
}

function upsertSession(state = {}, session = {}) {
  return {
    ...state,
    dailyRunSessions: [session, ...list(state.dailyRunSessions).filter(item => item.session_id !== session.session_id)].slice(0, 30)
  };
}

export function parkDailyRunItem(state = {}, sessionId = "", bucketKey = "", itemId = "", reason = "", options = {}) {
  const now = isoNow(options);
  const session = list(state.dailyRunSessions).find(item => item.session_id === sessionId && item.status === "active");
  if (!session) throw new Error("Daily Run session not found.");
  const parked = {
    bucket_key: bucketKey,
    item_id: itemId,
    reason: asText(reason) || "Parked for later review.",
    parked_at: now
  };
  const nextSession = {
    ...session,
    last_active_at: now,
    parked_items: [parked, ...list(session.parked_items).filter(item => !(item.bucket_key === bucketKey && item.item_id === itemId))]
  };
  const nextBucket = firstUnclearedBucket(nextSession.bucket_snapshot, nextSession);
  nextSession.current_bucket_key = nextBucket?.key || "";
  nextSession.session_counts = {
    ...(session.session_counts || {}),
    blockers_parked: list(nextSession.parked_items).filter(item => item.bucket_key === "blocked_live_systems").length,
    blockers_remaining: list(nextSession.bucket_snapshot?.buckets?.find(bucket => bucket.key === "blocked_live_systems")?.items).filter(item => !bucketItemIds(nextSession, "blocked_live_systems").has(item.id)).length
  };
  nextSession.tomorrow_first_move = dailyRunTomorrowFirstMove(nextSession);
  return { state: upsertSession(state, nextSession), session: nextSession };
}

export function completeDailyRunSession(state = {}, sessionId = "", options = {}) {
  const now = isoNow(options);
  const session = list(state.dailyRunSessions).find(item => item.session_id === sessionId && item.status === "active");
  if (!session) throw new Error("Daily Run session not found.");
  const nextSession = {
    ...session,
    status: "completed",
    completed_at: now,
    last_active_at: now
  };
  nextSession.session_counts = {
    ...(session.session_counts || {}),
    blockers_parked: list(session.parked_items).filter(item => item.bucket_key === "blocked_live_systems").length,
    blockers_remaining: list(session.bucket_snapshot?.buckets?.find(bucket => bucket.key === "blocked_live_systems")?.items).filter(item => !bucketItemIds(session, "blocked_live_systems").has(item.id)).length
  };
  nextSession.tomorrow_first_move = dailyRunTomorrowFirstMove(nextSession);
  return { state: upsertSession(state, nextSession), session: nextSession };
}

export function markDailyRunSessionAbandoned(state = {}, sessionId = "", options = {}) {
  const now = isoNow(options);
  const session = list(state.dailyRunSessions).find(item => item.session_id === sessionId);
  if (!session) throw new Error("Daily Run session not found.");
  const nextSession = {
    ...session,
    status: "abandoned",
    abandoned_at: now,
    last_active_at: now
  };
  return { state: upsertSession(state, nextSession), session: nextSession };
}

export function resumeDailyRunSession(state = {}, sessionId = "", options = {}) {
  const now = isoNow(options);
  const session = list(state.dailyRunSessions).find(item => item.session_id === sessionId && item.status === "active");
  if (!session) throw new Error("Daily Run session not found.");
  const nextSession = {
    ...session,
    last_active_at: now,
    tomorrow_first_move: session.tomorrow_first_move || dailyRunTomorrowFirstMove(session)
  };
  return { state: upsertSession(state, nextSession), session: nextSession };
}

export function startFreshDailyRunSession(state = {}, options = {}) {
  const now = isoNow(options);
  const abandonedSessions = list(state.dailyRunSessions).map(session =>
    session.status === "active" ? { ...session, status:"abandoned", abandoned_at:now, last_active_at:now } : session
  );
  return createDailyRunSession({ ...state, dailyRunSessions: abandonedSessions }, { now });
}

export function summarizeDailyRunSession(session = {}) {
  const counts = session.session_counts || {};
  return {
    items_reviewed: Number(counts.items_reviewed || 0),
    items_approved: Number(counts.items_approved || 0),
    posts_scheduled: Number(counts.posts_scheduled || 0),
    posts_published: Number(counts.posts_published || 0),
    followups_prepared: Number(counts.followups_prepared || 0),
    blockers_parked: Number(counts.blockers_parked || 0),
    blockers_remaining: Number(counts.blockers_remaining || 0),
    tomorrow_first_move: session.tomorrow_first_move || dailyRunTomorrowFirstMove(session)
  };
}

export function dailyRunSessionView(state = {}, options = {}) {
  const active = activeDailyRunSession(state, options);
  const completed = list(state.dailyRunSessions).find(item => item.status === "completed") || null;
  const snapshot = buildDailyRunSnapshot(state, options);
  return {
    activeSession: active.session,
    stale: active.stale,
    newSinceStart: active.newSinceStart,
    criticalBanner: active.criticalBanner,
    latestCompletedSession: completed,
    latestCompletedSummary: completed ? summarizeDailyRunSession(completed) : null,
    startSnapshot: snapshot,
    startInstruction: snapshot.buckets[0]?.summary || "Start by reviewing Today.",
    bestBucket: snapshot.buckets[0] || null,
    counts: snapshot.counts,
    doctrine: "Surface → Move → Confirm",
    importPreservation: "Bulk upload loads the machine. Guided Daily Run tells Roger what to operate. Scheduled publisher ships the work over time."
  };
}
