# CCX-004 shared UI primitives

Source main SHA: `20626283560410f14b75b3994eaa76d72713e8c6`

CCX-004 establishes a small, dependency-light rendering layer for later Command
Center vNext pages. It is a behavior-preserving extraction, not a component
framework or visual redesign. The existing shell, browser event system, routes,
labels, CSS, data fetching, mutations, authorization, safety controls, sending,
publishing, and storage behavior remain unchanged.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `scripts/ui/html.mjs` | Text and attribute escaping plus an explicit data-attribute allowlist. |
| `scripts/ui/links.mjs` | Canonical source-link normalization, exact record deep links, safe link details, and anchor rendering. |
| `scripts/ui/feedback.mjs` | Immutable action-status and confirmation contracts plus status-message rendering. |
| `scripts/ui/primitives.mjs` | Buttons, status chips, page states, page headers, tabs, filters, and the record-drawer shell. |

All four modules are side-effect-free ESM. They accept explicit values and return
HTML strings or frozen plain-data contracts. They do not read environment variables,
browser state, application state, storage, the filesystem, the network, databases,
or business engines. They do not fetch records or perform mutations.

## Primitive contracts

### HTML escaping

- `escapeHtml(value)` converts null-like input to an empty string and encodes
  ampersands, angle brackets, double quotes, and apostrophes.
- `escapeAttribute(value)` applies HTML escaping and also encodes control characters
  and backticks for quoted attribute contexts.
- `renderDataAttributes(values)` renders only `action`, `id`, `route`, `state`,
  `target`, and `testid` as `data-*` attributes. All other keys are ignored.
- There is no raw-HTML escape hatch. A primitive body, title, label, explanation,
  icon, status, or option label is text unless a future reviewed contract explicitly
  introduces structured child primitives.

Unicode remains unchanged. Values such as `<script>`, quotes, apostrophes, and
event-handler-looking text render as visible text rather than markup.

### Safe links

`normalizeSourceLink(input)` is the existing Company Memory source-link policy,
relocated without behavioral changes:

- a page link is one alphanumeric/hyphen hash identifier;
- an external link must start with HTTPS and contain no whitespace;
- HTTP, `javascript:`, `data:`, free text, and multi-segment page targets are refused.

`company-memory.mjs` re-exports that exact function, so existing imports and queue
projection behavior remain compatible. This is one canonical policy, not a second
competing validator.

Exact object links use `normalizeRecordDeepLink({ collection, itemId })`. The
collection is restricted to letters, numbers, underscores, and hyphens, and the item
identifier is URI-encoded into `#item/<collection>/<id>`. This matches the existing
`sourceRef` deep-link boundary without loosening `normalizeSourceLink`.

`renderSafeLink(...)`:

- refuses missing labels and invalid link contracts;
- escapes the accessible name, visible label, icon text, class, and `href`;
- opens external links in a new tab by default;
- adds `rel="noopener noreferrer"` whenever it opens an external link in a new tab;
- never accepts arbitrary attributes or inline JavaScript.

The primitive does not replace domain-specific URL validation. Provider endpoints,
asset URLs, OAuth URLs, and download paths keep their existing canonical validators.

### Button

`renderButton(options)` supports:

- `button` and safe `link` variants;
- `primary`, `secondary`, `quiet`, and `destructive` intent;
- visible and accessible text;
- optional escaped icon text;
- `button`, `submit`, and `reset` form types;
- disabled and loading states;
- an explicit `workingLabel` for visible in-progress feedback;
- the shared data-attribute allowlist.

An ordinary `type="button"` without an explicit action is disabled. An invalid safe
link renders nothing. Loading controls are disabled, expose `aria-busy="true"`, and
use the caller-supplied working label. The renderer never accepts raw attributes or
creates `onclick` handlers.

The new button classes are neutral structural hooks only. CCX-004 does not add CSS
or change the appearance of an existing button.

### Status chip

`renderStatusChip(...)` accepts these semantic states:

- neutral
- informational
- selected
- success
- warning
- danger
- needs attention

Every chip includes visible text and `role="status"`; meaning never depends on color
alone. Unknown states fail to neutral. Final brand and semantic colors belong to
CCX-006.

### Empty, loading, and error states

- `renderEmptyState(...)` uses a polite status region, a required clear title, an
  optional explanation, and an optional safe primary action.
- `renderLoadingState(...)` uses a polite busy status region and requires explicit
  loading copy.
- `renderErrorState(...)` uses an assertive alert region and may include the existing
  retry action as a safe button contract.

These renderers do not invent records, counts, success claims, or retry behavior.
They describe a state only; the owning page remains responsible for its actual
error boundary and action handler.

### Action status and toast content

`createActionStatus(...)` returns a frozen contract for informational, working,
success, or error feedback. `renderActionStatus(...)` renders that content with
polite status or assertive error semantics.

This is not a second notification system. The current `toast(...)` function,
capture-phase busy treatment, duplicate-click prevention, request tracking, and
success/error behavior remain unchanged. Later pages may use the pure content
contract inside that existing delivery mechanism.

### Confirmation

`createConfirmationContract(...)` returns a frozen description of:

- the action;
- the confirmation title;
- the consequence;
- whether the action is destructive;
- distinct approval and dismissal values.

`confirmationWasApproved(...)` returns true only for the exact approval value.
Dismissal, cancellation, missing input, booleans, and other truthy values are not
approval. The contract does not render a modal and does not replace `window.confirm`
or current dialog behavior in this packet.

