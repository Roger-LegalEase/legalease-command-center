import { roleHasCapability } from "./roles.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

export const DISCOVERY_CHECKLIST_ENDPOINT = "/api/ui/discovery/checklist";

export const DISCOVERY_CHECKLIST_ITEMS = Object.freeze([
  Object.freeze({ id:"brand-assets", label:"Add brand assets", action:Object.freeze({ kind:"route", href:"#files?collection=brand-assets", expectedDestination:"Files" }) }),
  Object.freeze({ id:"social-connection", label:"Connect a social channel", action:Object.freeze({ kind:"route", href:"#settings?view=social-connections", expectedDestination:"Settings" }) }),
  Object.freeze({ id:"partner", label:"Add a Partner", action:Object.freeze({ kind:"global-create", workflowId:"partner", expectedDestination:"Partners" }) }),
  Object.freeze({ id:"social-post", label:"Create a Social Post", action:Object.freeze({ kind:"global-create", workflowId:"social-post", expectedDestination:"Social" }) }),
  Object.freeze({ id:"outreach-campaign", label:"Create an Outreach Campaign", action:Object.freeze({ kind:"global-create", workflowId:"outreach-campaign", expectedDestination:"Outreach" }) }),
  Object.freeze({ id:"investor-room-file", label:"Add an Investor Room File", action:Object.freeze({ kind:"file-upload", href:"#files?collection=investor-room", collection:"investor-room", expectedDestination:"Files" }) })
]);

export class DiscoveryChecklistError extends Error {
  constructor(message, status = 400) { super(message); this.name = "DiscoveryChecklistError"; this.status = status; this.safeMessage = message; }
}

function authorize(actor = {}) {
  if (actor.authenticated !== true || !clean(actor.id) || !roleHasCapability(actor.role, "read_internal")) {
    throw new DiscoveryChecklistError("The setup checklist is not available for this account.", 403);
  }
}

function sourceState(source = {}, complete = false, completeDetail = "Complete") {
  if (source.authorized === false) return Object.freeze({ key:"unauthorized", label:"Additional access needed", complete:false, detail:"This account is not allowed to verify this setup item." });
  if (source.available !== true) return Object.freeze({ key:"unavailable", label:"Unavailable", complete:false, detail:clean(source.reason) || "Current setup truth is unavailable." });
  return complete
    ? Object.freeze({ key:"complete", label:"Done", complete:true, detail:completeDetail })
    : Object.freeze({ key:"incomplete", label:"Not started", complete:false, detail:clean(source.reason) || "Open the setup workflow to continue." });
}

function positiveCount(source = {}) {
  return Number.isSafeInteger(source.total) && source.total >= 0 ? source.total : null;
}

function itemTruth(id, sources = {}) {
  if (id === "brand-assets") {
    const source = sources.brandAssets || {};
    const selectable = list(source.items).filter((item) => item.approved === true && item.selectable === true && clean(item.sourceReference?.collection) && clean(item.sourceReference?.sourceId));
    return sourceState(source, selectable.length > 0, `${selectable.length} approved brand asset${selectable.length === 1 ? "" : "s"} available.`);
  }
  if (id === "social-connection") {
    const source = sources.socialConnections || {};
    const connected = list(source.items).filter((item) => ["connected_publishing_off", "ready_to_publish"].includes(clean(item.state)) && item.serverVerified === true);
    return sourceState(source, connected.length > 0, `${connected.length} verified social connection${connected.length === 1 ? "" : "s"}.`);
  }
  if (id === "partner") {
    const source = sources.partners || {};
    const total = positiveCount(source);
    return sourceState({ ...source, available:source.available === true && total !== null }, total > 0, `${total || 0} Partner${total === 1 ? "" : "s"} added.`);
  }
  if (id === "social-post") {
    const source = sources.socialPosts || {};
    const total = positiveCount(source);
    return sourceState({ ...source, available:source.available === true && total !== null }, total > 0, `${total || 0} Social Post${total === 1 ? "" : "s"} created.`);
  }
  if (id === "outreach-campaign") {
    const source = sources.outreachCampaigns || {};
    const total = positiveCount(source);
    return sourceState({ ...source, available:source.available === true && total !== null }, total > 0, `${total || 0} Outreach Campaign${total === 1 ? "" : "s"} created.`);
  }
  if (id === "investor-room-file") {
    const source = sources.investorRoom || {};
    const currentRequirements = Number.isSafeInteger(source.currentRequirements) && source.currentRequirements >= 0 ? source.currentRequirements : null;
    return sourceState({ ...source, available:source.available === true && currentRequirements !== null }, currentRequirements > 0, `${currentRequirements || 0} explicit Investor Room requirement${currentRequirements === 1 ? " is" : "s are"} current.`);
  }
  return sourceState({}, false);
}

export function buildSetupChecklist({ actor = {}, sources = {}, now = "" } = {}) {
  authorize(actor);
  const generatedAt = clean(now);
  if (!Number.isFinite(Date.parse(generatedAt))) throw new DiscoveryChecklistError("A valid server timestamp is required.");
  const items = DISCOVERY_CHECKLIST_ITEMS.map((definition) => Object.freeze({ ...definition, status:itemTruth(definition.id, sources) }));
  const complete = items.filter((item) => item.status.complete).length;
  return Object.freeze({
    ok:true,
    authorized:true,
    generatedAt,
    title:"Set up your Command Center",
    description:"Each item is checked against current authorized product state.",
    progress:Object.freeze({ complete, total:items.length, percentage:Math.round((complete / items.length) * 100) }),
    items:Object.freeze(items),
    capabilities:Object.freeze({ mutatesDomainState:false, browserCompletionAuthority:false })
  });
}
