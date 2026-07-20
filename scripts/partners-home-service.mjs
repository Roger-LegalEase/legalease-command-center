import { roleHasCapability, roles } from "./roles.mjs";
import { PARTNERS_HOME_VIEWS, buildPartnersHomeView } from "./ui/view-models/partners-home.mjs";

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const allowedViews = new Set(PARTNERS_HOME_VIEWS.map((view) => view.key));

export const PARTNERS_HOME_ENDPOINT = "/api/ui/partners";
export const PARTNERS_HOME_LIMITS = Object.freeze({ default:24, maximum:50 });

export class PartnersHomeValidationError extends Error {
  constructor(message, status = 400) { super(message); this.name = "PartnersHomeValidationError"; this.status = status; }
}

function authorizedActor(actor = {}) {
  const role = lower(actor.role);
  return actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal");
}

function choice(value, allowed, label) {
  const selected = lower(value);
  if (!selected) return "";
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(selected) || allowed && !allowed.has(selected)) throw new PartnersHomeValidationError(`The selected ${label} is invalid.`);
  return selected;
}

function search(value) {
  const text = clean(value);
  if (text.length > 120 || /[\u0000-\u001f\u007f<>"'`\\]/u.test(text)) throw new PartnersHomeValidationError("The Partner search is invalid.");
  return text;
}

function limit(value) {
  if (value === undefined || value === null || value === "") return PARTNERS_HOME_LIMITS.default;
  if (!/^\d{1,3}$/.test(String(value))) throw new PartnersHomeValidationError("The Partner page size is invalid.");
  const parsed = Number(value);
  if (parsed < 1 || parsed > PARTNERS_HOME_LIMITS.maximum) throw new PartnersHomeValidationError("The Partner page size is out of range.");
  return parsed;
}

function cursor(value = "") {
  const opaque = clean(value);
  if (!opaque) return 0;
  let decoded = "";
  try { decoded = Buffer.from(opaque, "base64url").toString("utf8"); } catch { throw new PartnersHomeValidationError("The Partner cursor is invalid."); }
  const match = /^partners:(\d{1,8})$/.exec(decoded);
  if (!match || Buffer.from(decoded).toString("base64url") !== opaque) throw new PartnersHomeValidationError("The Partner cursor is invalid.");
  return Number(match[1]);
}

function nextCursor(offset) { return Buffer.from(`partners:${offset}`).toString("base64url"); }

export function buildAuthorizedPartnersHome(state = {}, actor = {}, now = "", rawQuery = {}) {
  if (!authorizedActor(actor)) throw new PartnersHomeValidationError("Partners are not available for this account.", 403);
  if (!Number.isFinite(Date.parse(now))) throw new PartnersHomeValidationError("A valid server timestamp is required.");
  const query = {
    view:choice(rawQuery.view || "list", allowedViews, "Partner view") || "list",
    search:search(rawQuery.search),
    stage:choice(rawQuery.stage, null, "Partner stage"),
    owner:choice(rawQuery.owner, null, "Partner owner"),
    health:choice(rawQuery.health, null, "Partner health"),
    limit:limit(rawQuery.limit),
    offset:cursor(rawQuery.cursor)
  };
  const projection = buildPartnersHomeView(state, actor, now, query);
  const cursorValue = projection.pagination?.hasMore ? nextCursor(query.offset + projection.items.length) : null;
  return Object.freeze({ ...projection, query:Object.freeze({ ...query, offset:undefined }), pagination:Object.freeze({ ...projection.pagination, nextCursor:cursorValue }) });
}
