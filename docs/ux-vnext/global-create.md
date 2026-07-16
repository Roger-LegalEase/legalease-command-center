# Command Center vNext global Create

## Contract and scope

CCX-103 replaces the temporary route menu with one Global Create contract shared by
the desktop and responsive top bars. It is available only inside the server-enabled
vNext shell. The exact menu order is:

1. Social post
2. Outreach campaign
3. Partner
4. File or folder
5. Quick note

Task is intentionally absent. Task creation remains available in Today and Tasks.
Opening the menu changes no route and writes no state.

The pure UI contract, forms, capability view model, and client interaction source are
in `scripts/ui/global-create.mjs`. Server-side validation and record construction are
in `scripts/global-create-service.mjs`. The request layer in
`scripts/preview-server.mjs` owns authentication, authorization, CSRF enforcement,
serialized mutation, and scoped persistence. UI modules do not import storage,
network, authorization, provider, sending, publishing, or business-engine modules.

## Permissions

`GET /api/ui/create/capabilities` returns only each option's stable public ID, label,
enabled state, and a plain-English explanation. It does not return role tokens,
secrets, OAuth material, or internal capability identifiers. The browser uses this
view model for presentation only.

Each POST route is authorized before dispatch and rechecks its exact endpoint contract
after the body is parsed. The current mapping is:

| Workflow | Required existing capability | Restricted behavior |
| --- | --- | --- |
| Social post | Content-draft management | Disabled with a plain-English access explanation |
| Outreach campaign | Growth management | Disabled with a plain-English access explanation |
| Partner | Growth management | Disabled with a plain-English access explanation |
| File or folder | Growth management | Disabled with a plain-English access explanation |
| Quick note | Capture routing | Disabled with a plain-English access explanation |

Owner and admin fixtures can use all five workflows. The restricted operator fixture
can create a Quick note but cannot use the other four. A hidden or disabled browser
control never grants authority; the endpoint remains authoritative.

## Desktop, mobile, keyboard, and focus

Desktop and mobile use the same trigger, menu markup, option registry, form contract,
and endpoints. The orange Create trigger exposes `aria-expanded` and `aria-controls`
and supports mouse, touch, Enter, Space, and Arrow Down. The menu supports Arrow Up,
Arrow Down, Home, End, Enter, Space, Escape, outside-click dismissal, and focus return.
The responsive navigation drawer is closed before Global Create opens.
While that drawer is open, its background controls and routed content remain inert,
but the single persistent orange Create trigger stays operable. Activating it clears
the drawer overlay, inert state, and navigation scroll lock before the shared Create
menu or sheet opens; no second trigger, menu, or modal is rendered.

Selection opens one labelled modal creation workspace. Desktop presents it as a
focused side sheet; mobile uses the same sheet at full viewport width. Focus moves to
the first field and remains contained. Escape and Cancel close a pristine form and
return focus to Create. A changed form requires explicit confirmation that nothing
has been saved; dismissal never counts as approval. Only one creation layer is active.

Every form supplies labelled fields, an obvious primary action, Cancel, inline
validation, Working state, duplicate-click prevention, success/error feedback, and a
safe close path. Errors preserve entered values and show no stack, SQL, environment,
collection, or endpoint detail.

## Creation paths

| Menu item | Endpoint | Source collection | Default state | Success link |
| --- | --- | --- | --- | --- |
| Social post | `POST /api/ui/create/post` | `posts` | `Draft` when copy exists; otherwise `Idea` | `#social/post/<id>` |
| Outreach campaign | `POST /api/ui/create/campaign` | `campaigns` | `Draft`, no recipients, audience, sends, approval, or live mode | `#outreach/campaign/<id>` |
| Partner | `POST /api/ui/create/partner` | `partners` | founder stage `New`; lifecycle stage `new` | `#partners/partner/<id>` |
| File or folder | `POST /api/ui/create/file` | `dataRoomItems` | `Draft` document record; no binary upload or external sharing | `#files/data-room-item/<id>` |
| Quick note | `POST /api/ui/create/note` | `captureInbox` | internal `conversation_note` awaiting review | `#item/captureInbox/<id>` |

### Social post

