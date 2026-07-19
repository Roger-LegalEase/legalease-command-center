# CCX-603 secure File upload

Uploads create a new authoritative `dataRoomItems` record only after validated
bytes are stored successfully. Hosted mode writes to a private Supabase Storage
bucket; local/demo mode writes beneath one dedicated private root. Neither mode
returns a public URL. File names, MIME types, sizes, object paths, authorization,
idempotency, scoped persistence, activity, and audit evidence are enforced
server-side.

A metadata-write failure removes the just-stored object and creates no File
record. Replacement creates an explicit new version linked to the previous
source identity. It never overwrites history or infers that a draft is current.
