import { roleHasCapability } from "./roles.mjs";
const CHANNELS = Object.freeze(["linkedin","instagram","facebook","x","threads"]);
const LABELS = Object.freeze({ linkedin:"LinkedIn", instagram:"Instagram", facebook:"Facebook", x:"X", threads:"Threads" });
const clean = (value = "") => String(value ?? "").trim();
export const SOCIAL_CONNECTIONS_READ_COLLECTIONS = Object.freeze(["socialAccounts"]);

export function buildSocialConnectionsContract(state = {}, actor = {}, now = "") {
  if (actor?.authenticated !== true || !roleHasCapability(actor.role, "read_internal")) return { ok:false, generatedAt:clean(now), connections:[] };
  const accounts = Array.isArray(state.socialAccounts) ? state.socialAccounts : [];
  const gates = state.runtime?.livePostingGates || {};
  const connections = CHANNELS.map((channel) => {
    const matches = accounts.filter((account) => clean(account.platform || account.channel).toLowerCase() === channel);
    let key = "not_connected";
    if (matches.length > 1) key = "needs_attention";
    else if (matches.length === 1) {
      const status = clean(matches[0].status).toLowerCase();
      if (matches[0].connected !== true || /error|expired|attention|invalid/.test(status)) key = "needs_attention";
      else if (gates[channel] === true) key = "ready_to_publish";
      else if (gates[channel] === false) key = "connected_publishing_off";
      else key = "needs_attention";
    }
    const labels = { not_connected:"Not connected", connected_publishing_off:"Connected, publishing off", ready_to_publish:"Ready to publish", needs_attention:"Needs attention" };
    return { channel, label:LABELS[channel], state:{ key, label:labels[key] }, connectionId:matches.length === 1 ? clean(matches[0].id) || null : null, canEnableGate:false, exposesCredentials:false };
  });
  return { ok:true, generatedAt:clean(now), connections, capabilities:{ reads:true, connects:false, changesEnvironmentGate:false, exposesCredentials:false } };
}
