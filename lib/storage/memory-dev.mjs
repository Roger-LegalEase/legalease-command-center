export function createMemoryDevStorage({ env = process.env } = {}) {
  const productionLike = env.NODE_ENV === "production" || env.RENDER === "true" || env.LEGALEASE_ENV === "production";
  if (productionLike) {
    throw new Error("Development memory storage is blocked in production. Set DATABASE_URL for durable writes.");
  }

  const records = new Map();
  const keyFor = (entityType, id) => `${entityType}:${id}`;

  return {
    kind: "memory-dev",
    durable: false,
    async writeRecord(entityType, record = {}) {
      if (!entityType) throw new Error("entityType is required.");
      if (!record.id) throw new Error("record.id is required.");
      const now = new Date().toISOString();
      const next = { ...record, updated_at: record.updated_at || now, created_at: record.created_at || now };
      records.set(keyFor(entityType, record.id), next);
      return next;
    },
    async readRecord(entityType, id) {
      return records.get(keyFor(entityType, id)) || null;
    },
    async listRecords(entityType) {
      return [...records.entries()]
        .filter(([key]) => key.startsWith(`${entityType}:`))
        .map(([, value]) => value);
    },
    async close() {}
  };
}
