import { FILE_UPLOAD_ENDPOINT } from "../pages/file-upload.mjs";

export function fileUploadBrowserSource() {
  return `(() => {
    "use strict";
    const dialog = document.querySelector("[data-file-upload-dialog]");
    const form = dialog?.querySelector("[data-file-upload-form]");
    if (!dialog || !form) return;
    let pending = false;
    let returnTarget = null;
    const status = dialog.querySelector("[data-file-upload-status]");
    function close() { if (pending) return; dialog.hidden = true; form.reset(); returnTarget?.focus(); }
    function open(trigger) { returnTarget = trigger; dialog.hidden = false; dialog.focus(); form.elements.name.focus(); }
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-files-upload]");
      if (trigger) open(trigger);
      if (event.target.closest("[data-file-upload-cancel]")) close();
    });
    dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (pending || !form.reportValidity()) return;
      const file = form.elements.file.files[0];
      if (!file) return;
      pending = true;
      [...form.elements].forEach((control) => { control.disabled = true; });
      status.textContent = "Uploading file…";
      const body = new FormData(form);
      body.set("requestId", crypto.randomUUID());
      try {
        const response = await fetch(${JSON.stringify(FILE_UPLOAD_ENDPOINT)}, { method:"POST", body, credentials:"same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok !== true) throw new Error(payload.error || "Upload did not complete.");
        status.textContent = "Upload complete.";
        location.hash = payload.href.slice(1);
      } catch (error) { status.textContent = (error.message || "Upload did not complete.") + " No File record was created."; }
      finally { pending = false; [...form.elements].forEach((control) => { control.disabled = false; }); }
    });
  })();`;
}
