// Founder OS Release 7 — the finishing pass: making Releases 5 and 6 visible.
//
// Two surfaces, both served as lazy runtime files so they cost the initial client-JavaScript
// budget nothing. What this suite proves:
//
//   1. Each surface is gated on its own release flag — absent from the manifest AND unservable
//      when off, so a flag-off deployment cannot serve a surface that is supposed to not exist.
//   2. The Scoreboard response carries the registry ONLY when the flag is on, and is otherwise
//      unchanged. That is the rollback.
//   3. The rendering keeps the charter's honesty rules visible: Unavailable is the word
//      "Unavailable", never a zero; a missing target renders "No target set" and no variance.
//   4. The Le-E panel performs no writes at all — it cannot widen the confirmation contract
//      because it has no path that could.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  VNEXT_LAZY_ASSET_CONTRACT,
  VNEXT_LAZY_RUNTIME_PATH_PREFIX,
  resolveVNextLazyRuntime
} from "./ui/app-shell.mjs";
import {
  founderScoreboardRegistryHtml
} from "./ui/pages/founder-scoreboard-registry.mjs";
import {
  founderLeePanelBrowserSource,
  founderLeePanelHtml
} from "./ui/pages/founder-lee-panel.mjs";

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

// ---------------------------------------------------------------------------------------------
// 1. Both runtimes are flag-gated in both directions
// ---------------------------------------------------------------------------------------------

check("both Release 7 runtimes are registered as lazy files, never inline", () => {
  for (const id of ["founder-scoreboard-registry", "founder-lee-panel"]) {
    assert.ok(VNEXT_LAZY_ASSET_CONTRACT.runtimeIds.includes(id),
      `${id} must be a lazy runtime so it costs the initial client-JavaScript budget nothing`);
  }
});

check("a flag-off deployment cannot serve either runtime", () => {
  const allOff = { outreachEnabled:true };
  for (const id of ["founder-scoreboard-registry", "founder-lee-panel"]) {
    assert.equal(resolveVNextLazyRuntime(`${VNEXT_LAZY_RUNTIME_PATH_PREFIX}${id}.js`, allOff), null,
      `${id} must not be served when its flag is off — omitting it from the manifest is not enough`);
  }
  // And each is served only by ITS OWN flag, not by any Founder OS flag.
  assert.equal(resolveVNextLazyRuntime(`${VNEXT_LAZY_RUNTIME_PATH_PREFIX}founder-scoreboard-registry.js`,
    { outreachEnabled:true, founderOsLeePanel:true }), null,
    "the Le-E flag must not serve the Scoreboard runtime");
  assert.equal(resolveVNextLazyRuntime(`${VNEXT_LAZY_RUNTIME_PATH_PREFIX}founder-lee-panel.js`,
    { outreachEnabled:true, founderOsScoreboard:true }), null,
    "the Scoreboard flag must not serve the Le-E runtime");
});

