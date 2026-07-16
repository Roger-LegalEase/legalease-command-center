# CCX-001 legacy alias and deep-link map

Source SHA: `8812c2f31328cf1e8e36d36efc22bac55e1f0498`

The 53 aliases below are copied from the live `routeAliases` object. CCX-001 does not
delete, redirect, retarget, or otherwise wire any alias. “Intended vNext target” is a
planning destination from the master plan, not current runtime behavior.

## Current hash aliases

| Legacy alias | Current canonical target | Intended vNext target | Parameters/object context to preserve | Deprecation condition |
| --- | --- | --- | --- | --- |
| `#overview` | `#today` | `#today` | None | Remove only after compatibility telemetry and an additional alias release |
| `#cockpit` | `#today` | `#today` | None; empty-root default also passes through cockpit | Same as above |
| `#command` | `#growth` | `#social` | Preserve the selected source object when introduced | Social parity plus compatibility coverage |
| `#le-e` | `#lee` | Global Le-E utility | Preserve assistant/thread context where present | Only after all callers use the canonical global control |
| `#partner` | `#partners` | `#partners` | Preserve Partner ID when a future link provides one | Partner detail-route parity |
| `#partner-hub` | `#partners` | `#partners` | Preserve Partner/program context | Partner home and program parity |
| `#metrics` | `#proof` | `#files?collection=investor-room` | Preserve metric/report source context | Files/Investor Room metrics parity |
| `#kpis` | `#proof` | `#files?collection=investor-room` | Preserve metric/report source context | Files/Investor Room metrics parity |
| `#marketing` | `#growth` | `#social` | Preserve active content record/filter where known | Social parity |
| `#social` | `#growth` | `#social` | Preserve active post/filter where known | Canonical vNext Social route is live and covered |
| `#social-media` | `#growth` | `#social` | Preserve active post/filter where known | Social parity plus alias coverage |
| `#content-calendar` | `#growth` | `#social?view=calendar` | Preserve selected date/post when available | Social Calendar parity |
| `#posts` | `#growth` | `#social?view=library` | Preserve post ID/filter when available | Social Library parity |
| `#rcap` | `#production-activation-rcap` | `#partners` with RCAP program context | Preserve program, review state, and artifact context | Partner program parity with approval coverage |
| `#app-status` | `#os-health` | `#settings` health detail | Preserve diagnostic/recovery context | Settings health parity |
| `#health` | `#os-health` | `#settings` health detail | Preserve diagnostic/recovery context | Settings health parity |
| `#recovery` | `#safe-mode` | Advanced recovery utility | Preserve recovery reason without requiring full state | Safe recovery parity and no-white-screen coverage |
| `#guide` | `#operator-manual` | Settings/contextual Help | Preserve requested help topic when introduced | Contextual-help parity |
| `#course-manual` | `#operator-manual` | Settings/contextual Help | Preserve requested help topic when introduced | Contextual-help parity |
| `#data-check` | `#data-integrity` | `#settings` data integrity | Preserve requested diagnostic context | Settings data-integrity parity |
| `#handoff-notes` | `#handoff-contract` | Advanced/internal Partner handoff | Preserve Partner/program/artifact references | Handoff parity inside Partner workflow |
| `#privacy` | `#settings` | `#settings` privacy | None; public `/privacy` is a separate route | Settings privacy parity; public legal page remains |
| `#replies` | `#growth-inbox` | `#inbox` | Preserve signal/thread/source reference | Unified Inbox reply parity |
| `#inbox-replies` | `#growth-inbox` | `#inbox` | Preserve signal/thread/source reference | Unified Inbox reply parity |
| `#lists` | `#contacts` | `#outreach` audience/contacts | Preserve list/filter when available | Outreach audience parity |
| `#contact` | `#contacts` | `#outreach` audience/contacts | Preserve contact ID when available | Outreach contact-detail parity |
| `#people` | `#contacts` | `#outreach` audience/contacts | Preserve contact ID/filter when available | Outreach contact-detail parity |
| `#upload-list` | `#upload` | `#outreach` audience import | Preserve import/list type | Outreach import parity and suppression coverage |
| `#list-upload` | `#upload` | `#outreach` audience import | Preserve import/list type | Outreach import parity and suppression coverage |
| `#import` | `#upload` | `#outreach` audience import | Preserve import/list type | Outreach import parity and suppression coverage |
| `#import-list` | `#upload` | `#outreach` audience import | Preserve import/list type | Outreach import parity and suppression coverage |
| `#campaign` | `#campaigns` | `#outreach` | Preserve Campaign ID when available | Outreach campaign-detail parity |
| `#campaign-control` | `#campaigns` | `#outreach` | Preserve Campaign ID/status filter when available | Outreach control parity |
| `#campaigns-control` | `#campaigns` | `#outreach` | Preserve Campaign ID/status filter when available | Outreach control parity |
| `#prospect` | `#prospects` | `#outreach` audience/prospects | Preserve prospect ID and review state | Outreach prospect parity |
| `#prospects` | `#prospects` | `#outreach` audience/prospects | Preserve prospect ID and review state; current self-alias is intentional | Outreach prospect parity |
| `#rcap-prospects` | `#prospects` | `#outreach` audience/prospects | Preserve RCAP source and candidate ID | Outreach RCAP prospect parity |
| `#rcap-pipeline` | `#prospects` | `#outreach` audience/prospects | Preserve RCAP source and pipeline filter | Outreach RCAP prospect parity |
| `#money` | `#revenue` | `#outreach` results/advanced detail | Preserve source availability and date range | Outreach results parity |
| `#payments` | `#revenue` | `#outreach` results/advanced detail | Preserve source availability and date range | Outreach results parity |
| `#stripe` | `#revenue` | `#outreach` results/advanced detail | Preserve connection and source-truth context | Outreach results parity |
| `#calendar` | `#meetings` | `#partners` activity/meeting prep | Preserve meeting/event ID where available | Partner activity parity |
| `#meeting` | `#meetings` | `#partners` activity/meeting prep | Preserve meeting/event ID where available | Partner activity parity |
| `#meeting-prep` | `#meetings` | `#partners` activity/meeting prep | Preserve meeting/event ID and brief source | Partner meeting-prep parity |
| `#support-inbox` | `#support` | `#inbox` | Preserve support issue ID/status | Unified Inbox support parity |
| `#notifications` | `#alerts` | `#inbox` | Preserve alert ID/status | Unified Inbox alert parity |
| `#alert-center` | `#alerts` | `#inbox` | Preserve alert ID/status | Unified Inbox alert parity |
| `#partner-pages-review` | `#pages` | `#partners` | Preserve Partner/page/artifact ID | Partner page-review parity |
| `#page-review` | `#pages` | `#partners` | Preserve Partner/page/artifact ID | Partner page-review parity |
| `#co-branded-pages` | `#pages` | `#partners` | Preserve Partner/page/artifact ID | Partner page-review parity |
| `#system` | `#os-health` | `#settings` advanced system detail | Preserve requested diagnostic context | Settings system-health parity |
| `#linkedin` | `#production-linkedin-queue` | `#social?view=needs-review` | Preserve Post ID and LinkedIn channel context | Social review/channel parity |
| `#twitter-x` | `#production-twitter-x-queue` | `#social?view=needs-review` | Preserve Post ID and X channel context | Social review/channel parity |

