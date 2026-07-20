# vNext persisted demo walkthrough

This walkthrough uses all five primary destinations and real local persistence. It cannot send email, publish social content, or access production data.

## Prepare

```bash
npm ci
npm run demo:vnext:load
SKIP_ENV_LOCAL_FILE=1 STORAGE_BACKEND=json COMMAND_CENTER_ALLOW_JSON=true COMMAND_CENTER_DATA_PATH=/tmp/legalease-command-center-vnext-demo.json COMMAND_CENTER_UX_VNEXT=true COMMAND_CENTER_UX_VNEXT_SOCIAL=true COMMAND_CENTER_UX_VNEXT_OUTREACH=true COMMAND_CENTER_UX_VNEXT_FILES=true npm run start
```

The loader starts from the repository’s synthetic dataset, writes a separate `/tmp` file, adds optimistic versions for scoped Social saves, and embeds exact references for Today, Social, Outreach, Partners, and Files. It refuses Supabase and requires explicit demo opt-in. Keep all live-action flags false.

## Demonstrate

| Destination | Seed object | Real workflow and reload proof |
|---|---|---|
| Today | `demo-task-fulton-kickoff` | Create a synthetic task, open it, reload, and find the same task. |
| Social | `demo-post-review` | Edit and save the draft, reload its exact link, and confirm nothing published. |
| Outreach | `demo-campaign-county-intake` | Save wizard progress after reviewing audience and suppression; do not launch. |
| Partners | `demo-partner-fulton` | Update the internal next action, reload, and follow its Outreach and Files relationships. |
| Files | `demo-dr-compliance` | Search, preview, and inspect access/readiness; a draft must not count as current. |

Use Search to find “Fulton,” Create to add the task, Inbox to inspect pending work, Investor Room from Files, and Discovery for in-product help. The exact object links—not list re-searching—are the proof path.

## Reset and rollback

Stop the local server and remove only `/tmp/legalease-command-center-vnext-demo.json` when the demo is over. If you intentionally targeted another local file, restore the backup path printed by the loader. Never sync demo data to Supabase.

Visual fallback: `docs/ux-vnext/reference/command-center-vnext-approved-direction.png`. It is an approved direction, not proof of live behavior.
