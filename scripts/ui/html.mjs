// Shared HTML boundary for server-side UI renderers. Values are text by default;
// callers cannot opt out of escaping or inject arbitrary attribute names.

const HTML_ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
});

const DATA_ATTRIBUTE_NAMES = Object.freeze({
  action: "data-action",
  id: "data-id",
  route: "data-route",
  state: "data-state",
  target: "data-target",
  testid: "data-testid"
});

function stringValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

export function escapeHtml(value = "") {
  return stringValue(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/[\u0000-\u001f\u007f`]/g, (character) => `&#${character.codePointAt(0)};`);
}

export function renderDataAttributes(attributes = {}) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return "";
  return Object.entries(DATA_ATTRIBUTE_NAMES)
    .flatMap(([key, attributeName]) => {
      const value = attributes[key];
      return value === null || value === undefined || value === false
        ? []
        : [` ${attributeName}="${escapeAttribute(value === true ? "true" : value)}"`];
    })
    .join("");
}

export const ALLOWED_DATA_ATTRIBUTE_KEYS = Object.freeze(Object.keys(DATA_ATTRIBUTE_NAMES));
