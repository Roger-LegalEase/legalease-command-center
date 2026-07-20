import { DISCOVERY_EMPTY_STATE_AREAS, DISCOVERY_EMPTY_STATE_DEFINITIONS, buildGuidedEmptyState } from "../../discovery-empty-states.mjs";

export function discoveryEmptyStateBrowserSource() {
  const definitions = JSON.stringify(DISCOVERY_EMPTY_STATE_DEFINITIONS).replaceAll("<", "\\u003c");
  const contracts = JSON.stringify(Object.fromEntries(DISCOVERY_EMPTY_STATE_AREAS.map((area) => [area, Object.fromEntries(["empty", "filtered-empty", "unavailable", "unauthorized"].map((state) => [state, buildGuidedEmptyState(area, { state })]))]))).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const definitions = ${definitions};
    const contracts = ${contracts};
    function render(container,area,state="empty") { const contract=contracts[area]?.[state]||contracts[area]?.empty;if(!container||!contract)return null;const section=document.createElement("section");section.className="guided-empty-state";section.dataset.guidedEmptyState=contract.area;section.dataset.guidedEmptyKind=contract.state;if(["unavailable","unauthorized"].includes(contract.state))section.setAttribute("role","alert");const icon=document.createElement("span");icon.className="guided-empty-icon";icon.setAttribute("aria-hidden","true");icon.textContent=contract.state==="unauthorized"?"◇":contract.state==="unavailable"?"!":"＋";const body=document.createElement("div");const title=document.createElement("h2");title.textContent=contract.title;const purpose=document.createElement("p");purpose.textContent=contract.purpose;const next=document.createElement("p");next.className="guided-empty-next";const strong=document.createElement("strong");strong.textContent="What happens next: ";next.append(strong,document.createTextNode(contract.next));body.append(title,purpose,next);if(contract.example){const example=document.createElement("p");example.className="guided-empty-example";example.textContent=contract.example;body.append(example);}const button=document.createElement("button");button.type="button";button.dataset.guidedEmptyAction=contract.action.kind;button.dataset.guidedEmptyArea=contract.area;button.textContent=contract.action.label;section.append(icon,body,button);container.replaceChildren(section);return section; }
    function safeRoute(action) { const result = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(action?.href || ""); return result?.kind === "page" && result.destination === action.expectedDestination ? result.safeHash : ""; }
    async function openFile(action, trigger) { const href=safeRoute(action); if(!href)return; location.hash=href.slice(1); await window.__LE_FILES?.load?.(); document.querySelector("[data-files-new]")?.click(); const select=document.querySelector('[data-file-upload-form] select[name="collection"]'); if(select&&action.collection)select.value=action.collection; trigger.dispatchEvent(new CustomEvent("vnext:guided-action-complete",{bubbles:true})); }
    document.addEventListener("click", (event) => {
      const button=event.target.closest("[data-guided-empty-action]"); if(!button)return;
      const definition=definitions[button.dataset.guidedEmptyArea];
      let action=definition?.action;
      if(button.dataset.guidedEmptyAction==="retry")return button.dispatchEvent(new CustomEvent("vnext:guided-retry",{bubbles:true}));
      if(button.dataset.guidedEmptyAction==="clear-filters")return button.dispatchEvent(new CustomEvent("vnext:guided-clear-filters",{bubbles:true}));
      if(button.dataset.guidedEmptyAction==="global-search")return window.__LE_GLOBAL_SEARCH?.open?.({returnTarget:button});
      if(action?.kind==="global-create")return window.__LE_GLOBAL_CREATE?.openWorkflow?.(action.workflowId,{returnTarget:button});
      if(action?.kind==="file-upload")return openFile(action,button);
      if(button.dataset.guidedEmptyAction==="route")action={kind:"route",href:"#today",expectedDestination:"Today"};
      const href=safeRoute(action); if(href)location.hash=href.slice(1);
    });
    window.__LE_DISCOVERY_EMPTY_STATES=Object.freeze({render});
  })();`;
}
