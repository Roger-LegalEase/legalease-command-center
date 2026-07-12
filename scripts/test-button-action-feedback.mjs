import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The no-silent-buttons rule, enforced against the mechanism that actually ships.
//
// History: the original version of this test pinned a per-handler runAction() helper. PR #49
// replaced runAction with the Phase L universal layer (a capture-phase click listener plus the
// api() feedback wrapper) but this test was never rewritten AND was never in the npm test chain,
// so the enforcement silently died. This rewrite pins the Phase L layer directly, is wired into
// package.json test/check, and proves the rule covers Le-E's send button specifically (the
// button whose silent death exposed the gap).

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

// ---- the Phase L layer exists and is capture-phase ----------------------------------------------
assert(source.includes("Universal button feedback (Phase L"), "Phase L feedback layer must exist.");
const phaseL = source.slice(source.indexOf("Universal button feedback (Phase L"));
const listener = phaseL.slice(0, phaseL.indexOf("}, true);") + 9);
assert(/document\.addEventListener\("click", \(event\) => \{/.test(listener), "Phase L registers a document click listener.");
assert(/\}, true\);/.test(listener), "The listener runs in the CAPTURE phase, before any handler.");
assert(/closest \? target\.closest\("button"\)/.test(listener), "Every <button> is covered - no per-button opt-in.");

// Immediate visible feedback before the handler runs.
assert(/el\.classList\.add\("is-busy"\)/.test(listener), "Pressed button is marked busy immediately.");
assert(/el\.setAttribute\("aria-busy", "true"\)/.test(listener), "Busy state is exposed to assistive tech.");

// Double-fire protection: clicks on already-busy buttons are swallowed.
assert(/if \(el\.classList\.contains\("is-busy"\)\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*event\.stopPropagation\(\);/.test(listener), "Clicks on busy buttons are swallowed.");

// A click whose handler starts no request still releases (300ms idle) - nothing sticks busy.
assert(/clickFeedback\.requests === 0\) releaseClickFeedback\(false\);\s*\n\s*\}, 300\);/.test(source), "No-request clicks release after the idle window.");

// ---- the api() side: spinner spans the request, failure flashes ----------------------------------
assert(source.includes("function beginClickFeedbackRequest()"), "api() ties requests to the pressed button.");
const apiFn = source.slice(source.indexOf("async function api(path"), source.indexOf("async function apiRequest"));
assert(/beginClickFeedbackRequest\(\)/.test(apiFn), "Every api() call joins the click's feedback scope.");
assert(/releaseFeedback\(true\)/.test(apiFn) && /releaseFeedback\(false\)/.test(apiFn), "api() releases on success and failure.");
assert(/el\.classList\.add\("did-fail"\)/.test(source), "Failed requests flash the button.");
assert(source.includes('el.classList.remove("is-busy")'), "Busy state is removed on release.");
assert(/clickFeedback\.clickId !== clickId\) return;/.test(source), "A stale request can never release a newer click's spinner.");

// ---- the rule covers Le-E's send button ------------------------------------------------------------
// The send button is a plain <button type="submit"> (covered by the capture listener) and
// sendLeeMessage awaits api("/api/lee/chat"), so the spinner spans the model call and any
// failure both flashes the button and toasts through cooAction. No silent path remains.
const sendFn = source.slice(source.indexOf("async function sendLeeMessage"), source.indexOf("let leeHistoryLoaded"));
assert(/await api\("\/api\/lee\/chat"/.test(sendFn) || /api\("\/api\/lee\/chat"/.test(sendFn), "Le-E send goes through api(), inheriting Phase L feedback.");
assert(/cooAction/.test(sendFn), "Le-E send failures toast through cooAction.");
assert(/<button class="primary" type="submit"/.test(source.slice(source.indexOf("function leeConversationHtml"), source.indexOf("function leePageHtml"))), "Le-E send is a real <button>, covered by the capture listener.");

// ---- the feedback layer must not enable anything external -----------------------------------------
assert(!/beginClickFeedbackRequest[\s\S]{0,400}(send email|publish page|activate dashboard|enable live)/i.test(source), "Feedback layer must not enable external controls.");
assert(/liveGatesCount/.test(source), "Live gates signal still present.");

console.log("button action feedback tests passed");
