import { FILES_REPORT_GENERATE_ENDPOINT } from "../pages/files-report-actions.mjs";

export function filesReportBrowserSource() {
  return `(() => {
    "use strict";
    const form = document.querySelector("[data-files-report-form]");
    if (!form) return;
    let pending = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (pending || !form.reportValidity()) return;
      pending = true;
      const submit = form.querySelector('button[type="submit"]');
      const status = form.querySelector("[data-files-report-status]");
      submit.disabled = true;
      status.textContent = "Generating a private report draft…";
      try {
        const response = await fetch(${JSON.stringify(FILES_REPORT_GENERATE_ENDPOINT)}, { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json" }, body:JSON.stringify({ reportType:form.elements.reportType.value, requestId:crypto.randomUUID() }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok !== true) throw new Error(payload.error || "Report generation did not complete.");
        status.replaceChildren(document.createTextNode("Report draft created. "), Object.assign(document.createElement("a"), { href:payload.file.href, textContent:"Open preview" }));
      } catch (error) { status.textContent = (error.message || "Report generation did not complete.") + " No duplicate File was created."; }
      finally { pending = false; submit.disabled = false; }
    });
  })();`;
}
