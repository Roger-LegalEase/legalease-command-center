// Founder OS Relationships — the concept layer, delivered as a lazy asset.
//
// The stylesheet is the payload. The Relationships list is rendered inline by partners-home, so
// there is no runtime to attach these styles to; the lazy loader still wants a script per asset,
// and this is that script: it marks itself loaded and does nothing else. Nothing here renders,
// fetches, or writes.
//
// WHY LAZY. The concept layer for a seven-column table is not small, and it is needed on one route.
// Loading it in the head would spend the shared critical-stylesheet budget on every page that will
// never show a relationship.

export const FOUNDER_RELATIONSHIPS_STYLESHEET_PATH = "assets/ui/founder-relationships.css";

export function founderRelationshipsStyleBrowserSource() {
  return `(() => { "use strict"; window.__LE_FOUNDER_RELATIONSHIPS_STYLE = Object.freeze({ activate(){} }); })();`;
}
