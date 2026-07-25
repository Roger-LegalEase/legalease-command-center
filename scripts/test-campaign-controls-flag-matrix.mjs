// The reactivation controls must be reachable from primary navigation under EVERY
// combination of COMMAND_CENTER_UX_VNEXT x COMMAND_CENTER_UX_VNEXT_OUTREACH.
//
// Why this suite exists. Roger flipped COMMAND_CENTER_UX_VNEXT_OUTREACH from true to false
// in Render (which restarts the service) and saw no change on the Outreach/Campaigns
// surface. The flags were being read correctly — they are read once per process at module
// load (preview-server.mjs `outreachVNextConfig`), the shell is served `cache-control:
// no-store`, there is no service worker and no stored settings override, so a restart does
// take effect. What did not change was the thing he was looking for: under BOTH flag states
// the Campaigns surface opened onto a review-only list, and the Run / Stop / Resume /
// Preview controls were built only by loadCampaignCommand(), which ran only after clicking
// a button labelled "Load campaign controls". With the flag ON, the vNext Outreach page
// then replaced that section's innerHTML outright, deleting the card entirely.
//
// This suite pins the repair: the same controls are present and reachable in all four
// states, and the vNext page carries the control surface over instead of destroying it.
import assert from "node:assert/strict";

import { resolveRouteWithContract } from "./ui/route-compatibility.mjs";
import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const COMBOS = [
  { vnext:"false", outreach:"false", expectedHref:"#campaigns", shell:"legacy" },
  { vnext:"false", outreach:"true", expectedHref:"#campaigns", shell:"legacy" },
  { vnext:"true", outreach:"false", expectedHref:"#campaigns", shell:"vnext" },
  { vnext:"true", outreach:"true", expectedHref:"#outreach", shell:"vnext" }
];

// Product flags default off, so a product flag alone can never enable a vNext surface: the
// global flag gates all of them (ui/vnext-config.mjs).
function label(combo) {
  return `UX_VNEXT=${combo.vnext} UX_VNEXT_OUTREACH=${combo.outreach}`;
}

function navigationHref(html, shell) {
  const pattern = shell === "vnext"
    ? /<a\b[^>]*href="([^"]+)"[^>]*data-shell-destination="Outreach"/
    : /<a\b[^>]*href="([^"]+)"[^>]*data-nav-section="campaigns"/;
  const match = html.match(pattern);
  assert.ok(match, `${shell} shell must expose an Outreach/Campaigns primary navigation link.`);
  return match[1];
}

// ---------------------------------------------------------------------------------------
// Step 1 explanation, captured as assertions on the pure resolver.
// ---------------------------------------------------------------------------------------
// #campaigns is a real canonical route in every flag state, so the navigation link always
// lands on a real page.
const campaignsRoute = resolveRouteWithContract("#campaigns");
assert.equal(campaignsRoute.kind, "page");
assert.equal(campaignsRoute.canonicalRoute, "campaigns");
assert.equal(campaignsRoute.destination, "Outreach");

// #outreach is NOT a canonical route. With the Outreach flag off, the client resolver has
// no alias for it, so a held or bookmarked #outreach URL resolves to nothing and the shell
// renders Today while the address bar still reads #outreach. That is the one genuinely
// invisible consequence of the flag flip, and it is why "no visible change" was reported.
const outreachRoute = resolveRouteWithContract("#outreach");
assert.equal(outreachRoute.kind, "unknown");
assert.equal(outreachRoute.recoveryReason, "unknown_route");
assert.equal(outreachRoute.destination, "Today");

// The legacy aliases keep resolving to the same canonical page regardless.
for (const alias of ["#campaign", "#campaign-control", "#campaigns-control"]) {
  assert.equal(resolveRouteWithContract(alias).canonicalRoute, "campaigns", `${alias} must resolve to the Campaigns page.`);
}

