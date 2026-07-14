const emailPattern = new RegExp(["[A-Z0-9._%+-]+", "@", "[A-Z0-9.-]+", "\\.[A-Z]{2,}"].join(""), "gi");
const phonePattern = /(?:\+1[ .-]?)?\([2-9]\d{2}\)[ .-]?\d{3}[ .-]?\d{4}\b|\+1[ .-][2-9]\d{2}[ .-]\d{3}[ .-]\d{4}\b/g;
const tokenPatterns = [
  new RegExp(["\\b(?:sk|rk|pk)", "-[A-Za-z0-9_-]{20,}"].join(""), "g"),
  new RegExp(["SG", "\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}"].join(""), "g"),
  new RegExp(["xox", "[abprs]-[A-Za-z0-9-]{20,}"].join(""), "g"),
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /(?:postgres(?:ql)?|mysql):\/\/[^\s:@/]+:[^\s@/]+@/gi
];
const sensitivePathPattern = /(?:^|\/)[^/]*(?:suppression|bounces?|spam[_-]?reports?|provider[_-]?activity|sendgrid[_-]?activity|reconciliation|campaign[_-]?ledger|recipient[_-]?export|operational[_-]?(?:dump|export))[^/]*\.(?:csv|json|jsonl|txt|xlsx?)$/i;
const exactSensitivePaths = new Set([
  "docs/ebd3dae7-5a52-4be4-a6fa-5a842780637a.csv",
  "docs/phaseb-20260709-reconciliation-diff.json"
]);
const reservedDomains = new Set(["example.com", "example.org", "example.net", "localhost.invalid"]);

export function detectSecurityFindings(text = "", filePath = "") {
  const categories = new Map();
  if (sensitivePathPattern.test(filePath) || exactSensitivePaths.has(String(filePath).replaceAll("\\", "/"))) categories.set("sensitive_export_path", 1);
  const emails = [...String(text).matchAll(emailPattern)].filter((match) => {
    const domain = String(match[0]).split("@").pop().toLowerCase();
    return !reservedDomains.has(domain) && !/\.(?:test|invalid|localhost)$/.test(domain);
  });
  if (emails.length) categories.set("non_reserved_email", emails.length);
  const phones = [...String(text).matchAll(phonePattern)].filter((match) => !/555[ .-]?01\d{2}/.test(match[0]));
  if (phones.length) categories.set("phone_number", phones.length);
  const tokens = tokenPatterns.reduce((count, pattern) => count + [...String(text).matchAll(pattern)].length, 0);
  if (tokens) categories.set("high_confidence_secret", tokens);
  return categories;
}