The required field is Working title or idea. Draft copy/notes and a currently
supported channel preference are optional. Creation does not invoke AI, generate an
image, schedule, approve, connect an account, or publish. The new record opens through
the CCX-102 exact Post link.

### Outreach campaign

Campaign name and one of Partner outreach, Customer re-engagement, or Announcement
are required; a goal is optional. The record starts inert with empty recipients,
zero sends, no selected audience, no send time, no approval, and live mode off.
Creation does not touch `reactivationCampaign`, release a batch, or send email.

### Partner

Organization name is required. Partner type, contact name/email, geography, and first
next action are optional. Email is validated only when present. The existing partner
lifecycle normalizer preserves detailed internal fields while the founder-facing
stage starts at New. Choosing **Not selected** leaves both Partner type fields omitted;
it does not invent `nonprofit` or any other type. Explicit supported selections are
preserved unchanged. Creation does not qualify the record, send email, schedule a
meeting, create a Campaign or proposal, or activate a Partner page.

### File or folder

The current repository has a real Data Room document-record path but no persistent
folder model or general safe binary-upload flow. The chooser therefore enables Add a
document record and truthfully disables Create folder with:

> Folders are not available in the current Files system yet.

Name is required; section, validated HTTPS source link, and notes are optional. The
record explicitly states that no binary was uploaded and nothing was externally
shared. CCX-600 or a later Files packet owns persistent folder support. CCX-103 does
not create a canonical Files collection or simulate folders.

### Quick note

Note is required. The record uses `captureInbox` with the existing internal
conversation-note classification and review state. It is not routed automatically,
converted to a Task, applied to a Partner, sent, published, or expanded into a
Campaign. Its audit/activity summary never includes the note body.

## Idempotency, validation, and writes

The browser creates one validated `creationRequestId` per fresh form. The service
derives the record's stable collision-safe ID from it without exposing a separate
request-token field. A repeat of the same request returns the original record
with `alreadyExisted: true`; it does not overwrite it, append duplicate audit evidence,
or create another record. The form also locks immediately on submission, so a literal
rapid double-click produces one accepted activation and one record/evidence pair.
Authorization and validation still run on every request.

Server validation trims required values; enforces length limits, enum membership,
optional email syntax, HTTPS-only safe source links, request-ID shape, and request-size
limits; and rejects control characters and script/event-handler input. International
text and meaningful punctuation remain valid and are escaped on render.

The mutation queue reads current state once and calls the existing scoped-write helper
only for the target collection, `activityEvents`, and `auditHistory`. No endpoint
accepts an arbitrary collection or payload, returns full application state, or uses a
broad full-state write.

## Result, audit, errors, and safety

Every successful endpoint returns only:

```text
ok, objectType, id, title, canonicalHref, destination, createdAt, alreadyExisted
```

The compact result is immutable in the service contract. After success the client
refreshes the existing application state once, shows visible feedback, and follows
the CCX-102 exact record link without duplicating the record. Normal browser history
is preserved.

New records receive one safe `activityEvents` entry and one `auditHistory` entry with
actor, object type/ID, timestamp, `global_create` source, and a non-sensitive summary.
Validation and authorization failures create neither record nor success evidence.

No flow sends email, publishes social content, enrolls recipients, selects an
audience, grants approval, runs AI, changes suppression, changes a live gate, changes
authorization, or calls an external provider. All browser fixtures use temporary JSON
state with live sending and publishing disabled and outbound network blocked.

## Verification, screenshots, rollback, and Global Search

Run `npm run test:vnext-global-create` for the focused contract and `npm run
test:browser` for real Chromium coverage. The browser suite covers the menu and
keyboard contract, all five real creations and exact links, validation, dirty close,
idempotent retry, restricted access, mobile parity, accessibility, error monitoring,
and viewport overflow. Review artifacts are under
`docs/ux-vnext/screenshots/ccx-103/`.

Rollback is the existing server-only boundary: unset `COMMAND_CENTER_UX_VNEXT` or set
it to `false` and restart. The legacy flag-off `htmlShell()` remains byte-for-byte
unchanged. Existing records need no migration or cleanup.

CCX-104 Global Search now reuses these exact link contracts and safely dismisses the
Create layer before opening. Search does not move creation authority to the browser,
create a second router, or broaden a Create endpoint. CCX-105 may simplify Today
without changing either global utility.
