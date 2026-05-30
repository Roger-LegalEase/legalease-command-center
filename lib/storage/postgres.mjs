export async function createPostgresStorage({ databaseUrl, pg } = {}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for production durable storage.");
  }

  const pgModule = pg || await import("pg").catch(() => null);
  const Pool = pgModule?.Pool || pgModule?.default?.Pool;
  if (!Pool) {
    throw new Error("Postgres driver is unavailable. Install the pg package before enabling DATABASE_URL storage.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /sslmode=require|render\.com|neon\.tech|supabase\./i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined
  });

  async function ensureSchema() {
    await pool.query(`
      create table if not exists os_records (
        id text not null,
        entity_type text not null,
        record jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (entity_type, id)
      );
      create table if not exists social_records (
        id text primary key,
        type text not null,
        channel text,
        title text,
        body text not null,
        source text,
        planned_date timestamptz,
        status text not null,
        manually_published_at timestamptz,
        published_url text,
        record jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
  }

  await ensureSchema();

  return {
    kind: "postgres",
    durable: true,
    async writeRecord(entityType, record = {}) {
      if (!entityType) throw new Error("entityType is required.");
      if (!record.id) throw new Error("record.id is required.");
      const now = new Date().toISOString();
      const payload = { ...record, created_at: record.created_at || now, updated_at: record.updated_at || now };
      if (entityType === "social_records") {
        await pool.query(
          `insert into social_records (id, type, channel, title, body, source, planned_date, status, manually_published_at, published_url, record, created_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           on conflict (id) do update set
             type=excluded.type, channel=excluded.channel, title=excluded.title, body=excluded.body, source=excluded.source,
             planned_date=excluded.planned_date, status=excluded.status, manually_published_at=excluded.manually_published_at,
             published_url=excluded.published_url, record=excluded.record, updated_at=excluded.updated_at`,
          [payload.id, payload.type, payload.channel || null, payload.title || null, payload.body || "", payload.source || null, payload.planned_date || null, payload.status || payload.type, payload.manually_published_at || null, payload.published_url || null, payload, payload.created_at, payload.updated_at]
        );
      }
      await pool.query(
        `insert into os_records (id, entity_type, record, created_at, updated_at)
         values ($1,$2,$3,$4,$5)
         on conflict (entity_type, id) do update set record=excluded.record, updated_at=excluded.updated_at`,
        [payload.id, entityType, payload, payload.created_at, payload.updated_at]
      );
      return payload;
    },
    async readRecord(entityType, id) {
      const result = await pool.query("select record from os_records where entity_type=$1 and id=$2", [entityType, id]);
      return result.rows[0]?.record || null;
    },
    async listRecords(entityType) {
      const result = await pool.query("select record from os_records where entity_type=$1 order by updated_at desc", [entityType]);
      return result.rows.map((row) => row.record);
    },
    async close() {
      await pool.end();
    }
  };
}
