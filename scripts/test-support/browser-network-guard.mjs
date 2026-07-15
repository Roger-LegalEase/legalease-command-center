// Loaded only in the disposable browser-test preview-server processes. The production
// application stays untouched; server-side provider reads become deterministic failures.
const nativeFetch = globalThis.fetch;

globalThis.fetch = async function browserTestFetch(input, init) {
  const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
  const url = new URL(String(raw || ""), "http://127.0.0.1");
  if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    return nativeFetch(input, init);
  }
  throw new TypeError(`External network is disabled in browser tests (${url.hostname || "unknown host"}).`);
};
