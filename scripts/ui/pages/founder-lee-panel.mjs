// Founder OS Release 7 — the Le-E side panel host.
//
// Served as a LAZY RUNTIME FILE so it costs the initial client-JavaScript budget nothing.
//
// It changes WHERE Le-E is, never WHAT Le-E may do. This file therefore contains no action of
// its own: it opens a panel, shows Le-E's proposals, and every proposal links to the existing
// approval surface. There is no send, publish, release or unsuppress path here, and there could
// not be — the panel never posts anything.
//
// The Release 6 confirmation contract governs behaviour: internal actions take no confirmation
// and the one-confirmation list is unreachable from Le-E's apply path. That is enforced in the
// applier and asserted by scripts/test-founder-os-lee-panel.mjs; this surface simply cannot
// widen it, because it performs no writes at all.

import { escapeAttribute, escapeHtml } from "../html.mjs";

export const FOUNDER_LEE_PANEL_STYLESHEET_PATH = "assets/ui/founder-lee-panel.css";

const clean = (value = "") => String(value ?? "").trim();

function proposalHtml(proposal) {
  const status = clean(proposal.status) || "pending";
  return `<li class="lee-proposal" data-lee-proposal="${escapeAttribute(proposal.id || "")}" data-status="${escapeAttribute(status)}">
    <p class="lee-proposal-title">${escapeHtml(proposal.title || "Suggestion")}</p>
    ${proposal.rationale ? `<p class="lee-proposal-why">${escapeHtml(proposal.rationale)}</p>` : ""}
    <p class="lee-proposal-status">${escapeHtml(status === "pending" ? "Waiting for your decision" : status)}</p>
  </li>`;
}

export function founderLeePanelHtml(payload = null) {
  const proposals = Array.isArray(payload?.proposals) ? payload.proposals : [];
  return `<aside class="lee-panel" data-lee-panel hidden aria-label="Le-E" role="complementary">
    <header class="lee-panel-header">
      <h2>Le-E</h2>
      <button type="button" data-lee-panel-close aria-label="Close Le-E">Close</button>
    </header>
    <p class="lee-panel-note">Le-E proposes. Nothing here sends, publishes, releases an audience or removes a suppression — those need your confirmation on the surface that owns them.</p>
    ${proposals.length
      ? `<ul class="lee-proposals">${proposals.map(proposalHtml).join("")}</ul>`
      : `<p class="lee-panel-empty" role="status">No suggestions waiting.</p>`}
    <p class="lee-panel-link"><a href="#lee" data-lee-panel-full>Open the full Le-E page</a></p>
  </aside>`;
}

export function founderLeePanelBrowserSource() {
  const renderer = [
    `const clean=${clean.toString()};`,
    `const escapeHtml=(value="")=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);`,
    `const escapeAttribute=(value="")=>escapeHtml(value).replace(/[\\u0000-\\u001f\\u007f\\x60]/g,character=>"&#"+character.codePointAt(0)+";");`,
    `const proposalHtml=${proposalHtml.toString()};`,
    `const founderLeePanelHtml=${founderLeePanelHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    ${renderer}
    // Read-only by construction: this runtime issues no fetch and no POST. It renders proposals
    // already present in the boot payload and links to the surfaces that own every action.
    const metrics={opens:0,mutations:0,externalActions:0}; window.__LE_FOUNDER_LEE_PANEL_METRICS=metrics;
    function shell(){return document.querySelector("main#app");}
    function ensure(){
      if(document.querySelector("[data-lee-panel]"))return document.querySelector("[data-lee-panel]");
      const target=shell(); if(!target)return null;
      const holder=document.createElement("div"); holder.setAttribute("data-lee-panel-host","");
      holder.innerHTML=founderLeePanelHtml(window.__LE_LEE_PROPOSALS||null);
      target.append(holder);
      const panel=holder.querySelector("[data-lee-panel]");
      panel?.querySelector("[data-lee-panel-close]")?.addEventListener("click",()=>toggle(false));
      return panel;
    }
    function toggle(open){
      const panel=ensure(); if(!panel)return;
      if(open===undefined)open=panel.hasAttribute("hidden");
      if(open){panel.removeAttribute("hidden");metrics.opens+=1;panel.querySelector("h2")?.focus?.();}
      else panel.setAttribute("hidden","");
    }
    // Available from EVERY workspace: the trigger is bound on the shell, not on one route.
    document.addEventListener("click",event=>{
      if(event.target.closest("[data-lee-open], [data-nav-item='lee'], [data-shell-control='lee']")){event.preventDefault();toggle(true);}
    });
    document.addEventListener("keydown",event=>{ if(event.key==="Escape")toggle(false); });
    window.__LE_FOUNDER_LEE_PANEL=Object.freeze({open:()=>toggle(true),close:()=>toggle(false),toggle:()=>toggle(),activate:()=>ensure()});
    ensure();
  })();`;
}