### Page header

`renderPageHeader(...)` uses a semantic header and one `h1`. Eyebrow copy,
description, and a safe primary action are optional. All content is escaped.

### Tabs

`renderTabs(...)` requires an accessible group label and safe link contract for each
tab. It renders native links in a tab list, exposes `aria-selected`, and marks the
active link with `aria-current="page"`. Native link keyboard behavior and exact hash
deep links remain intact. Invalid links are omitted.

### Filters

`renderFilters(...)` requires an accessible form label. Each search, text, or select
control requires a safe identifier and a visible `<label>`. Values and option labels
are escaped. The primitive owns no filtering state, URL mutation, data fetch, or
record mutation.

### Record drawer shell

`renderRecordDrawer(...)` provides:

- a stable region identifier;
- accessible dialog semantics and labelled title;
- optional subtitle and status chip;
- an explicit close action and accessible close label;
- optional tab region;
- an escaped text body slot;
- safe action contracts in a footer.

It uses `aria-modal="false"` because it is only a structural shell and does not own
focus trapping, backdrop behavior, history, or application state. A caller must not
claim modal behavior until those interactions are implemented and browser-tested.

## Bounded adoption

Two pure seams were adopted:

1. The source-link validator moved from `company-memory.mjs` to
   `scripts/ui/links.mjs`. Company Memory imports and re-exports the same function,
   and its queue-item normalization output is fixture-tested against the previous
   implementation.
2. The owner-login helper message in `sendAuthRequired(...)` now uses
   `escapeHtml(...)` instead of an identical inline replacement expression. A stable
   equivalence fixture covers empty text, HTML-like text, ampersands, apostrophes,
   Unicode, and ordinary connection messages.

The complete `htmlShell()` source is fixture-hashed in the focused test. Its CCX-003
flag-off shell region remains byte-for-byte unchanged.

## Deferred adoption

The following existing renderers stay in `preview-server.mjs`:

- the browser `esc(...)` helper and safe-boot escape helper;
- `ckOpenControlHtml(...)` and exact `sourceRef` routing;
- the global toast and universal click-feedback system;
- all current `window.confirm(...)` and dialog flows;
- current status badges and chips;
- page headers, tabs, content filters, empty/loading/error markup, and drawer cards;
- all complex Social, Outreach, Partners, Files, Inbox, Today, and Settings renderers.

Those helpers execute inside the large inline browser script. Server-side ESM cannot
be wired into that script without changing emitted code or introducing a client
module/runtime boundary. CCX-004 therefore leaves those call sites alone. Later
packets may adopt the primitives behind the vNext shell with browser-level tests.

## Accessibility expectations

- Every interactive control has visible text and an accessible name.
- Loading controls expose busy and disabled state.
- Errors use alert semantics; non-error progress uses status semantics.
- Active tabs expose both selected and current-page state.
- Filters have programmatic and visible labels.
- External new-tab links announce the same accessible label and are isolated with
  `noopener noreferrer`.
- The record drawer has a programmatically associated title and close control.
- Status meaning is visible in text, not conveyed only by color.

These contracts supplement, but do not replace, the browser accessibility harness
planned for CCX-005.

## Examples

```js
renderButton({
  label: "Save",
  workingLabel: "Working…",
  intent: "primary",
  action: "save-file",
  loading: false,
  dataAttributes: { id: "file-17" }
});
```

```js
renderSafeLink({
  label: "Open result",
  link: { kind: "external", target: "https://example.com/result" }
});
```

```js
renderErrorState({
  title: "Files could not load",
  explanation: "Check the connection and try again.",
  primaryAction: { label: "Retry", action: "retry-files" }
});
```

## Prohibited usage

Do not:

- concatenate unescaped values into HTML or quoted attributes;
- pass pre-rendered user HTML into a text slot;
- add a `rawHtml`, `attributes`, or `onclick` escape hatch;
- accept `javascript:`, `data:`, insecure HTTP, malformed hash, or unvalidated
  provider links;
- use a button without a form purpose or explicit action;
- treat confirmation dismissal as approval;
- let a primitive fetch, mutate, authorize, send, publish, or persist;
- read `process.env`, cookies, browser storage, or global application state from a
  primitive;
- hard-code new product vocabulary that conflicts with `scripts/ui/labels.mjs`;
- create final visual tokens, colors, spacing, or layout in this packet.

## Adding a primitive safely

1. Confirm an existing primitive cannot express the structure.
2. Keep the module pure and accept all inputs explicitly.
3. Escape every user-controlled value by default.
4. Prefer structured child contracts to raw markup slots.
5. Reuse the canonical link and attribute policies.
6. Add accessible names, state, and semantic structure.
7. Refuse invalid action or link input rather than guessing.
8. Add hostile-input and representative-output coverage to
   `scripts/test-vnext-ui-primitives.mjs`.
9. Adopt an existing call site only with an equivalence fixture.
10. Preserve the existing business, authorization, safety, and feedback owner.

Run the focused contract with:

```bash
SKIP_ENV_LOCAL_FILE=1 NODE_ENV=test COMMAND_CENTER_TEST_MODE=true npm run test:vnext-ui-primitives
```

The test is also discovered automatically by `npm run test:extended` because the
extended runner executes every `scripts/test-*.mjs` file not already in the canonical
`npm test` chain.
