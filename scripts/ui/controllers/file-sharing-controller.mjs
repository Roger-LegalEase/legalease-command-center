export function fileSharingBrowserSource() {
  return `(() => {
    "use strict";
    const root = document.querySelector("[data-file-sharing]");
    if (!root) return;
    let pending = false;
    const status = root.querySelector("[data-file-access-status]");
    async function mutate(action, targetRole, trigger) {
      if (pending) return;
      pending = true;
      trigger.disabled = true;
      status.textContent = action === "grant" ? "Granting access…" : "Revoking access…";
      const endpoint = "/api/ui/files/" + encodeURIComponent(root.dataset.sourceKind) + "/" + encodeURIComponent(root.dataset.sourceId) + "/access/" + action;
      try {
        const response = await fetch(endpoint, { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ targetRole, requestId:crypto.randomUUID() }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok !== true) throw new Error(payload.error || "Access did not change.");
        status.textContent = action === "grant" ? "Access granted." : "Access revoked immediately.";
        document.dispatchEvent(new CustomEvent("vnext:file-access-changed", { detail:payload }));
      } catch (error) { status.textContent = (error.message || "Access did not change.") + " Refresh before trying again."; }
      finally { pending = false; trigger.disabled = false; }
    }
    root.addEventListener("submit", (event) => { const form = event.target.closest("[data-file-access-form]"); if (!form) return; event.preventDefault(); mutate("grant", form.elements.targetRole.value, form.querySelector('button[type="submit"]')); });
    root.addEventListener("click", (event) => { const button = event.target.closest('[data-file-access-action="revoke"]'); if (button) mutate("revoke", button.dataset.targetRole, button); });
  })();`;
}