## Parameterized and non-hash compatibility entry points

| Compatibility route | Current target/behavior | Intended vNext target | Context that must be preserved | Deprecation condition |
| --- | --- | --- | --- | --- |
| `#item/<collection>/<id>` | Generic `#item` artifact viewer | Typed Post, Campaign, Partner, File, task, or report detail | Sanitized collection plus the full decoded/encoded item ID | Typed detail routes have parity for every currently supported collection |
| `/sources/import-social-calendar` | Legacy shell opens `#sources` | `#social?view=calendar` import flow | Import source and any future validated query context | Social calendar import parity |
| `/api/linkedin/callback?...` | Redirects to `/#settings` with a safe result message | Settings → Social connections | Signed OAuth state, session binding, provider outcome; never tokens | vNext Settings callback coverage |
| `/api/x/callback?...` | Redirects to `/#settings` with a safe result message | Settings → Social connections | Signed OAuth state, session binding, provider outcome; never tokens | vNext Settings callback coverage |
| `/api/meta/callback?...` | Redirects to `/#settings` with a safe result message | Settings → Social connections | Signed OAuth state, session binding, provider outcome; never tokens | vNext Settings callback coverage |
| `/api/google/callback?...` | Redirects to `/#settings` with a safe result message | Settings → Google connection | Signed OAuth state, session binding, provider outcome; never tokens | vNext Settings callback coverage |

`/privacy` and `/terms` are standalone public legal pages outside the authenticated
hash renderer. They are not aliases and must not be confused with the current
`#privacy` → `#settings` hash alias.

## Implemented vNext compatibility contract

CCX-102 implements these 53 mappings from the machine registry without deleting or
retargeting any alias. In vNext mode only, a successfully resolved alias is canonicalized
with `history.replaceState`, preserving browser history without a reload. Generic item
links remain valid. Founder-facing exact links now use `#social/post/<id>`,
`#outreach/campaign/<id>`, `#partners/partner/<id>`, and
`#files/<source-kind>/<id>`; the full source mapping and rejection rules are in
`docs/ux-vnext/route-compatibility.md`.

Unknown safe hashes now show the vNext recovery screen without changing the requested
hash. Unsafe hashes fail closed and are not echoed. The legacy flag-off shell retains
its prior fallback to `#today` unchanged.
