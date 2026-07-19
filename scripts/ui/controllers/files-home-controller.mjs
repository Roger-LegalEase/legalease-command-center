import { FILES_HOME_ENDPOINT } from "../../ui-api/files-read.mjs";

export function filesHomeBrowserSource() {
  return `(() => {
    "use strict";
    const endpoint = ${JSON.stringify(FILES_HOME_ENDPOINT)};
    let pending = null;
    let nextCursor = null;
    const root = () => document.querySelector("[data-files-page]");
    const query = () => new URLSearchParams(String(location.hash || "").split("?")[1] || "");
    function openNew() {
      const create = document.querySelector(".vnext-create-trigger");
      create?.click();
      requestAnimationFrame(() => document.querySelector('[data-global-create-option="file-or-folder"]')?.click());
    }
    async function load({ append = false } = {}) {
      if (pending || !root()) return pending;
      const params = query();
      params.set("limit", "24");
      if (append && nextCursor) params.set("cursor", nextCursor);
      pending = fetch(endpoint + "?" + params, { credentials:"same-origin", headers:{ accept:"application/json" } })
        .then(async (response) => {
          if (response.status === 401) { document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
          if (response.status === 403) throw new Error("Files need additional access.");
          if (!response.ok) throw new Error("Files could not load. No records were changed.");
          const payload = await response.json();
          nextCursor = payload.pagination?.nextCursor || null;
          document.dispatchEvent(new CustomEvent("vnext:files-payload", { detail:{ payload, append } }));
          return payload;
        })
        .catch((error) => document.dispatchEvent(new CustomEvent("vnext:files-error", { detail:{ message:error.message } })))
        .finally(() => { pending = null; });
      return pending;
    }
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-files-new]")) openNew();
      const more = event.target.closest("[data-files-more]");
      if (more) load({ append:true });
    });
    document.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-files-filters]");
      if (!form) return;
      event.preventDefault();
      const params = new URLSearchParams(new FormData(form));
      location.hash = "files?" + params.toString();
    });
    window.__LE_FILES_HOME = Object.freeze({ load, openNew, endpoint });
  })();`;
}
