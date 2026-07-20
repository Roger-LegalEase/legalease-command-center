const FACT_KEYS = Object.freeze(["saved", "sent", "published", "uploaded", "changed"]);
const clean = (value = "") => String(value ?? "").trim();

const raw = Object.freeze({
  read_timeout:{
    title:"This page took too long to load",
    happened:"The compact page read timed out before a current response arrived.",
    didNotHappen:"No save, send, publish, upload, or record change was requested.",
    facts:{ saved:"no", sent:"no", published:"no", uploaded:"no", changed:"no" },
    nextAction:"Try the read again when the connection is stable.", preserveEnteredWork:true, automaticRetrySafe:true
  },
  write_timeout:{
    title:"The save result could not be confirmed",
    happened:"The save request timed out before the Command Center could confirm its result.",
    didNotHappen:"Nothing was sent, published, or uploaded by this save.",
    facts:{ saved:"unknown", sent:"no", published:"no", uploaded:"no", changed:"unknown" },
    nextAction:"Keep this work open, reconnect, and check the saved record before trying again.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  network_loss_during_save:{
    title:"Connection lost while saving",
    happened:"The connection ended before the Command Center could confirm the save result.",
    didNotHappen:"Nothing was sent, published, or uploaded by this save.",
    facts:{ saved:"unknown", sent:"no", published:"no", uploaded:"no", changed:"unknown" },
    nextAction:"Your entered work is still here. Reconnect and check the saved record before trying again.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  third_party_publishing_failure:{
    title:"Publishing did not complete",
    happened:"The publishing provider returned a failure and no successful publication was confirmed.",
    didNotHappen:"The failed channel was not marked Published and will not retry automatically.",
    facts:{ saved:"yes", sent:"no", published:"no", uploaded:"no", changed:"yes" },
    nextAction:"Review the channel result and connection, then choose an eligible retry explicitly.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  partial_multi_channel_publishing:{
    title:"Some channels published and others did not",
    happened:"At least one channel confirmed publication while another channel failed.",
    didNotHappen:"Successful channels were not rolled back and will never be included in an automatic retry.",
    facts:{ saved:"yes", sent:"no", published:"partial", uploaded:"no", changed:"yes" },
    nextAction:"Review each channel result and retry only an eligible failed channel after approval.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  sendgrid_rejection:{
    title:"SendGrid rejected the message",
    happened:"SendGrid returned a rejection before a successful delivery handoff was confirmed.",
    didNotHappen:"The recipient was not counted as sent and the message will not retry automatically.",
    facts:{ saved:"yes", sent:"no", published:"no", uploaded:"no", changed:"yes" },
    nextAction:"Review the rejection and suppression state before choosing a safe retry.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  expired_authorization:{
    title:"Your authorization expired",
    happened:"The current session or provider authorization is no longer valid.",
    didNotHappen:"The blocked action did not save, send, publish, upload, or change a record.",
    facts:{ saved:"no", sent:"no", published:"no", uploaded:"no", changed:"no" },
    nextAction:"Sign in or reconnect the provider, then review the current record before acting again.", preserveEnteredWork:false, automaticRetrySafe:false
  },
  supabase_unavailable:{
    title:"Storage is temporarily unavailable",
    happened:"The required durable Supabase store could not be reached.",
    didNotHappen:"The Command Center failed closed; nothing was saved, sent, published, uploaded, or changed.",
    facts:{ saved:"no", sent:"no", published:"no", uploaded:"no", changed:"no" },
    nextAction:"Wait for storage health to recover, then reload the current saved record.", preserveEnteredWork:true, automaticRetrySafe:true
  },
  missing_asset:{
    title:"This asset is unavailable",
    happened:"The requested asset could not be found or safely read.",
    didNotHappen:"No record was saved, sent, published, uploaded, or changed.",
    facts:{ saved:"no", sent:"no", published:"no", uploaded:"no", changed:"no" },
    nextAction:"Return to the record and choose an available reviewed asset.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  invalid_route:{
    title:"Page not found",
    happened:"The requested route is invalid, incomplete, or no longer canonical.",
    didNotHappen:"Opening this link did not save, send, publish, upload, or change anything.",
    facts:{ saved:"no", sent:"no", published:"no", uploaded:"no", changed:"no" },
    nextAction:"Go to Today or Search for the exact current record.", preserveEnteredWork:true, automaticRetrySafe:false
  },
  stale_browser_action:{
    title:"The saved record changed",
    happened:"The action was rejected because this browser copy is older than the saved record.",
    didNotHappen:"The stale action did not save, send, publish, upload, or overwrite the current record.",
    facts:{ saved:"no", sent:"no", published:"no", uploaded:"no", changed:"no" },
    nextAction:"Reload the saved copy, review the differences, and choose the action again.", preserveEnteredWork:true, automaticRetrySafe:false
  }
});

function freezeFailure(key, value) {
  const facts = Object.freeze(Object.fromEntries(FACT_KEYS.map((fact) => [fact, clean(value.facts?.[fact]) || "unknown"])));
  return Object.freeze({ key, ...value, facts });
}

export const VNEXT_RECOVERY_FAILURES = Object.freeze(Object.fromEntries(
  Object.entries(raw).map(([key, value]) => [key, freezeFailure(key, value)])
));

export function vnextRecoveryFailure(key = "") {
  return VNEXT_RECOVERY_FAILURES[clean(key)] || null;
}

export function recoveryTruthSentence(failure = {}) {
  const facts = failure.facts || {};
  return `Saved: ${facts.saved || "unknown"}. Sent: ${facts.sent || "unknown"}. Published: ${facts.published || "unknown"}. Uploaded: ${facts.uploaded || "unknown"}. Changed: ${facts.changed || "unknown"}.`;
}