// ---------------------------------------------------------------------------------------
// The matrix.
// ---------------------------------------------------------------------------------------
for (const combo of COMBOS) {
  const server = await startPreviewServer({ env:{
    COMMAND_CENTER_UX_VNEXT:combo.vnext,
    COMMAND_CENTER_UX_VNEXT_OUTREACH:combo.outreach,
    COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
    COMMAND_CENTER_UX_VNEXT_FILES:"true",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:"true"
  } });
  try {
    const session = await loginOwner(server);
    const response = await fetch(`${server.baseUrl}/`, { headers:{ cookie:session.cookie, accept:"text/html" } });
    assert.equal(response.status, 200, `${label(combo)}: the shell must render.`);
    // The flags are read at boot; nothing may cache the shell past a restart.
    assert.match(String(response.headers.get("cache-control") || ""), /no-store/, `${label(combo)}: the shell must not be cached.`);
    const html = await response.text();

    // 1. Primary navigation offers the surface, at the expected route for these flags.
    const href = navigationHref(html, combo.shell);
    assert.equal(href, combo.expectedHref, `${label(combo)}: the primary Outreach/Campaigns link must point at ${combo.expectedHref}.`);

    // 2. Whichever route that is, it renders the page that hosts the control surface.
    if (combo.shell === "vnext") {
      assert.match(html, /isOutreachRoute \? "campaigns"/, `${label(combo)}: an Outreach route must render the campaigns page section.`);
    }

    // 3. The control surface itself is served, with a stable marker the vNext page uses.
    assert.match(html, /data-reactivation-control-surface/, `${label(combo)}: the reactivation control surface must be served.`);
    assert.match(html, /<h2>Reactivation campaign controls<\/h2>/, `${label(combo)}: the control card must be present.`);

    // 4. Controls load on arrival — not behind a "Load campaign controls" click.
    assert.match(html, /if \(pageId === "campaigns"\) autoLoadCampaignCommand\(\);/, `${label(combo)}: opening Campaigns must load the controls.`);
    assert.match(html, /function autoLoadCampaignCommand\(\)/, `${label(combo)}: the auto-loader must be defined.`);

    // 5. Run, Stop, Resume and Preview all exist as real controls with real handlers.
    for (const [what, needle] of [
      ["Run", /Run Reactivation Campaign/],
      ["Run handler", /function reactivationRunCampaignConfirm\(\)/],
      ["Stop", /Stop Reactivation Campaign/],
      ["Stop handler", /function reactivationStopCampaign\(\)/],
      ["Resume", /Propose resume \(asks your approval\)/],
      ["Resume handler", /async function campaignResumePropose\(\)/],
      ["Preview next sends", /Preview next sends/],
      ["Preview handler", /async function campaignPreviewNextSends\(\)/],
      ["wave preview handler", /async function campaignWavePreview\(wave\)/],
      ["controls marker", /data-reactivation-controls/]
    ]) {
      assert.match(html, needle, `${label(combo)}: ${what} must be present in the served surface.`);
    }

    // 6. No control may exist only as a raw POST endpoint: every one of these is invoked
    //    from a rendered button in the shell.
    for (const handler of ["reactivationRunCampaignConfirm()", "reactivationStopCampaign()", "campaignPreviewNextSends()", "campaignResumePropose()"]) {
      assert.ok(html.includes(`onclick=\\"${handler}\\"`) || html.includes(`onclick="${handler}"`),
        `${label(combo)}: ${handler} must be wired to a clickable control.`);
    }

    // 7. When the vNext Outreach page is active it must CARRY the control surface, never
    //    replace it. This is the regression that deleted the only working controls.
    const outreachPageActive = combo.vnext === "true" && combo.outreach === "true";
    assert.equal(html.includes("data-outreach-page"), outreachPageActive, `${label(combo)}: vNext Outreach page presence must follow the flags.`);
    if (outreachPageActive) {
      assert.match(html, /function detachControlSurface\(target\)/, `${label(combo)}: the vNext page must detach the control surface before mounting.`);
      assert.match(html, /function attachControlSurface\(target, preserved\)/, `${label(combo)}: the vNext page must re-attach the control surface after mounting.`);
      assert.match(html, /const preserved = detachControlSurface\(target\);\s*target\.innerHTML = loadingHtml;/, `${label(combo)}: the control surface must be preserved across the innerHTML replacement.`);
      assert.match(html, /attachControlSurface\(target, preserved\)/, `${label(combo)}: the preserved control surface must be re-attached.`);
      // And the campaign detail view it links to must carry the freeze fix.
      assert.match(html, /if\(observerQueued\)return;observerQueued=true/, `${label(combo)}: the campaign detail observer must be latched.`);
    }

    // 8. The route-compatibility contract shipped to the browser matches the flags.
    // The contract reaches the browser as JSON, so the keys are quoted.
    assert.equal(html.includes('"campaigns":"outreach"'), outreachPageActive, `${label(combo)}: the campaigns→outreach alias must follow the flags.`);
    assert.equal(html.includes('"outreach":"Outreach"'), outreachPageActive, `${label(combo)}: the Outreach destination must follow the flags.`);

    // 9. The controls have real data behind them in every state: same endpoint, same shape.
    const command = await fetch(`${server.baseUrl}/api/campaign/command`, { headers:{ cookie:session.cookie, accept:"application/json" } });
    assert.equal(command.status, 200, `${label(combo)}: the campaign command endpoint must answer.`);
    const view = await command.json();
    assert.equal(view.ok, true);
    assert.ok(Array.isArray(view.waves), `${label(combo)}: the view must carry the wave plan Preview next sends reads.`);
    assert.equal(typeof view.dueNowPlain, "string", `${label(combo)}: the view must say who is due.`);
    assert.ok(view.dueNowPlain.length > 0);
    assert.ok(view.live && typeof view.live.statusCopy === "string", `${label(combo)}: the view must carry the Run/Stop status.`);
    assert.equal(typeof view.sendWindowPlain, "string");

    console.log(`  ✓ ${label(combo)} — nav ${href} → controls present (Run, Stop, Resume, Preview next sends)`);
  } finally {
    await server.stop();
  }
}

console.log("test-campaign-controls-flag-matrix: all checks passed");
