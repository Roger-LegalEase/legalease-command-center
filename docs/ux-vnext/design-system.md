# LegalEase vNext design system

## Intent and scope

The LegalEase vNext design system is a shared visual contract for a calm, credible,
commercial application: deep navy framing, a clean light workspace, soft teal
selection, and restrained LegalEase orange. It codifies the approved direction before
the production five-destination shell is built. CCX-006 does not replace the legacy
navigation or redesign legacy pages.

The development showcase is served at `/__vnext/design-system`. It is available only
when `COMMAND_CENTER_UX_VNEXT=true`, is protected by the application's existing
authentication and authorization boundary, and is not part of the product route or
navigation registry. With the flag off, the endpoint redirects safely to `/#today`.

## Source contracts

- `assets/ui/tokens.css` is the only approved shared vNext token source.
- `scripts/ui/brand-contract.mjs` is the immutable product, asset, color, font, and
  accessibility contract.
- `scripts/ui/design-system-showcase.mjs` is the pure showcase renderer. It reuses the
  CCX-004 primitive and feedback modules rather than defining a competing component
  system.
- `scripts/test-vnext-brand-contract.mjs` enforces the brand and asset contract.

Later vNext packets must consume these tokens and existing primitive contracts. They
must not copy token values into page-local styles, invent a second button hierarchy,
or reproduce the logo as text or generated artwork.

## Logo rules

The canonical shell logo is the exact transparent white PNG at
`assets/brand/logos/legalease-logo-white-2025.png`. The showcase references that file
directly and supplies its intrinsic `1920` by `1080` dimensions while CSS uses
`height: auto` and `object-fit: contain`.

Do not recolor, redraw, crop, stretch, trace, surround with a badge, substitute the
AI-rendered reference-image mark, or fabricate a monogram or text wordmark. Preserve
the transparent background, clear space, and source aspect ratio. Use the white mark
on dark navy surfaces only; do not place it on a light surface where it disappears.

## Color roles

The exact core palette is:

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Dark shell | `--le-navy-950` | `#071E33` | Primary application framing |
| Dark shell interaction | `--le-navy-900` | `#0B2942` | Hover and nested dark surfaces |
| Dark shell border | `--le-navy-800` | `#123A59` | Subtle separation on navy |
| Selection | `--le-teal-500` | `#78D2CB` | Focus and selected accents |
| Strong selection | `--le-teal-600` | `#52BEB7` | Selected borders and indicators |
| Soft selection | `--le-teal-100` | `#E8F7F5` | Selected navigation background |
| Brand action | `--le-orange-600` | `#F04800` | One main primary action |
| Brand action hover | `--le-orange-700` | `#D84100` | Primary-action hover |
| Brand attention surface | `--le-orange-100` | `#FFF0E8` | Restrained attention treatment |
| Page | `--le-page` | `#F4F7F8` | Application canvas |
| Surface | `--le-surface` | `#FFFFFF` | Primary work surfaces |
| Warm surface | `--le-surface-warm` | `#FCFDFD` | Quiet state surfaces |
| Border | `--le-border` | `#DCE5E8` | Subtle structural border |
| Text | `--le-text` | `#142433` | Primary readable text |
| Muted text | `--le-text-muted` | `#60717D` | Secondary readable text |

Success, warning, danger, and information each have independent foreground, surface,
and border tokens. Teal means selection, not success. Orange means the main brand
action or genuine attention, not every button. Destructive actions always use semantic
danger red. Status meaning must remain visible in text and never rely on color alone.
Normal-size text and controls must meet WCAG AA contrast. The exact orange remains
`#F04800`; its control treatment uses a dark accessible foreground.

## Typography

The approved local stack is `"Geist", "Inter", system-ui, -apple-system,
BlinkMacSystemFont, "Segoe UI", sans-serif`. No external font request or committed
font binary is required. If Geist or Inter is unavailable, the operating-system stack
renders deterministically without a broken network request.

Use the tokenized type scale, weights, and line heights. Headings use tight line
height; body and helper text use normal or relaxed line height. Use the monospace token
only for technical identifiers in Advanced or diagnostic contexts.

## Layout tokens

Spacing follows the `--le-space-*` scale. Component and surface rounding follows the
`--le-radius-*` scale. Borders use `--le-border-thin` or `--le-border-strong`; shadows
use the restrained small, medium, and large shadow tokens. Avoid gradients, glass
effects, oversized shadows, dense dashboard-card grids, and arbitrary one-off spacing.

