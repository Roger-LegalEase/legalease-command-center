export async function safeFetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 8000);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, { ...options, signal: controller?.signal });
    const contentType = response.headers?.get?.("content-type") || "";
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        contentType,
        safeMessage: response.status === 401 || response.status === 403
          ? "Please sign in again."
          : "This data is temporarily unavailable.",
        bodyPreview: text.slice(0, 160)
      };
    }
    try {
      return { ok: true, status: response.status, contentType, data: text ? JSON.parse(text) : {} };
    } catch {
      return { ok: false, status: response.status, contentType, safeMessage: "The server returned unreadable data.", bodyPreview: text.slice(0, 160) };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorName: error.name || "Error",
      aborted: error.name === "AbortError",
      timeoutMs,
      safeMessage: error.name === "AbortError" ? "The request timed out. Try again." : "The request could not be completed."
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
