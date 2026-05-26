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

export function googleWorkspaceRedirectUri(env = process.env) {
  const explicit = env.GOOGLE_REDIRECT_URI || env.GOOGLE_OAUTH_REDIRECT_URI || "";
  if (explicit) return explicit;
  const base = String(env.APP_BASE_URL || env.PUBLIC_APP_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/api/oauth/google_workspace/callback` : "";
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
  return {
    id: `growth-inbox-google-${slug(event.sourceEventId || event.id)}-${crypto.randomUUID().slice(0, 6)}`,
    rawText: [event.title, event.summary].filter(Boolean).join("\n\n"),
    sourceType: classification.sourceType,
    priority: classification.priority,
    relatedPartner: event.relatedEntityType === "partner" ? event.relatedEntityId : "",
    relatedCampaign: event.relatedEntityType === "campaign" ? event.relatedEntityId : "",
    relatedPilot: event.relatedEntityType === "pilot" ? event.relatedEntityId : "",
    riskLevel: classification.riskLevel,
    suggestedAction: classification.suggestedAction,
    suggestedDestination: classification.suggestedDestination,
    summary: event.summary || event.title || "Google Workspace signal",
    status: "new",
    sourceEventId: event.sourceEventId || event.id || "",
    sourceConnector: event.source === "calendar" ? "google_calendar" : "gmail",
    createdAt: now,
    updatedAt: now,
    history: [{ action: "created", at: now, note: "Created from read-only Google Workspace sync. Draft/internal only." }]
  };
}

function taskForEvent(event = {}, classification = {}, now = nowIso()) {
  const title = event.source === "calendar"
    ? `${event.rawPayload?.startTime && new Date(event.rawPayload.startTime).getTime() > Date.now() ? "Prepare for" : "Follow up from"} meeting: ${event.title || "Google Calendar event"}`
    : /proposal/i.test([event.title, event.summary].join(" "))
      ? `Follow up on proposal: ${event.title || "Gmail signal"}`
      : /document|data room/i.test([event.title, event.summary].join(" "))
        ? `Handle document request: ${event.title || "Gmail signal"}`
        : `Review Google Workspace signal: ${event.title || "signal"}`;
  const dueDate = event.source === "calendar" && event.rawPayload?.startTime
    ? String(event.rawPayload.startTime).slice(0, 10)
    : classification.riskLevel === "high"
      ? todayIso(now)
      : addDaysIso(now, 1);
  return {
    id: `task-google-workspace-${slug(event.sourceEventId || event.id)}-${crypto.randomUUID().slice(0, 6)}`,
    title,
    description: event.summary || "Read-only Google Workspace signal needs review.",
    owner: "Roger",
    status: "open",
    priority: classification.priority === "high" ? "high" : "medium",
    dueDate,
    sourceType: event.source === "calendar" ? "google_calendar" : "gmail",
    sourceId: event.sourceEventId || event.id || "",
    partnerId: event.relatedEntityType === "partner" ? event.relatedEntityId : "",
    campaignId: event.relatedEntityType === "campaign" ? event.relatedEntityId : "",
    pilotId: event.relatedEntityType === "pilot" ? event.relatedEntityId : "",
    riskLevel: classification.riskLevel,
    nextAction: classification.suggestedAction,
    escalationReason: event.source === "calendar" ? "Read-only Calendar signal needs prep or follow-up." : "Read-only Gmail signal needs follow-up.",
    escalationKey: event.source === "calendar"
      ? `google-workspace:meeting-prep:${event.sourceEventId || event.id}`
      : /proposal/i.test([event.title, event.summary].join(" "))
        ? `google-workspace:proposal-follow-up:${event.sourceEventId || event.id}`
        : `google-workspace:signal-review:${event.sourceEventId || event.id}`,
    history: [{ action: "created", at: now, note: "Created from read-only Google Workspace sync. No email or calendar changes were made." }],
    createdAt: now,
    updatedAt: now
  };
}

function evidenceNoteForEvent(event = {}, classification = {}, now = nowIso()) {
  const text = [event.title, event.summary].join(" ");
  if (!/investor|data room|diligence|proof|case study|partner|pilot|proposal|acquirer/i.test(text)) return null;
  return {
    id: `evidence-note-google-${slug(event.sourceEventId || event.id)}-${crypto.randomUUID().slice(0, 6)}`,
    title: event.source === "calendar" ? `Google Calendar signal: ${event.title || "meeting"}` : `Gmail signal: ${event.title || "email"}`,
    summary: event.summary || "",
    sourceType: event.source === "calendar" ? "google_calendar" : "gmail",
    sourceId: event.sourceEventId || event.id || "",
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
    growthInbox.push(inboxItemForEvent(event, classification, now));
    if (classification.suggestedDestination === "task" || classification.priority === "high") {
      tasks.push(taskForEvent(event, classification, now));
    }
    const note = evidenceNoteForEvent(event, classification, now);
    if (note) evidencePackNotes.push(note);
    accessEvents.push({
      id: `event-google-workspace-${slug(event.sourceEventId || event.id)}-${crypto.randomUUID().slice(0, 6)}`,
      eventType: "google_workspace_signal_captured",
      timestamp: now,
      actor: "google_workspace_readonly_sync",
      source: "google_workspace",
      objectType: event.source === "calendar" ? "calendar_event" : "gmail_message",
      objectId: event.sourceEventId || event.id || "",
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
      id: `activity-google-workspace-${slug(event.sourceEventId || event.id)}-${crypto.randomUUID().slice(0, 6)}`,
      eventType: "Google Workspace signal captured",
      title: event.title || "Google Workspace signal",
      relatedObjectType: event.source,
      relatedObjectId: event.sourceEventId || event.id || "",
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

export function googleWorkspaceDiagnostics({ env = process.env, account = {}, connectorStatus = [] } = {}) {
  const gmail = list(connectorStatus).find((item) => item.connector === "gmail") || {};
  const calendar = list(connectorStatus).find((item) => item.connector === "calendar") || {};
  return {
    oauthConfigured: googleWorkspaceOAuthConfigured(env),
    missingEnvVars: googleWorkspaceMissingEnv(env),
    clientIdPresent: Boolean(env.GOOGLE_CLIENT_ID),
    clientSecretPresent: Boolean(env.GOOGLE_CLIENT_SECRET),
    redirectUri: googleWorkspaceRedirectUri(env),
    tokenEncryptionConfigured: Boolean(env.OAUTH_TOKEN_ENCRYPTION_KEY),
    connected: account.status === "connected" || Boolean(account.connectedAt || account.accountName),
    accountName: account.accountName || "",
    hasStoredToken: Boolean(account.accessTokenEncrypted || account.refreshTokenEncrypted),
    scopes: list(account.scopes).filter((scope) => /readonly|openid|email|profile/i.test(scope)),
    gmailConfigured: Boolean(gmail.configured),
    calendarConfigured: Boolean(calendar.configured),
    gmailLastSyncAt: gmail.lastSyncAt || "",
    calendarLastSyncAt: calendar.lastSyncAt || "",
    lastError: account.lastErrorSummary || account.lastError || gmail.lastError || calendar.lastError || "",
    noOutboundScopes: true,
    readOnlyOnly: true
  };
}
