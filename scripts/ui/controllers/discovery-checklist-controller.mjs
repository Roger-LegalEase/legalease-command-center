export function discoveryChecklistBrowserSource() {
  return `(() => {
    "use strict";
    let payload = null;
    const root = () => document.querySelector("[data-discovery-checklist]");
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
    function bind(contract = payload) {
      payload = contract || payload;
      const container = root(); if (!container || !payload || container.dataset.bound === "true") return;
      container.dataset.bound = "true";
      container.querySelectorAll("[data-checklist-action]").forEach((button) => button.addEventListener("click", () => {
        const item = payload.items?.find((entry) => entry.id === button.dataset.checklistAction);
        if (item) open(item.action, button);
      }));
    }
    document.addEventListener("vnext:discovery-checklist", (event) => bind(event.detail?.payload));
    window.__LE_DISCOVERY_CHECKLIST = Object.freeze({ bind });
  })();`;
}
