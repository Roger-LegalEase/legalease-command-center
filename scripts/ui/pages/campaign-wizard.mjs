import { CAMPAIGN_WIZARD_ENDPOINT_PREFIX, CAMPAIGN_WIZARD_STEPS } from "../../campaign-wizard-service.mjs";
import { escapeAttribute, escapeHtml } from "../html.mjs";

export const CAMPAIGN_WIZARD_STYLESHEET_PATH = "assets/ui/campaign-wizard.css";

export function renderCampaignWizardState(kind = "loading") {
  const states = {
    loading:["Loading Campaign draft", "The latest saved Campaign draft is loading."],
    empty:["Campaign draft unavailable", "Create or open an authorized Campaign draft to continue."],
    error:["Campaign draft could not load", "Nothing was changed. Try again when the service is available."],
    unauthorized:["Campaign access required", "This account cannot view or change this Campaign draft."],
    session_expired:["Session expired", "Sign in again before continuing. Unsaved changes were not sent."]
  };
  const [title, message] = states[kind] || states.error;
  return `<section class="campaign-wizard-state" data-wizard-state="${escapeAttribute(kind)}" role="${kind === "error" || kind === "session_expired" ? "alert" : "status"}"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></section>`;
}

export function renderCampaignWizardShell({ stableIdentity = "", activeStep = "goal" } = {}) {
  const selected = CAMPAIGN_WIZARD_STEPS.some((step) => step.key === activeStep) ? activeStep : "goal";
  const progress = CAMPAIGN_WIZARD_STEPS.map((step) => `<li class="campaign-wizard-progress__step${step.key === selected ? " is-active" : ""}" data-wizard-progress="${escapeAttribute(step.key)}"${step.key === selected ? ' aria-current="step"' : ""}><span>${step.order}</span>${escapeHtml(step.label)}</li>`).join("");
  return `<section class="campaign-wizard" data-campaign-wizard data-campaign-identity="${escapeAttribute(stableIdentity)}" data-wizard-step="${escapeAttribute(selected)}" aria-labelledby="campaign-wizard-title">
    <header><p class="campaign-wizard-eyebrow">Outreach campaign</p><h1 id="campaign-wizard-title">Campaign draft</h1><p>Build the Campaign one clear step at a time. Nothing sends from this workspace.</p></header>
    <ol class="campaign-wizard-progress" aria-label="Campaign setup progress">${progress}</ol>
    <div class="campaign-wizard-status" data-wizard-status role="status" aria-live="polite">Loading saved draft…</div>
    <form data-wizard-form novalidate>
      <section class="campaign-wizard-panel" data-wizard-panel aria-labelledby="campaign-wizard-step-title"><h2 id="campaign-wizard-step-title">${escapeHtml(CAMPAIGN_WIZARD_STEPS.find((step) => step.key === selected)?.label || "Goal")}</h2><div data-wizard-fields></div></section>
      <div class="campaign-wizard-actions"><button type="button" data-wizard-back>Back</button><button type="button" data-wizard-save>Save draft</button><button type="button" data-wizard-next>Next</button></div>
    </form>
  </section>`;
}

export function campaignWizardBrowserSource() {
  const steps = JSON.stringify(CAMPAIGN_WIZARD_STEPS).replaceAll("<", "\\u003c");
  const endpointPrefix = JSON.stringify(CAMPAIGN_WIZARD_ENDPOINT_PREFIX);
  return `(() => {
    "use strict";
    const steps=${steps}; const endpointPrefix=${endpointPrefix};
    let payload=null; let candidate=null; let saving=false;
    const root=()=>document.querySelector("[data-campaign-wizard]");
    const active=()=>root()?.dataset.wizardStep||"goal";
    const index=()=>Math.max(0,steps.findIndex((step)=>step.key===active()));
    const endpoint=()=>endpointPrefix+"/"+encodeURIComponent(root()?.dataset.campaignIdentity||"")+"/draft";
    function status(message){const node=root()?.querySelector("[data-wizard-status]");if(node)node.textContent=message;}
    function setStep(key,{recordHistory=true}={}){if(!steps.some((step)=>step.key===key))return;root().dataset.wizardStep=key;root().querySelectorAll("[data-wizard-progress]").forEach((node)=>{const current=node.dataset.wizardProgress===key;node.classList.toggle("is-active",current);if(current)node.setAttribute("aria-current","step");else node.removeAttribute("aria-current");});root().querySelector("#campaign-wizard-step-title").textContent=steps.find((step)=>step.key===key).label;renderFields();sync();if(recordHistory)window.history.pushState({wizardStep:key},"",location.href.replace(/([?&])step=[^&]*/,"$1step="+key));}
    function renderFields(){const target=root()?.querySelector("[data-wizard-fields]");if(!target)return;target.replaceChildren();const note=document.createElement("p");note.className="campaign-wizard-step-note";note.textContent="This step’s saved fields are loaded from the authoritative Campaign draft.";target.append(note);}
    function sync(){const position=index();root().querySelector("[data-wizard-back]").disabled=position===0;root().querySelector("[data-wizard-next]").disabled=position===steps.length-1;}
    function dirty(){return JSON.stringify(candidate)!==JSON.stringify(payload?.draft);}
    async function save(){if(saving||!dirty())return; saving=true;status("Saving draft…");const step=active();const response=await fetch(endpoint(),{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({step,fields:candidate[step]||{},expectedVersion:payload.draftVersion})});if(!response.ok){status("Draft was not saved. No Campaign action ran.");saving=false;return;}const result=await response.json();payload={...payload,draft:structuredClone(candidate),draftVersion:result.draftVersion};status("Draft saved.");saving=false;}
    async function load(){const response=await fetch(endpoint(),{credentials:"same-origin",headers:{accept:"application/json"}});if(!response.ok){status("Campaign draft is unavailable.");return;}payload=await response.json();candidate=structuredClone(payload.draft);setStep(new URLSearchParams(String(location.hash).split("?")[1]||"").get("step")||payload.draft.lastStep||"goal",{recordHistory:false});status(payload.draft.savedAt?"Saved draft restored.":"Draft ready. Nothing has been saved yet.");}
    function bind(){root()?.querySelector("[data-wizard-back]")?.addEventListener("click",()=>setStep(steps[index()-1]?.key));root()?.querySelector("[data-wizard-next]")?.addEventListener("click",()=>setStep(steps[index()+1]?.key));root()?.querySelector("[data-wizard-save]")?.addEventListener("click",save);window.addEventListener("popstate",(event)=>setStep(event.state?.wizardStep||new URLSearchParams(String(location.hash).split("?")[1]||"").get("step")||"goal",{recordHistory:false}));window.addEventListener("beforeunload",(event)=>{if(!dirty())return;event.preventDefault();event.returnValue="";});}
    if(root()){bind();renderFields();sync();load();}
    window.__LE_CAMPAIGN_WIZARD={setStep,hasUnsavedChanges:dirty,setCandidate:(value)=>{candidate=structuredClone(value);}};
  })();`;
}
