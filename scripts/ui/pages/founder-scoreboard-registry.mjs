// Founder OS Release 7 — the Scoreboard KPI registry, rendered.
//
// Served as a LAZY RUNTIME FILE so it costs the initial client-JavaScript budget nothing. It
// renders the `registry` block that /api/ui/scoreboard adds when FOUNDER_OS_SCOREBOARD is on,
// and it renders nothing at all when that block is absent — which is the rollback.
//
// Every metric shows all nine fields the charter requires. The honesty rules are visible here
// rather than only in the projection:
//
//   * An unavailable value renders the word "Unavailable", never "0" and never "$0".
//   * A missing target renders "No target set" and NO variance, because a variance against a
//     target that does not exist would be invented.
//   * A variance says whether it is an improvement using the metric's own direction, so "down"
//     on overdue follow-ups reads as good and "down" on revenue does not.

import { escapeAttribute, escapeHtml } from "../html.mjs";
import { FOUNDER_SCOREBOARD_ENDPOINT } from "../../founder-scoreboard-service.mjs";

export const FOUNDER_SCOREBOARD_REGISTRY_STYLESHEET_PATH = "assets/ui/founder-scoreboard-registry.css";

const clean = (value = "") => String(value ?? "").trim();

// One formatter for every value, so "Unavailable" cannot be rendered inconsistently.
function formatValue(shape) {
  if (!shape || shape.available !== true || shape.value === null || shape.value === undefined) return "Unavailable";
  const value = Number(shape.value);
  if (!Number.isFinite(value)) return "Unavailable";
  if (shape.unit === "currency") {
    const currency = String(shape.currency || "usd").toUpperCase();
    return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits:2 })}`;
  }
  if (shape.unit === "percent") return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString("en-US", { maximumFractionDigits:2 });
}

function formatFreshness(value) {
  const text = clean(value);
  if (!text) return "Not recorded";
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "Not recorded";
}

function varianceHtml(variance, label) {
  if (!variance) return `<span class="kpi-variance is-absent">No ${escapeHtml(label)} comparison</span>`;
  const share = variance.share === null || variance.share === undefined
    ? ""
    : ` (${(variance.share * 100).toFixed(1)}%)`;
  const tone = variance.better === null ? "flat" : variance.better ? "better" : "worse";
  const arrow = variance.direction === "up" ? "▲" : variance.direction === "down" ? "▼" : "■";
  return `<span class="kpi-variance" data-tone="${escapeAttribute(tone)}">${arrow} ${escapeHtml(String(Math.abs(variance.difference).toLocaleString("en-US", { maximumFractionDigits:2 })))}${escapeHtml(share)} vs ${escapeHtml(label)}</span>`;
}

// Every destination on this surface goes through one check. A hash the route resolver does
// not confirm renders as plain text rather than as a link to somewhere unexpected.
function safeScoreboardHref(href) {
  const value = String(href ?? "").trim();
  if (!value.startsWith("#")) return "";
  const resolver = typeof window === "undefined" ? null : window.__LE_VNEXT_ROUTE_COMPATIBILITY;
  if (!resolver) return /^#[a-z0-9?=&:/%_-]+$/i.test(value) ? value : "";
  const resolved = resolver.resolve(value);
  return resolved && ["page", "object"].includes(resolved.kind) && resolved.safeHash === value ? value : "";
}

function metricHtml(card) {
  const target = card.target === null || card.target === undefined
    ? `<dd class="kpi-target is-absent">No target set</dd>`
    : `<dd class="kpi-target">${escapeHtml(Number(card.target).toLocaleString("en-US", { maximumFractionDigits:2 }))}</dd>`;
  return `<article class="kpi-card" data-kpi="${escapeAttribute(card.id)}" data-kpi-status="${escapeAttribute(card.status?.key || "unavailable")}">
    <header>
      <h4>${escapeHtml(card.label || card.id)}</h4>
      <span class="kpi-status" data-status="${escapeAttribute(card.status?.key || "unavailable")}">${escapeHtml(card.status?.label || "Unavailable")}</span>
    </header>
    <p class="kpi-definition">${escapeHtml(card.definition || "")}</p>
    <p class="kpi-value" data-kpi-value>${escapeHtml(formatValue(card.current))}</p>
    <dl class="kpi-fields">
      <dt>Source</dt><dd>${escapeHtml(card.sourceKind || card.source?.label || "Unavailable")}</dd>
      <dt>Freshness</dt><dd>${escapeHtml(formatFreshness(card.refreshedAt))}</dd>
      <dt>Prior period</dt><dd>${escapeHtml(formatValue(card.previous))}</dd>
      <dt>Target</dt>${target}
      <dt>Variance</dt><dd>${varianceHtml(card.varianceToTarget, "target")} ${varianceHtml(card.varianceToPrevious, "prior")}</dd>
    </dl>
    ${card.derivedFrom ? `<p class="kpi-derived">Derived from ${escapeHtml(card.derivedFrom)}.</p>` : ""}
    ${card.correctiveAction && safeScoreboardHref(card.correctiveAction.target) ? `<p class="kpi-action"><a class="kpi-action-link" href="${escapeAttribute(safeScoreboardHref(card.correctiveAction.target))}" data-kpi-action="${escapeAttribute(card.id)}">${escapeHtml(card.correctiveAction.label)}</a></p>` : ""}
    ${card.current?.available !== true && safeScoreboardHref(card.href) ? `<p class="kpi-source-link"><a href="${escapeAttribute(safeScoreboardHref(card.href))}" data-kpi-source="${escapeAttribute(card.id)}">Open the source for ${escapeHtml(card.label || card.id)}</a></p>` : ""}
  </article>`;
}

function groupHtml(group) {
  return `<section class="kpi-group" data-kpi-group="${escapeAttribute(group.key)}" aria-labelledby="kpi-group-${escapeAttribute(group.key)}">
    <h3 id="kpi-group-${escapeAttribute(group.key)}">${escapeHtml(group.label)}</h3>
    <div class="kpi-cards">${(group.cards || []).map(metricHtml).join("")}</div>
  </section>`;
}

function platformHtml(platform, folded = false) {
  if (!platform) return "";
  if (platform.available !== true) {
    return `<section class="kpi-group" data-kpi-group="platform_health">${folded ? "" : "<h3>Platform health</h3>"}<p role="note">${escapeHtml(platform.unavailableReason || "Platform health could not be read.")}</p></section>`;
  }
  return `<section class="kpi-group" data-kpi-group="platform_health"${folded ? "" : ` aria-labelledby="kpi-group-platform"`}>${folded ? "" : `<h3 id="kpi-group-platform">Platform health</h3>`}
    <ul class="kpi-platform">${(platform.components || []).map((component) => `<li data-platform-component="${escapeAttribute(component.id)}" data-status="${escapeAttribute(component.status?.key || "unavailable")}"><strong>${escapeHtml(component.label)}</strong> — ${escapeHtml(component.status?.label || "Unavailable")}${component.summary ? ` · ${escapeHtml(component.summary)}` : ""}</li>`).join("")}</ul>
  </section>`;
}

export function founderScoreboardRegistryHtml(registry = null) {
  if (!registry) return "";
  if (registry.available !== true) {
    return `<section class="kpi-registry" data-kpi-registry><p role="status">${escapeHtml(registry.availability?.reason || "The Scoreboard could not be read.")}</p></section>`;
  }
  const exceptions = registry.exceptions || [];
  return `<section class="kpi-registry" data-kpi-registry aria-labelledby="kpi-registry-title">
    <header><h2 id="kpi-registry-title">Scoreboard</h2><p>Every number shows where it comes from, how fresh it is, and what to do about it.</p></header>
    ${exceptions.length ? `<section class="kpi-exceptions" aria-label="Needs attention" data-kpi-exceptions="${exceptions.length}"><h3>${exceptions.length} ${exceptions.length === 1 ? "metric needs" : "metrics need"} attention</h3><ul>${exceptions.map((exception) => {
      const href = safeScoreboardHref(exception.action?.target);
      const label = escapeHtml(exception.label);
      return `<li data-kpi-exception="${escapeAttribute(exception.id)}">${href ? `<a href="${escapeAttribute(href)}" data-kpi-exception-action="${escapeAttribute(exception.id)}">${label}</a>` : `<strong>${label}</strong>`}${exception.detail ? ` — ${escapeHtml(exception.detail)}` : ""}</li>`;
    }).join("")}</ul></section>` : ""}
    ${(registry.groups || []).map((group) => groupHtml(group) + (group.key === "health" ? platformHtml(registry.platformHealth, true) : "")).join("")}
    ${(registry.groups || []).some((group) => group.key === "health") ? "" : platformHtml(registry.platformHealth)}
  </section>`;
}

export function founderScoreboardRegistryBrowserSource() {
  const endpoint = JSON.stringify(FOUNDER_SCOREBOARD_ENDPOINT);
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const formatValue=${formatValue.toString()};`,
    `const formatFreshness=${formatFreshness.toString()};`,
    `const safeScoreboardHref=${safeScoreboardHref.toString()};`,
    `const varianceHtml=${varianceHtml.toString()};`,
    `const metricHtml=${metricHtml.toString()};`,
    `const groupHtml=${groupHtml.toString()};`,
    `const platformHtml=${platformHtml.toString()};`,
    `const founderScoreboardRegistryHtml=${founderScoreboardRegistryHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    const endpoint=${endpoint}; ${renderer}
    const metrics={requests:0,mutations:0,externalActions:0}; window.__LE_FOUNDER_SCOREBOARD_REGISTRY_METRICS=metrics;
    let loading=false;
    function host(){return document.querySelector("main#app #revenue.page-section.active, main#app #metrics.page-section.active");}
    function onRoute(){const r=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today");return r?.kind==="page"&&["revenue","metrics"].includes(r.canonicalRoute);}
    function mount(html){const target=host();if(!target)return;let slot=target.querySelector("[data-kpi-registry-slot]");if(!slot){slot=document.createElement("div");slot.setAttribute("data-kpi-registry-slot","");target.prepend(slot);}slot.innerHTML=html;}
    async function load(){if(!onRoute()||loading)return null;loading=true;metrics.requests+=1;
      try{const response=await fetch(endpoint,{credentials:"same-origin",headers:{accept:"application/json"}});
        const body=await response.json().catch(()=>({}));
        if(!onRoute())return null;
        // No registry block means the flag is off. Render nothing rather than an empty shell.
        if(!body||!body.registry){mount("");return null;}
        mount(founderScoreboardRegistryHtml(body.registry));
        return body;}
      catch{if(onRoute())mount("");return null;}
      finally{loading=false;}}
    function routeChanged(){if(onRoute())void load();}
    window.addEventListener("hashchange",routeChanged);
    window.__LE_FOUNDER_SCOREBOARD_REGISTRY=Object.freeze({load:()=>load(),activate:routeChanged});
    routeChanged();
  })();`;
}
