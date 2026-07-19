export function fileDetailsBrowserSource() {
  return `(() => {
    "use strict";
    const root = document.querySelector("[data-file-details]");
    if (!root) return;
    const tabs = [...root.querySelectorAll("[data-file-tab]")];
    function select(tab) {
      tabs.forEach((control) => control.setAttribute("aria-selected", control === tab ? "true" : "false"));
      root.querySelectorAll("[data-file-panel]").forEach((panel) => { panel.hidden = panel.dataset.filePanel !== tab.dataset.fileTab; });
      tab.focus();
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        select(tabs[next]);
      });
    });
    const textPreview = root.querySelector("[data-file-text-preview]");
    if (textPreview?.dataset.source) fetch(textPreview.dataset.source, { credentials:"same-origin", headers:{ accept:"text/plain" } })
      .then(async (response) => { if (!response.ok) throw new Error(); const text = await response.text(); textPreview.replaceChildren(Object.assign(document.createElement("pre"), { textContent:text.slice(0, 200000) })); })
      .catch(() => { textPreview.replaceChildren(Object.assign(document.createElement("p"), { textContent:"Preview could not load. No records were changed." })); });
  })();`;
}
