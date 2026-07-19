import { DISCOVERY_EMPTY_STATE_DEFINITIONS } from "../../discovery-empty-states.mjs";

export function discoveryEmptyStateBrowserSource() {
  const definitions = JSON.stringify(DISCOVERY_EMPTY_STATE_DEFINITIONS).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const definitions = ${definitions};
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
  })();`;
}
