import { DISCOVERY_CHECKLIST_ENDPOINT } from "../../discovery-checklist-service.mjs";

export function discoveryChecklistBrowserSource(contract = null) {
  const initial = JSON.stringify(contract).replaceAll("<", "\\u003c");
  const endpoint = JSON.stringify(DISCOVERY_CHECKLIST_ENDPOINT);
  return `(() => {
    "use strict";
    let payload = ${initial};
    const root = () => document.querySelector("[data-discovery-checklist]");
    const panel = () => document.querySelector("[data-discovery-checklist-panel]");
    const live = () => root()?.querySelector("[data-checklist-live]");
    function announce(message) { if (live()) live().textContent = message; }
    function safeRoute(action) { const result = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(action?.href || ""); return result?.kind === "page" && result.destination === action.expectedDestination ? result.safeHash : ""; }
    async function open(action, button) {
      if (action.kind === "global-create") return window.__LE_GLOBAL_CREATE?.openWorkflow?.(action.workflowId, { returnTarget:button });
      const href = safeRoute(action);
      if (!href) return announce("That setup workflow is unavailable. No setup state changed.");
      location.hash = href.slice(1);
      if (action.kind !== "file-upload") return;
      await window.__LE_FILES?.load?.();
      const trigger = document.querySelector("[data-files-new]");
      trigger?.click();
      const select = document.querySelector('[data-file-upload-form] select[name="collection"]');
      if (select) select.value = action.collection;
    }
    function apply(contract) {
      payload = contract || payload;
      const container=root();if(!container||!payload)return;
      const progress=payload.progress||{};const summary=container.querySelector(".discovery-checklist-progress strong");if(summary)summary.textContent=String(progress.complete||0)+"/"+String(progress.total||0);
      const meter=container.querySelector('[role="progressbar"]');if(meter){meter.setAttribute("aria-valuenow",String(progress.percentage||0));meter.firstElementChild?.setAttribute("style","width:"+Math.max(0,Math.min(100,Number(progress.percentage)||0))+"%");}
      for(const item of payload.items||[]){const row=container.querySelector('[data-checklist-item="'+CSS.escape(item.id)+'"]');if(!row)continue;row.dataset.checklistState=item.status?.key||"unavailable";const mark=row.querySelector(".discovery-checklist-mark");if(mark)mark.textContent=item.status?.complete?"✓":"○";const detail=row.querySelector("h2+p");if(detail)detail.textContent=item.status?.detail||"Current setup truth is unavailable.";const status=row.querySelector(".discovery-checklist-status");if(status)status.textContent=item.status?.label||"Unavailable";const button=row.querySelector("[data-checklist-action]");if(button)button.firstChild.textContent=item.status?.complete?"Open":"Set up";}
    }
    function bind(contract = payload) {
      payload = contract || payload;
      const container = root(); if (!container || !payload || container.dataset.bound === "true") return;
      container.dataset.bound = "true";
      container.querySelectorAll("[data-checklist-action]").forEach((button) => button.addEventListener("click", () => {
        const item = payload.items?.find((entry) => entry.id === button.dataset.checklistAction);
        if (item) open(item.action, button);
      }));
    }
    async function refresh(){try{const response=await fetch(${endpoint},{credentials:"same-origin",headers:{accept:"application/json"}});if(response.status===401){announce("Your session expired. Sign in again.");return null;}const next=await response.json().catch(()=>({}));if(!response.ok||next.ok!==true)throw new Error();apply(next);bind(next);return next;}catch{announce("Setup progress could not refresh. No setup state changed.");return null;}}
    async function show(returnTarget){const container=panel();if(!container)return;container._returnTarget=returnTarget||document.activeElement;container.hidden=false;await refresh();container.querySelector("[data-checklist-close]")?.focus();}
    function close(){const container=panel();if(!container)return;container.hidden=true;container._returnTarget?.isConnected&&container._returnTarget.focus();}
    document.addEventListener("vnext:discovery-checklist", (event) => bind(event.detail?.payload));
    document.addEventListener("click",event=>{const trigger=event.target.closest('[data-shell-action="open-discovery-checklist"]');if(trigger){event.preventDefault();show(trigger);}if(event.target.closest("[data-checklist-close]"))close();});
    panel()?.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();close();}});
    apply(payload);bind(payload);
    window.__LE_DISCOVERY_CHECKLIST = Object.freeze({ bind, refresh, open:show, close });
  })();`;
}
