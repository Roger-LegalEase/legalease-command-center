// Founder OS — the concept's shell chrome, server-rendered.
//
// Everything in this file is MARKUP AND CSS ONLY. It is emitted into the shell HTML, not into a
// <script>, so none of it touches the initial client-JavaScript budget. That is deliberate: the
// visual layer this release delivers had roughly 193 bytes of JavaScript headroom to work with,
// and a sidebar built from server-rendered markup costs it nothing.
//
// SCOPE. Every piece here is drawn only when the Founder OS shell flag is on, and the shell root
// carries data-founder-os-shell="true" so the stylesheet can key off one attribute. With the flag
// off nothing below is emitted, the attribute is absent, and the shell is byte-identical to what
// it was — which is the rollback path.
//
// NO FIXTURES. The account block reads the AUTHENTICATED SESSION and nothing else. It has no
// default name, no placeholder person, and no fallback string: an account the server cannot name
// renders no account block at all. The concept's own sidebar shows a synthetic fixture person in
// this position; that fixture may not appear here, and scripts/test-concept-fixture-containment.mjs
// fails the build if it — or any other fixture from the concept package — ever does.

import { escapeAttribute, escapeHtml } from "./html.mjs";

const clean = (value = "") => String(value ?? "").trim();

// The concept prototype's icon set, verbatim, so a nav icon in the built shell is the same shape
// as the nav icon in the screen it is being matched against. Stroke, size and colour come from
// CSS. Only the icons this shell actually draws are included.
const FOUNDER_ICON_SYMBOLS = Object.freeze({
  home:'<path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.7v-7H9.2v7H3.5a.5.5 0 0 1-.5-.5z"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  megaphone:'<path d="m3 11 15-5v12L3 13z"/><path d="M11.6 15.8 13 21H8l-1.4-6.5M18 10a3 3 0 0 1 0 4"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/>',
  sparkles:'<path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8zM5 14l.8 1.7L7.5 16l-1.7.8L5 18.5l-.8-1.7L2.5 16l1.7-.3z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03H5.3v-3h.14A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7V4.6h3v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.14v3h-.14A1.7 1.7 0 0 0 19.4 15z"/>',
  inbox:'<path d="M4 4h16v14H4z"/><path d="M4 14h4l2 3h4l2-3h4"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  play:'<path d="m8 5 11 7-11 7z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
  alert:'<path d="M10.3 4.1 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.1a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  pencil:'<path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16zM14.8 6l3.2 3.2"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>'
});

export const FOUNDER_ICON_NAMES = Object.freeze(Object.keys(FOUNDER_ICON_SYMBOLS));

// One sprite in the document, referenced by <use>. Cheaper than repeating paths and it means the
// lazy workspace runtimes can draw the same icons without shipping any geometry of their own.
export function renderFounderIconSprite() {
  const symbols = FOUNDER_ICON_NAMES
    .map((name) => `<symbol id="le-i-${name}" viewBox="0 0 24 24">${FOUNDER_ICON_SYMBOLS[name]}</symbol>`)
    .join("");
  return `<svg class="le-icon-sprite" aria-hidden="true" focusable="false" width="0" height="0"><defs>${symbols}</defs></svg>`;
}

export function founderIcon(name, className = "") {
  if (!Object.prototype.hasOwnProperty.call(FOUNDER_ICON_SYMBOLS, clean(name))) return "";
  return `<svg class="le-icon${className ? ` ${escapeAttribute(className)}` : ""}" aria-hidden="true" focusable="false"><use href="#le-i-${escapeAttribute(clean(name))}"></use></svg>`;
}

// Which icon each primary workspace carries. A destination with no entry draws no icon rather
// than a stand-in glyph.
const WORKSPACE_ICONS = Object.freeze({
  today:"home",
  partners:"users",
  outreach:"megaphone",
  scoreboard:"chart",
  inbox:"inbox",
  social:"globe",
  support:"mail",
  calendar:"calendar",
  "company-health":"check",
  files:"file"
});

const UTILITY_ICONS = Object.freeze({ lee:"sparkles", settings:"settings" });

export function founderWorkspaceIcon(id = "") {
  return founderIcon(WORKSPACE_ICONS[clean(id)] || "");
}

export function founderUtilityIcon(id = "") {
  return founderIcon(UTILITY_ICONS[clean(id)] || "");
}

// The brand block.
//
// The concept draws an orange rounded square containing the letter L beside the product name.
// That is a fabricated monogram, which the approved visual contract forbids outright
// (scripts/ui/brand-contract.mjs, LOGO_USAGE_RULES: "Do not substitute the reference-image
// wordmark or fabricate a monogram"). The approved all-white wordmark stays, and only the
// surface name the concept sets beneath it is added. This is the one place the release
// deliberately does not match the screen.
export function renderFounderBrand() {
  return `<span class="le-brand-surface" aria-hidden="true">Command Center</span>`;
}

// The Le-E card. Chrome around the control that already exists: the button dispatches the same
// shell action as the Le-E entry in the utilities nav, so this adds a second door to one room and
// no second behaviour.
export function renderFounderAssistantCard(leeLabel = "Le-E") {
  return `<div class="le-assistant-card">
        <div class="le-assistant-top">
          <span class="le-assistant-orb">${founderIcon("sparkles")}</span>
          <span class="le-assistant-name"><strong>${escapeHtml(leeLabel)}</strong><span>Founder copilot</span></span>
        </div>
        <p>Turn your priorities into the next best action — without losing control.</p>
        <button class="le-assistant-action" type="button" data-shell-action="open-lee">Ask ${escapeHtml(leeLabel)}</button>
      </div>`;
}

// Initials for the avatar, derived from the account the session actually carries. Never from a
// stored fixture and never invented: an account with no readable name produces no initials, and
// the caller then draws no block.
export function accountInitials(name = "") {
  const words = clean(name).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const letters = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`;
  return letters.toUpperCase();
}

// The sidebar account block.
//
// The ONLY source is the authenticated session actor: `label` is the account's own name for
// itself, resolved by scripts/access-control.mjs from the role the session proves. There is no
// default, no sample and no fallback person. An unauthenticated or unnamed session renders "",
// which is the omission rule this release follows everywhere: an element the read model cannot
// fill is not drawn rather than filled with something plausible.
//
// The second line names the WORKSPACE, not the person. It is the same for every account and is
// therefore chrome rather than data.
export function renderFounderAccount(account = {}) {
  const name = clean(account.label);
  if (!name || account.authenticated === false) return "";
  const initials = accountInitials(name);
  return `<div class="le-account" data-shell-account>
        <span class="le-account-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
        <span class="le-account-copy"><strong data-shell-account-name>${escapeHtml(name)}</strong><span>Founder workspace</span></span>
        <a class="le-account-settings" href="#settings" aria-label="Settings">${founderIcon("settings")}</a>
      </div>`;
}

// The account the shell may draw, reduced to the two fields it is allowed to read. Anything the
// session does not prove is dropped here rather than in the renderer.
export function founderShellAccount(actor = {}) {
  return Object.freeze({
    label:clean(actor?.label),
    authenticated:actor?.authenticated === true
  });
}
