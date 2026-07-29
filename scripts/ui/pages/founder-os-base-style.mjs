// Founder OS base layer — the concept design system for every page inside the shell.
//
// The stylesheet is the whole payload. There is no runtime: nothing here renders, fetches or
// writes. The lazy loader wants a script per asset, and this is that script — it marks itself
// loaded and does nothing else, exactly like founder-relationships-style.mjs.
//
// WHY LAZY rather than another line in the head. founder-os-concept.css is linked
// unconditionally, so bytes added there are paid by flag-off pages too, both against the
// critical-CSS budget and against the promise that flag-off rendering is byte-identical. As a
// lazy asset gated on the shell flag, a flag-off deployment neither serves nor downloads it.

export const FOUNDER_OS_BASE_STYLESHEET_PATH = "assets/ui/founder-os-base.css";

export function founderOsBaseStyleBrowserSource() {
  return `(() => { "use strict"; window.__LE_FOUNDER_OS_BASE_STYLE = Object.freeze({ activate(){} }); })();`;
}
