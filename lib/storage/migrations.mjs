export const durableEntityTypes = [
  "captures",
  "tasks",
  "priorities",
  "today_focus",
  "notes",
  "decisions",
  "blockers",
  "daily_closeouts",
  "tomorrow_plans",
  "morning_briefs",
  "what_moved",
  "activity_log",
  "app_settings",
  "social_records",
  "proof_items",
  "wins",
  "customer_notes",
  "evidence_items",
  "proof_to_social_links"
];

const collectionMap = {
  captureInbox: "captures",
  tasks: "tasks",
  priorities: "priorities",
  conversationNotes: "notes",
  dailyCloseouts: "daily_closeouts",
  morningBriefs: "morning_briefs",
  activityEvents: "activity_log",
  evidencePackNotes: "evidence_items",
  dataRoomItems: "proof_items",
  reports: "proof_items",
  posts: "social_records"
};

export function normalizeSocialRecord(input = {}) {
  const now = new Date().toISOString();
  const type = ["idea", "draft", "ready", "manually_published"].includes(input.type)
    ? input.type
    : input.status === "published" || input.status === "manually_published"
      ? "manually_published"
      : input.status === "ready"
        ? "ready"
        : input.body || input.text || input.caption
          ? "draft"
          : "idea";
  return {
    id: String(input.id || `social-${Date.now()}`),
    type,
    channel: input.channel || input.platform || "",
    title: input.title || "",
    body: input.body || input.text || input.caption || input.summary || "",
    source: input.source || input.sourceType || "manual",
    planned_date: input.planned_date || input.plannedDate || input.scheduledFor || null,
    status: input.status || type,
    created_at: input.created_at || input.createdAt || now,
    updated_at: input.updated_at || input.updatedAt || now,
    manually_published_at: input.manually_published_at || input.manuallyPublishedAt || input.posted_at || null,
    published_url: input.published_url || input.publishedUrl || ""
  };
}

export function localStateToDurableRecords(state = {}) {
  const records = [];
  for (const [collection, entityType] of Object.entries(collectionMap)) {
    const value = state[collection];
    if (!value) continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = entityType === "social_records" ? normalizeSocialRecord(item) : {
        ...item,
        id: String(item.id || item.key || `${entityType}-${records.length + 1}`)
      };
      records.push({ entityType, record });
    }
  }
  return records;
}

export function migrationSummary(records = []) {
  const byType = {};
  for (const item of records) byType[item.entityType] = (byType[item.entityType] || 0) + 1;
  return {
    records_found: records.length,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    errors: [],
    by_type: byType
  };
}
