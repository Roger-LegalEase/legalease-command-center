export function compactSearchText(value = "", fallback = "Untitled") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
}

export function searchRecordUpdatedAt(item = {}) {
  return item.updated_at || item.updatedAt || item.review_updated_at || item.generated_at || item.generatedAt || item.created_at || item.createdAt || item.timestamp || "";
}
