import crypto from "node:crypto";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function addDaysIso(now = new Date(), days = 0) {
  const date = new Date(now);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function slug(value = "") {
  return lower(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}

export const googleReadOnlyScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly"
];

export const googleRequiredReadOnlyScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly"
];

export function googleWorkspaceRedirectUri(env = process.env) {
  const explicit = env.GOOGLE_REDIRECT_URI || env.GOOGLE_OAUTH_REDIRECT_URI || "";
  if (explicit) return explicit;
  const base = String(env.APP_BASE_URL || env.PUBLIC_APP_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/api/google/callback` : "";
}

export function googleWorkspaceOAuthConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && googleWorkspaceRedirectUri(env));
}

export function googleWorkspaceMissingEnv(env = process.env) {
  return [
    ["GOOGLE_CLIENT_ID", env.GOOGLE_CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", env.GOOGLE_CLIENT_SECRET],
    ["GOOGLE_REDIRECT_URI or APP_BASE_URL", googleWorkspaceRedirectUri(env)]
  ].filter(([, value]) => !value).map(([key]) => key);
}

function hashRef(value = "") {
  return crypto.createHash("sha256").update(String(value || crypto.randomUUID())).digest("hex").slice(0, 16);
}

export function googleSourceRefHash(value = "") {
  return hashRef(value);
}

function safeSourceHash(event = {}) {
  return googleSourceRefHash(event.sourceEventId || event.id || [event.source, eventDate(event), event.eventType].join(":"));
}

function sourceKindForEvent(event = {}) {
  if (event.source === "calendar") return "event";
  if (event.rawPayload?.threadId) return "thread";
  return "message";
}

function senderDomainFromEvent(event = {}) {
  const raw = clean(event.rawPayload?.from || event.sender || "");
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (emailMatch) return lower(emailMatch[1]).slice(0, 80);
  const domainMatch = raw.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
  return domainMatch ? lower(domainMatch[0]).slice(0, 80) : "";
}

function eventDate(event = {}) {
  return clean(event.receivedAt || event.sentAt || event.date || event.rawPayload?.date || event.rawPayload?.startTime || event.rawPayload?.startsAt || event.createdAt);
}

function inferInsightType(event = {}, classification = {}) {
  const text = lower([event.title, event.summary, event.eventType, JSON.stringify(event.rawPayload || {})].join(" "));
  if (event.source === "calendar") {
    const start = event.rawPayload?.startTime || event.rawPayload?.startsAt || event.date || "";
    const startMs = start ? new Date(start).getTime() : 0;
    if (startMs && startMs > Date.now()) return "Meeting Prep";
    return "Post-Meeting Follow-up";
  }
  if (/decision|approve|approval|decide|green light|sign off/.test(text)) return "Decision Needed";
  if (/waiting on|pending|following up|checking in|circling back/.test(text)) return "Waiting on Someone";
  if (/reply|question|\?|can you|could you|please send|need from you/.test(text)) return "Needs Reply";
  if (/partner|partnership|pilot|proposal|intro|investor|sponsor|revenue/.test(text)) return "Partner Opportunity";
  if (/follow up|next step|next steps|overdue/.test(text)) return "Follow-up Overdue";
  if (classification.priority === "high") return "Follow-up Overdue";
  return "Blind Spot";
}

function confidenceScore(event = {}, classification = {}, insightType = "") {
  if (classification.priority === "high" || /Partner|Follow-up|Meeting|Decision/.test(insightType)) return 0.86;
  if (event.confidence === "high") return 0.9;
  if (event.confidence === "low") return 0.55;
  return 0.72;
}

function queueTypeForInsight(type = "", event = {}) {
  if (type === "Meeting Prep") return "Meeting Prep";
  if (type === "Post-Meeting Follow-up") return "Post-Meeting Follow-up";
  if (type === "Decision Needed") return "Decision Needed";
  if (type === "Waiting on Someone") return "Waiting on Someone";
  if (event.source === "calendar") return "Partner Follow-up";
  return /partner|proposal|pilot|investor|revenue/i.test([event.title, event.summary].join(" ")) ? "Partner Follow-up" : "Channel Review";
}

function nextActionForInsight(type = "", event = {}) {
  if (type === "Meeting Prep") return "Prepare agenda, desired decision, and follow-up owner before the meeting.";
  if (type === "Post-Meeting Follow-up") return "Capture the decision and send the internal follow-up plan.";
  if (type === "Decision Needed") return "Decide the next step or park the thread with a clear owner.";
  if (type === "Waiting on Someone") return "Check whether LegalEase is waiting on someone or owes the next move.";
  if (type === "Partner Opportunity") return "Review the partner angle and add a follow-up if it is real.";
  if (type === "Needs Reply") return "Review the thread and decide whether Roger owes a response.";
  return "Review this blind spot and decide whether it belongs in Queue.";
}

function labelForInsight(type = "", source = "") {
  if (type === "Meeting Prep") return "Calendar meeting prep";
  if (type === "Post-Meeting Follow-up") return "Post-meeting follow-up";
  if (type === "Decision Needed") return "Google decision needed";
  if (type === "Waiting on Someone") return "Google waiting item";
  if (type === "Partner Opportunity") return "Gmail follow-up opportunity";
  if (type === "Needs Reply") return "Gmail reply review";
  if (type === "Follow-up Overdue") return "Gmail follow-up opportunity";
  return source === "calendar" ? "Calendar review signal" : "Gmail blind spot";
}

export function googleInsightsFromEvents(events = [], options = {}) {
  const now = options.now || nowIso();
  return list(events)
    .filter((event) => ["gmail", "calendar"].includes(event.source))
    .map((event) => {
      const classification = classifyGoogleWorkspaceSignal(event);
      const type = inferInsightType(event, classification);
      const safeRef = safeSourceHash(event);
      const label = labelForInsight(type, event.source);
      const occurredAt = eventDate(event);
      return {
        id: `google-insight-${event.source}-${safeRef}`,
        source: event.source,
        sourceKind: sourceKindForEvent(event),
        sourceRefHash: safeRef,
        sourceRef: safeRef,
        sourceEventIdHash: safeRef,
        sourceLabel: event.source === "calendar" ? "Google Calendar" : "Gmail",
        title: label,
        date: occurredAt,
        occurredAt,
        receivedAt: event.source === "gmail" ? occurredAt : "",
        eventStart: event.source === "calendar" ? occurredAt : "",
        senderDomain: event.source === "gmail" ? senderDomainFromEvent(event) : "",
        insightType: type,
        inferredReason: classification.suggestedAction,
        suggestedQueueItemType: queueTypeForInsight(type, event),
        suggestedNextAction: nextActionForInsight(type, event),
        confidence: confidenceScore(event, classification, type),
        relatedPersonOrOrg: event.relatedEntityId || "",
        status: "suggested",
        created_at: now,
        createdAt: now,
        updatedAt: now,
        internalOnly: true,
        noOutboundAction: true
      };
    });
}

export function mergeGoogleInsights(state = {}, insights = [], options = {}) {
  const existing = new Map(list(state.googleInsights).map((item) => [item.id, item]));
  const now = options.now || nowIso();
  const incoming = [];
  for (const insight of list(insights)) {
    if (!insight?.id) continue;
    const current = existing.get(insight.id);
    if (current && !["suggested", "snoozed"].includes(current.status)) continue;
    incoming.push({
      ...current,
      ...insight,
      status: current?.status || insight.status || "suggested",
      created_at: current?.created_at || current?.createdAt || insight.created_at || now,
      createdAt: current?.createdAt || current?.created_at || insight.createdAt || now,
      updatedAt: now
    });
    existing.delete(insight.id);
  }
  return {
    ...state,
    googleInsights: [...incoming, ...existing.values()].slice(0, 500)
  };
}

export function googleInsightToQueueTask(insight = {}, options = {}) {
  const now = options.now || nowIso();
  const dueDate = (insight.eventStart || insight.receivedAt || insight.occurredAt || insight.date) ? String(insight.eventStart || insight.receivedAt || insight.occurredAt || insight.date).slice(0, 10) : todayIso(now);
  const title = `${insight.suggestedQueueItemType || "Google follow-up"}: ${insight.title || "Google read-only insight"}`;
  return {
    id: options.id || `task-google-insight-${hashRef(insight.id)}-${crypto.randomUUID().slice(0, 6)}`,
    title,
    description: insight.inferredReason || "Google read-only insight needs review.",
    owner: "Roger",
    status: "open",
    priority: Number(insight.confidence || 0) >= 0.85 ? "high" : "medium",
    dueDate,
    sourceType: insight.source === "calendar" ? "google_calendar" : "gmail",
    sourceId: insight.id || "",
    category: insight.suggestedQueueItemType || "Google Insight",
    nextAction: insight.suggestedNextAction || "Review and decide the next step.",
    notes: "Created from minimized Google read-only metadata. Open Google directly for message or calendar context.",
    escalationReason: insight.inferredReason || "Google read-only insight.",
    escalationKey: `google-insight:${insight.id}`,
    googleInsightId: insight.id || "",
    history: [{ action: "created", at: now, note: "Added from Google read-only insight. No email or calendar changes were made." }],
    createdAt: now,
    updatedAt: now
  };
}

export function googleInsightSummary(insights = []) {
  const active = list(insights).filter((item) => !["dismissed", "queued", "deleted"].includes(item.status));
  const byType = (type) => active.filter((item) => item.insightType === type).length;
  return {
    total: active.length,
    needsReply: byType("Needs Reply"),
    followUpsFound: active.filter((item) => /Follow-up|Partner Opportunity|Waiting on Someone|Decision Needed/.test(item.insightType || "")).length,
    meetingPrep: byType("Meeting Prep"),
    blindSpots: byType("Blind Spot"),
    queued: list(insights).filter((item) => item.status === "queued").length,
    dismissed: list(insights).filter((item) => item.status === "dismissed").length,
    lastScanAt: list(insights).map((item) => item.scannedAt || item.updatedAt || item.createdAt || "").filter(Boolean).sort().at(-1) || ""
  };
}

export function classifyGoogleWorkspaceSignal(event = {}) {
  const text = lower([event.title, event.summary, event.eventType, JSON.stringify(event.rawPayload || {})].join(" "));
  const isCalendar = event.source === "calendar";
  const sourceType = isCalendar
    ? /investor|fund|acquirer|partner|pilot|county|nonprofit|goodwill|clean slate|timedone|fulton/i.test(text)
      ? "meeting_notes"
      : "meeting_notes"
    : /complaint|refund|legal advice|guarantee|eligib|court|attorney|privacy|sensitive/i.test(text)
      ? "compliance_concern"
      : /proposal|partnership|pilot|partner|follow up|document request/i.test(text)
        ? "partner_update"
      : /investor|fund|raise|acquirer|diligence|data room/i.test(text)
        ? "investor_note"
        : /customer|support|issue|problem|confus/i.test(text)
            ? "customer_support_issue"
            : "partner_update";
  const riskLevel = /legal advice|guarantee|eligib|court outcome|attorney|complaint|refund|privacy|sensitive/i.test(text) ? "high" : /proposal|investor|data room|pilot|contract/i.test(text) ? "medium" : "low";
  const priority = /investor|proposal|document request|data room|complaint|legal advice|refund|upcoming|meeting/i.test(text) ? "high" : "medium";
  const suggestedDestination = sourceType === "compliance_concern" || sourceType === "customer_support_issue"
    ? "support_issue"
    : isCalendar
      ? "task"
      : sourceType === "partner_update"
        ? "task"
      : /investor|data room|diligence|proof|case study/i.test(text)
        ? "evidence_pack_note"
        : "task";
  const suggestedAction = isCalendar
    ? (event.rawPayload?.startTime && new Date(event.rawPayload.startTime).getTime() > Date.now()
      ? "Prepare agenda, desired decision, and follow-up owner before the meeting."
      : "Capture notes, decision, and follow-up task from the meeting.")
    : sourceType === "compliance_concern"
      ? "Route for human review before any external response."
      : /proposal/i.test(text)
        ? "Create a proposal follow-up task and confirm the decision date."
        : /document|data room/i.test(text)
          ? "Capture the document request and add it to evidence/data room work."
          : "Review and convert this Google Workspace signal into owned work.";
  return {
    sourceType,
    riskLevel,
    priority,
    suggestedDestination,
    suggestedAction
  };
}

function inboxItemForEvent(event = {}, classification = {}, now = nowIso()) {
  const safeRef = safeSourceHash(event);
  return {
    id: `growth-inbox-google-${safeRef}-${crypto.randomUUID().slice(0, 6)}`,
    rawText: "Google Workspace read-only signal. Open Google directly for source context.",
    sourceType: classification.sourceType,
    priority: classification.priority,
    relatedPartner: event.relatedEntityType === "partner" ? event.relatedEntityId : "",
    relatedCampaign: event.relatedEntityType === "campaign" ? event.relatedEntityId : "",
    relatedPilot: event.relatedEntityType === "pilot" ? event.relatedEntityId : "",
    riskLevel: classification.riskLevel,
    suggestedAction: classification.suggestedAction,
    suggestedDestination: classification.suggestedDestination,
    summary: event.source === "calendar" ? "Calendar signal captured for internal review." : "Gmail signal captured for internal review.",
    status: "new",
    sourceEventId: safeRef,
    sourceEventIdHash: safeRef,
    sourceConnector: event.source === "calendar" ? "google_calendar" : "gmail",
    createdAt: now,
    updatedAt: now,
    history: [{ action: "created", at: now, note: "Created from read-only Google Workspace sync. Draft/internal only." }]
  };
}

function taskForEvent(event = {}, classification = {}, now = nowIso()) {
  const safeRef = safeSourceHash(event);
  const title = event.source === "calendar"
    ? `${event.rawPayload?.startTime && new Date(event.rawPayload.startTime).getTime() > Date.now() ? "Prepare for" : "Follow up from"} Google Calendar meeting`
    : /proposal/i.test([event.title, event.summary].join(" "))
      ? "Follow up on Google proposal signal"
      : /document|data room/i.test([event.title, event.summary].join(" "))
        ? "Handle Google document request signal"
        : "Review Google Workspace signal";
  const dueDate = event.source === "calendar" && event.rawPayload?.startTime
    ? String(event.rawPayload.startTime).slice(0, 10)
    : classification.riskLevel === "high"
      ? todayIso(now)
      : addDaysIso(now, 1);
  return {
    id: `task-google-workspace-${safeRef}-${crypto.randomUUID().slice(0, 6)}`,
    title,
    description: "Read-only Google Workspace signal needs review. Open Google directly for source context.",
    owner: "Roger",
    status: "open",
    priority: classification.priority === "high" ? "high" : "medium",
    dueDate,
    sourceType: event.source === "calendar" ? "google_calendar" : "gmail",
    sourceId: safeRef,
    sourceIdHash: safeRef,
    partnerId: event.relatedEntityType === "partner" ? event.relatedEntityId : "",
    campaignId: event.relatedEntityType === "campaign" ? event.relatedEntityId : "",
    pilotId: event.relatedEntityType === "pilot" ? event.relatedEntityId : "",
    riskLevel: classification.riskLevel,
    nextAction: classification.suggestedAction,
    escalationReason: event.source === "calendar" ? "Read-only Calendar signal needs prep or follow-up." : "Read-only Gmail signal needs follow-up.",
    escalationKey: event.source === "calendar"
      ? `google-workspace:meeting-prep:${safeRef}`
      : /proposal/i.test([event.title, event.summary].join(" "))
        ? `google-workspace:proposal-follow-up:${safeRef}`
        : `google-workspace:signal-review:${safeRef}`,
    history: [{ action: "created", at: now, note: "Created from read-only Google Workspace sync. No email or calendar changes were made." }],
    createdAt: now,
    updatedAt: now
  };
}

function evidenceNoteForEvent(event = {}, classification = {}, now = nowIso()) {
  const text = [event.title, event.summary].join(" ");
  if (!/investor|data room|diligence|proof|case study|partner|pilot|proposal|acquirer/i.test(text)) return null;
  const safeRef = safeSourceHash(event);
  return {
    id: `evidence-note-google-${safeRef}-${crypto.randomUUID().slice(0, 6)}`,
    title: event.source === "calendar" ? "Google Calendar signal" : "Gmail signal",
    summary: "Read-only Google Workspace signal may support evidence or proof work. Open Google directly for source context.",
    sourceType: event.source === "calendar" ? "google_calendar" : "gmail",
    sourceId: safeRef,
    sourceIdHash: safeRef,
    status: "draft",
    priority: classification.priority,
    riskLevel: classification.riskLevel,
    relatedPartnerId: event.relatedEntityType === "partner" ? event.relatedEntityId : "",
    relatedCampaignId: event.relatedEntityType === "campaign" ? event.relatedEntityId : "",
    nextBestAction: "Review before including in Weekly Evidence Pack.",
    createdAt: now,
    updatedAt: now
  };
}

export function googleWorkspaceDraftOutputs(events = [], options = {}) {
  const now = options.now || nowIso();
  const growthInbox = [];
  const tasks = [];
  const evidencePackNotes = [];
  const accessEvents = [];
  const activityEvents = [];
  for (const event of list(events).filter((item) => ["gmail", "calendar"].includes(item.source))) {
    const classification = classifyGoogleWorkspaceSignal(event);
    const safeRef = safeSourceHash(event);
    growthInbox.push(inboxItemForEvent(event, classification, now));
    if (classification.suggestedDestination === "task" || classification.priority === "high") {
      tasks.push(taskForEvent(event, classification, now));
    }
    const note = evidenceNoteForEvent(event, classification, now);
    if (note) evidencePackNotes.push(note);
    accessEvents.push({
      id: `event-google-workspace-${safeRef}-${crypto.randomUUID().slice(0, 6)}`,
      eventType: "google_workspace_signal_captured",
      timestamp: now,
      actor: "google_workspace_readonly_sync",
      source: "google_workspace",
      objectType: event.source === "calendar" ? "calendar_event" : "gmail_message",
      objectId: safeRef,
      riskLevel: classification.riskLevel,
      proofValue: note ? "medium" : "low",
      revenueImpact: "",
      nextAction: classification.suggestedAction,
      metadata: {
        connector: event.source,
        suggestedDestination: classification.suggestedDestination,
        internalOnly: true,
        noOutboundAction: true
      },
      createdAt: now
    });
    activityEvents.push({
      id: `activity-google-workspace-${safeRef}-${crypto.randomUUID().slice(0, 6)}`,
      eventType: "Google Workspace signal captured",
      title: event.source === "calendar" ? "Google Calendar signal captured" : "Gmail signal captured",
      relatedObjectType: event.source,
      relatedObjectId: safeRef,
      createdAt: now
    });
  }
  return { growthInbox, tasks, evidencePackNotes, events: accessEvents, activityEvents };
}

export function mergeGoogleWorkspaceOutputs(state = {}, outputs = {}) {
  const hasKey = (items, key) => new Set(list(items).map((item) => item.escalationKey || item.sourceEventId || item.sourceId || item.id)).has(key);
  const taskKeys = new Set(list(state.tasks).map((item) => item.escalationKey));
  const inboxKeys = new Set(list(state.growthInbox).map((item) => item.sourceEventId));
  const noteKeys = new Set(list(state.evidencePackNotes).map((item) => item.sourceId));
  return {
    ...state,
    growthInbox: [
      ...list(outputs.growthInbox).filter((item) => !inboxKeys.has(item.sourceEventId)),
      ...list(state.growthInbox)
    ].slice(0, 1000),
    tasks: [
      ...list(outputs.tasks).filter((item) => !taskKeys.has(item.escalationKey)),
      ...list(state.tasks)
    ].slice(0, 1000),
    evidencePackNotes: [
      ...list(outputs.evidencePackNotes).filter((item) => !noteKeys.has(item.sourceId)),
      ...list(state.evidencePackNotes)
    ].slice(0, 500),
    events: [
      ...list(outputs.events).filter((item) => !hasKey(state.events, item.objectId)),
      ...list(state.events)
    ].slice(0, 1000),
    activityEvents: [
      ...list(outputs.activityEvents),
      ...list(state.activityEvents)
    ].slice(0, 500)
  };
}

export function googleConnectionStatusFromDiagnostics(diagnostics = {}) {
  const hasAccess = Boolean(diagnostics.hasAccessToken);
  const hasRefresh = Boolean(diagnostics.hasRefreshToken);
  const accountMarkedConnected = Boolean(diagnostics.connected);
  if (accountMarkedConnected && hasAccess) {
    return { connected: true, status: "connected", needsRefresh: false, needsReconnectReason: "" };
  }
  if (accountMarkedConnected && !hasAccess && hasRefresh) {
    return {
      connected: false,
      status: "needs_refresh",
      needsRefresh: true,
      needsReconnectReason: "Google reconnect required: token missing or expired."
    };
  }
  return {
    connected: false,
    status: "disconnected",
    needsRefresh: false,
    needsReconnectReason: accountMarkedConnected ? "Google reconnect required: token missing or expired." : "Google is not connected."
  };
}

export function googleWorkspaceDiagnostics({ env = process.env, account = {}, connectorStatus = [] } = {}) {
  const gmail = list(connectorStatus).find((item) => item.connector === "gmail") || {};
  const calendar = list(connectorStatus).find((item) => item.connector === "calendar") || {};
  const redirectUri = googleWorkspaceRedirectUri(env);
  let parsedRedirect = null;
  try { parsedRedirect = redirectUri ? new URL(redirectUri) : null; } catch { parsedRedirect = null; }
  const scopes = list(account.scopes);
  const hasAccess = Boolean(account.accessTokenEncrypted || account.accessTokenPresent);
  const hasRefresh = Boolean(account.refreshTokenEncrypted || account.refreshTokenPresent);
  const expiresAtPresent = Boolean(account.tokenExpiresAt);
  const connected = account.status === "connected" || Boolean(account.connectedAt || account.accountName);
  const needsReconnect = !connected
    ? "Google is not connected."
    : !hasAccess && !hasRefresh
      ? "Google reconnect required: token missing or expired."
      : "";
  return {
    oauthConfigured: googleWorkspaceOAuthConfigured(env),
    missingEnvVars: googleWorkspaceMissingEnv(env),
    clientIdPresent: Boolean(env.GOOGLE_CLIENT_ID),
    clientSecretPresent: Boolean(env.GOOGLE_CLIENT_SECRET),
    redirectUri,
    tokenEncryptionConfigured: Boolean(env.OAUTH_TOKEN_ENCRYPTION_KEY),
    connected,
    accountName: account.accountName || "",
    hasStoredToken: Boolean(hasAccess || hasRefresh),
    scopes: scopes.filter((scope) => /readonly|openid|email|profile/i.test(scope)),
    gmailConfigured: Boolean(gmail.configured),
    calendarConfigured: Boolean(calendar.configured),
    gmailLastSyncAt: gmail.lastSyncAt || "",
    calendarLastSyncAt: calendar.lastSyncAt || "",
    lastError: account.lastErrorSummary || account.lastError || gmail.lastError || calendar.lastError || "",
    noOutboundScopes: true,
    readOnlyOnly: true,
    googleClientIdConfigured: Boolean(env.GOOGLE_CLIENT_ID),
    googleClientSecretConfigured: Boolean(env.GOOGLE_CLIENT_SECRET),
    googleRedirectUriConfigured: Boolean(redirectUri),
    googleRedirectUriHost: parsedRedirect?.host || "",
    googleRedirectUriPath: parsedRedirect?.pathname || "",
    requestedScopes: googleRequiredReadOnlyScopes,
    gmailReadonlyGranted: scopes.includes("https://www.googleapis.com/auth/gmail.readonly") || Boolean(gmail.configured),
    calendarReadonlyGranted: scopes.includes("https://www.googleapis.com/auth/calendar.readonly") || Boolean(calendar.configured),
    googleTokenRecordPresent: Boolean(account.platform || account.connectedAt || account.status),
    googleAccessTokenPresent: hasAccess,
    googleRefreshTokenPresent: hasRefresh,
    googleTokenExpiresAtPresent: expiresAtPresent,
    googleNeedsReconnectReason: needsReconnect,
    googleConnectedComputedReason: connected ? (hasAccess || hasRefresh ? "Stored encrypted Google token record is connected." : "Google account is marked connected but token read-back needs review.") : "No connected Google account.",
    emailSendingEnabled: false,
    calendarWritesEnabled: false,
    connectRouteExists: true,
    callbackRouteExists: true,
    statusRouteExists: true,
    scanRouteExists: true
  };
}
