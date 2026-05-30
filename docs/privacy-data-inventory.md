# Privacy Data Inventory

Inputs and records:

- Quick captures
- tasks
- notes
- decisions
- blockers
- Morning Brief and Daily Closeout records
- Social ideas, drafts, planned posts, ready posts, manually published records, and manually entered published URLs
- Proof, wins, customer notes, evidence items, and proof-to-social links
- owner/account identifiers from owner-token auth
- activity logs

Providers:

- Hosting: Render when deployed there.
- Database: Postgres provider selected through `DATABASE_URL` such as Neon, Supabase, or Render Postgres.
- OpenAI: only if `OPENAI_API_KEY` is configured and server-side features use it.
- Email providers: not active.
- Social providers: not active for live publishing.
- Calendar providers: not active for writes.
- Payment providers: not active.

Retention:

- Internal records are retained until Roger deletes or migrates them.
- Generated exports and local backups are convenience artifacts, not the source of truth.

Notes:

- The app is currently owner-access only.
- Social publishing is off. The OS stores manual planning and tracking records, but does not publish to social platforms.
