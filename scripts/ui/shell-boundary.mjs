// CCX-003 composition contract. Renderers are injected so this selector owns no
// application state, route handling, authorization, storage, or business behavior.

export const SHELL_MODES = Object.freeze({
  legacy: "legacy",
  vnext: "vnext"
});

export function shellModeForConfig(config = {}) {
  return config?.enabled === true ? SHELL_MODES.vnext : SHELL_MODES.legacy;
}

export function renderShellBoundary({ config, renderLegacyApp, renderVNextApp } = {}) {
  if (typeof renderLegacyApp !== "function" || typeof renderVNextApp !== "function") {
    throw new TypeError("Both application shell renderers are required.");
  }

  return shellModeForConfig(config) === SHELL_MODES.vnext
    ? renderVNextApp()
    : renderLegacyApp();
}