check("each runtime is served when its own flag is on, and stays within the size ceiling", () => {
  const scoreboard = resolveVNextLazyRuntime(`${VNEXT_LAZY_RUNTIME_PATH_PREFIX}founder-scoreboard-registry.js`,
    { outreachEnabled:true, founderOsScoreboard:true });
  const lee = resolveVNextLazyRuntime(`${VNEXT_LAZY_RUNTIME_PATH_PREFIX}founder-lee-panel.js`,
    { outreachEnabled:true, founderOsLeePanel:true });
  for (const [id, source] of [["scoreboard registry", scoreboard], ["Le-E panel", lee]]) {
    assert.ok(typeof source === "string" && source.length > 0, `${id} must be servable when its flag is on`);
    assert.ok(source.length <= 64 * 1024, `${id} runtime is ${source.length} bytes, over the 64KB lazy ceiling`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. The Scoreboard response carries the registry only under the flag
// ---------------------------------------------------------------------------------------------

check("the endpoint adds the registry only when the flag is on", () => {
  const source = readFileSync(new URL("./founder-scoreboard-api.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(founderOs && view\.available\)/,
    "the registry must be added behind the flag, and only when the underlying view is available");
  assert.match(source, /body\.registry = buildFounderScoreboardRegistryView/,
    "the registry must be an addition to the existing body, not a replacement of it");
  // Platform health failing must not take the Scoreboard down.
  assert.match(source, /catch \{ health = \{ available:false \}; \}/,
    "a Company Health failure must degrade to an honest unavailable section, not a 500");
});

check("the client renders nothing at all when the registry block is absent", () => {
  assert.equal(founderScoreboardRegistryHtml(null), "",
    "with the flag off there is no registry block and the surface must render nothing — that is the rollback");
});

// ---------------------------------------------------------------------------------------------
// 3. The honesty rules survive rendering
// ---------------------------------------------------------------------------------------------

const registryFixture = {
  available:true,
  groups:[{
    key:"financial",
    label:"Financial",
    cards:[
      {
        id:"cash_available", label:"Cash available",
        status:{ key:"manual", label:"Manual" },
        definition:"Money actually in the bank.",
        sourceKind:"Owner input", refreshedAt:"2026-07-25T12:00:00.000Z",
        current:{ available:true, value:50000, unit:"currency", currency:"usd" },
        previous:{ available:false, value:null },
        target:null, varianceToTarget:null, varianceToPrevious:null,
        correctiveAction:{ label:"Update cash and burn", target:"#revenue" }
      },
      {
        id:"refunds", label:"Refunds",
        status:{ key:"unavailable", label:"Unavailable" },
        definition:"Money returned to customers.",
        sourceKind:"Stripe", refreshedAt:"",
        // The critical case: unavailable, value zero-ish absent.
        current:{ available:false, value:null },
        previous:{ available:false, value:null },
        target:null, varianceToTarget:null, varianceToPrevious:null,
        correctiveAction:{ label:"Review support issues", target:"#support" }
      },
      {
        id:"runway", label:"Runway",
        status:{ key:"manual", label:"Manual" },
        definition:"Months of runway left.",
        sourceKind:"Owner input", refreshedAt:"2026-07-25T12:00:00.000Z",
        current:{ available:true, value:5, unit:"count" },
        previous:{ available:true, value:6, unit:"count" },
        target:6,
        varianceToTarget:{ difference:-1, share:-1 / 6, direction:"down", better:false },
        varianceToPrevious:{ difference:-1, share:-1 / 6, direction:"down", better:false },
        derivedFrom:"cash available ÷ monthly burn",
        correctiveAction:{ label:"Update cash and burn", target:"#revenue" }
      }
    ]
  }],
  platformHealth:{ key:"platform_health", label:"Platform health", available:true, components:[
    { id:"supabase", label:"Supabase", status:{ key:"healthy", label:"Healthy" }, summary:"Connected." }
  ] },
  exceptions:[]
};

check("an unavailable metric renders the word Unavailable, never a zero", () => {
  const html = founderScoreboardRegistryHtml(registryFixture);
  const refunds = html.slice(html.indexOf('data-kpi="refunds"'), html.indexOf('data-kpi="runway"'));
  assert.match(refunds, /Unavailable/, "an unavailable metric must say so");
  assert.ok(!/>\s*0\s*</.test(refunds), "an unavailable metric must not render a bare zero");
  assert.ok(!/USD 0/.test(refunds), "an unavailable currency metric must not render a zero amount");
});

check("a metric with no target renders no target and no variance", () => {
  const html = founderScoreboardRegistryHtml(registryFixture);
  const cash = html.slice(html.indexOf('data-kpi="cash_available"'), html.indexOf('data-kpi="refunds"'));
  assert.match(cash, /No target set/, "a metric with no stored target must say so");
  assert.match(cash, /No target comparison/, "a variance against a missing target must not be rendered");
  assert.match(cash, /No prior comparison/, "a variance against a missing prior must not be rendered");
});

check("a variance reports direction and whether it is an improvement", () => {
  const html = founderScoreboardRegistryHtml(registryFixture);
  const runway = html.slice(html.indexOf('data-kpi="runway"'));
  assert.match(runway, /data-tone="worse"/, "less runway than target is not an improvement");
  assert.match(runway, /▼/, "the direction must be visible");
  assert.match(runway, /Derived from cash available/, "a derived metric must say what it is derived from");
});

check("every metric renders all nine contract fields", () => {
  const html = founderScoreboardRegistryHtml(registryFixture);
  for (const field of ["Source", "Freshness", "Prior period", "Target", "Variance"]) {
    assert.ok(html.includes(`<dt>${field}</dt>`), `the rendering must show ${field}`);
  }
  assert.match(html, /kpi-definition/, "definition must render");
  assert.match(html, /kpi-status/, "status label must render");
  assert.match(html, /kpi-value/, "current value must render");
  assert.match(html, /kpi-action/, "corrective action must render");
});

check("platform health renders as a section of the Scoreboard", () => {
  const html = founderScoreboardRegistryHtml(registryFixture);
  assert.match(html, /data-kpi-group="platform_health"/);
  assert.match(html, /data-platform-component="supabase"/);
});

check("an unreadable platform health section says so instead of showing healthy components", () => {
  const html = founderScoreboardRegistryHtml({
    ...registryFixture,
    platformHealth:{ key:"platform_health", label:"Platform health", available:false, unavailableReason:"Platform health could not be read.", components:[] }
  });
  assert.match(html, /could not be read/i);
});

// ---------------------------------------------------------------------------------------------
// 4. The Le-E panel performs no writes
// ---------------------------------------------------------------------------------------------

check("the Le-E panel runtime issues no fetch, no POST and no mutation of any kind", () => {
  // Comments are stripped first. An earlier version of this check failed on the runtime's own
  // comment saying "issues no fetch and no POST" — the same trap the lessons record for
  // test-operator-consolidation-pass, where a phrase existing only in a comment was matched
  // against source. Scanning executable code rather than prose is the stronger assertion.
  const source = founderLeePanelBrowserSource()
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(forbidden),
      `the Le-E panel must contain no "${forbidden}" in executable code — it changes where Le-E is, never what Le-E may do`);
  }
  // Positive control: the stripping must not have emptied the source and made this vacuous.
  assert.ok(source.includes("founderLeePanelHtml"), "the stripped source must still contain the renderer");
  assert.ok(source.length > 500, `the stripped source is only ${source.length} bytes; the check would be vacuous`);
});

check("the panel says plainly what it cannot do", () => {
  const html = founderLeePanelHtml({ proposals:[] });
  assert.match(html, /Le-E proposes/i);
  assert.match(html, /needs? your confirmation/i,
    "the panel must state that the one-confirmation actions belong to the surfaces that own them");
});

check("the panel is a panel, not a page: it links to the full page rather than replacing it", () => {
  const html = founderLeePanelHtml({ proposals:[] });
  assert.match(html, /data-lee-panel-full/, "the full Le-E page must remain reachable");
  assert.match(html, /href="#lee"/, "no route is superseded by this release");
  assert.match(html, /hidden/, "the panel starts closed");
});

check("a proposal renders as waiting for a decision, never as done", () => {
  const html = founderLeePanelHtml({ proposals:[{ id:"s1", title:"Create a follow-up task", status:"pending" }] });
  assert.match(html, /Waiting for your decision/);
  assert.match(html, /data-lee-proposal="s1"/);
});


// ---------------------------------------------------------------------------------------------
// 5. Review-only imports must say, BEFORE you act, that nothing reaches anyone
//
// Reuse-ledger row P7, DECIDED 2026-07-26 with Roger's qualification: "the honest labelling is
// not optional… these surfaces currently imply an import will reach someone."
//
// The surface already said "No email sends", which describes the IMPORT action. It never said
// the imported PEOPLE are held and cannot be contacted — which is the thing a founder would
// actually want to know before uploading a list of real people. Both must be present, and
// present before the action rather than only in the confirmation afterwards.
// ---------------------------------------------------------------------------------------------

check("the upload surface states before you act that nobody is contacted", () => {
  const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const start = server.indexOf('id="operator-upload-dropzone"');
  assert.ok(start > 0, "the upload surface must exist");
  const surface = server.slice(start, server.indexOf('id="operator-upload-result"') + 400);

  assert.match(surface, /Importing a list never contacts anyone/i,
    "the surface must say plainly that importing contacts nobody");
  assert.match(surface, /held for review/i, "it must say imported people are held");
  assert.match(surface, /until you release them/i,
    "it must say a deliberate release is what changes that");
  // The claim must appear on the way IN, not only in the post-import confirmation.
  assert.ok(surface.indexOf("never contacts anyone") < surface.indexOf('id="operator-upload-result"'),
    "the honest label must appear before the action, not only after it");
});

check("no import action label implies a send", () => {
  const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const start = server.indexOf('<option value="hold_for_campaign">');
  const options = server.slice(start, server.indexOf("</select>", start));
  assert.match(options, /Draft outreach \(drafts only, never sends\)/,
    "the drafting option must say it never sends; 'asks for approval first' implies a send follows");
  assert.ok(!/\bSend\b/.test(options), `no import action may offer a send; got: ${options.replace(/\s+/g, " ").slice(0, 200)}`);
});

console.log(`Founder OS Release 7: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