Content widths, sidebar widths, top-bar heights, control heights, the 44-pixel touch
target, and z-index layers are all named tokens. Do not introduce unexplained numeric
alternatives when an existing token expresses the role.

## Focus and motion

Every interactive element needs a visible `:focus-visible` treatment with a dark
outline plus the shared teal focus ring. Hover must not be the only discoverable
state. Disabled and loading controls retain readable contrast and explicit semantics.

Motion uses the fast, base, and slow duration tokens. Under
`prefers-reduced-motion: reduce`, animation and transitions collapse to a negligible
duration and scrolling returns to automatic behavior. Essential meaning may not
depend on animation.

## Components

### Buttons

Use the shared `renderButton` contract. Primary is the restrained orange action;
secondary is a neutral surfaced control; quiet is tertiary and visually light;
destructive is semantic red. The renderer owns escaping, safe links, disabled and
working states, form type, accessible text, and the data-attribute allowlist. Do not
inject raw attributes or inline handlers.

### Status chips

Use the shared neutral, informational, selected, success, warning, danger, and needs
attention states. Each chip includes visible text and a non-textural indicator, so
color is supplementary rather than the only status signal.

### Forms

Inputs, textareas, selects, checkboxes, and radios require visible labels. Validation
errors use semantic danger, `aria-invalid`, and a described error message. Disabled
controls remain visibly readable. Use control-height and touch-target tokens and keep
focus visible.

### Tables and lists

Prefer a clean row structure with subtle dividers over a card for every record. Keep
the main identifier and status scannable, preserve exact deep links, and provide an
accessible name for the collection.

### Drawers

Use the shared record-drawer shell for title, subtitle or status, close control, tab
region, body, and actions. The structural renderer does not fetch, mutate, or route.
Adopt it only where the existing workflow and keyboard behavior can be preserved.

### Empty, loading, error, toast, and confirmation states

Use the shared primitive and feedback contracts. State titles are explicit; helper
copy explains what is happening; actions remain safe and accessible. Working feedback
must remain visible and duplicate activation must stay blocked where promised. Errors
must not imply success. A confirmation names the action and consequence, distinguishes
destructive intent, and never treats dismissal as approval.

## Responsive behavior

The showcase uses the full sidebar on desktop, a compact sample at smaller laptop and
tablet widths, and an explicit mobile drawer sample at 390 pixels. Page content must
not create horizontal overflow. Controls may wrap, tab rows may scroll within their
own region, and stacked mobile layouts must retain labels, touch targets, and reading
order.

The showcase demonstrates the future visual language only. It is not the production
CCX-100 sidebar and does not authorize changing current navigation.

## Accessibility requirements

- Meet WCAG AA contrast for normal text and controls.
- Keep headings and landmarks semantic and ordered.
- Give every control an accessible name.
- Preserve keyboard navigation and visible focus.
- Expose active tabs and navigation with `aria-current` or the matching semantic
  state.
- Keep statuses and validation understandable without color.
- Respect reduced motion.
- Run rendered-page axe checks; do not suppress rules broadly.

CCX-006 removes the two precise serious contrast exceptions recorded by CCX-005 for
Today and the current Social workspace. The browser accessibility baseline is now
empty: zero critical and zero serious exceptions.

## Approved and prohibited patterns

Approved patterns are one clear primary action, neutral supporting actions, teal
selection, light work surfaces, subtle borders, restrained elevation, readable SaaS
density, semantic states, and exact asset reuse.

Prohibited patterns include gradients, glass effects, orange on every action, teal as
false success, orange destruction, color-only status, raw unescaped HTML, arbitrary
attributes, external font requests, invented logo treatments, fake business metrics,
and sample claims copied from the visual reference.

## Showcase and screenshot workflow

Start the isolated browser fixture through `npm run test:browser`. The Playwright
showcase test enables vNext only on the dedicated compatibility server, verifies that
the endpoint is unavailable with the flag off, scans the rendered page with axe, and
captures deterministic full-page PNGs at widths 1440, 1280, 1024, 768, and 390 under
`docs/ux-vnext/screenshots/ccx-006/`.

The 1440-pixel desktop and 390-pixel mobile images are the required review artifacts;
all five widths are retained to make responsive regressions visible. Screenshots must
come from the actual Playwright-rendered showcase and must never be manually edited or
replaced with generated imagery.

## Changing the contract

A proposed token change requires its user need, affected components, contrast result,
responsive effect, and before/after screenshot evidence. Update the token stylesheet,
brand contract when applicable, focused contract test, browser coverage, and this
document in one reviewed packet. Do not introduce a page-local value first and
retroactively call it a token.
