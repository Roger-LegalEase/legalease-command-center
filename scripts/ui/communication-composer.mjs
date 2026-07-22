export const COMMUNICATION_COMPOSER_STYLESHEET_PATH = "assets/ui/communication-composer.css";
export const COMMUNICATION_COMPOSER_LAYOUT_STYLESHEET_PATH = "assets/ui/communication-composer-layout.css";
export const COMMUNICATION_CONTEXT_ENDPOINT = "/api/ui/communications/context";
export const COMMUNICATION_DRAFTS_ENDPOINT = "/api/ui/communications/drafts";

export function communicationComposerBrowserSource() {
  const contextEndpoint = JSON.stringify(COMMUNICATION_CONTEXT_ENDPOINT);
  const draftsEndpoint = JSON.stringify(COMMUNICATION_DRAFTS_ENDPOINT);
  return `(() => {
    "use strict";
    const contextEndpoint=${contextEndpoint};
    const draftsEndpoint=${draftsEndpoint};
    let current=null;
    let trigger=null;
    let busy=false;

    function cookieValue(name){
      const prefix=name+"=";
      const value=String(document.cookie||"").split(";").map((part)=>part.trim()).find((part)=>part.startsWith(prefix));
      if(!value)return "";
      try{return decodeURIComponent(value.slice(prefix.length));}catch{return "";}
    }
    function requestId(prefix){return prefix+"_"+(globalThis.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(16).slice(2)).replaceAll("-","_");}
    function dialog(){return document.querySelector("[data-communication-composer]");}
    function node(selector){return dialog()?.querySelector(selector)||null;}
    function ensureDialog(){
      if(dialog())return dialog();
      const layer=document.createElement("dialog");
      layer.className="founder-composer";
      layer.dataset.communicationComposer="true";
      layer.setAttribute("aria-labelledby","founder-composer-title");
      layer.innerHTML='<div class="founder-composer-frame">'
        +'<header class="founder-composer-header"><div><p class="founder-composer-eyebrow">Follow-up</p><h2 id="founder-composer-title" tabindex="-1">Draft a message</h2><p data-composer-heading-copy>Use the saved context, then make the draft your own.</p></div><button type="button" class="founder-composer-close" data-composer-close aria-label="Close message composer">×</button></header>'
        +'<div class="founder-composer-status" data-communication-composer-status role="status" aria-live="polite"></div>'
        +'<div class="founder-composer-loading" data-composer-loading><span aria-hidden="true"></span><div><strong>Preparing context</strong><p>Bringing the relationship and recent interaction into one place.</p></div></div>'
        +'<div class="founder-composer-error" data-composer-error hidden role="alert"><h3>Draft could not open</h3><p>No changes were made.</p><button type="button" data-composer-retry>Try again</button></div>'
        +'<div class="founder-composer-content" data-composer-content hidden>'
          +'<aside class="founder-composer-context" aria-label="Relationship context"><p class="founder-composer-eyebrow">Context</p><h3 data-composer-context-title>Relationship</h3><dl><div><dt>Organization</dt><dd data-composer-context-organization>Not set</dd></div><div><dt>Recent interaction</dt><dd data-composer-context-interaction>Not available</dd></div><div><dt>Related commitment</dt><dd data-composer-context-task>Not set</dd></div></dl><p data-composer-context-summary></p></aside>'
          +'<form class="founder-composer-form" data-communication-composer-form novalidate>'
            +'<input type="hidden" name="draftId" /><input type="hidden" name="expectedVersion" />'
            +'<div class="founder-composer-two"><label>Recipient<input name="recipientName" type="text" maxlength="160" autocomplete="name" /></label><label>Organization<input name="recipientOrganization" type="text" maxlength="200" autocomplete="organization" /></label></div>'
            +'<label>Email address<input name="recipient" type="email" maxlength="320" autocomplete="email" required /><span class="founder-composer-field-error" data-composer-field-error="recipient"></span></label>'
            +'<label>Subject<input name="subject" type="text" maxlength="240" required /><span class="founder-composer-field-error" data-composer-field-error="subject"></span></label>'
            +'<label>Message<textarea name="body" rows="13" maxlength="12000" required></textarea><span class="founder-composer-field-error" data-composer-field-error="body"></span></label>'
            +'<footer class="founder-composer-actions"><button class="is-primary" type="submit" data-communication-composer-save>Save draft</button><button type="button" data-composer-copy>Copy</button><button type="button" data-composer-gmail>Open in Gmail</button><button type="button" data-composer-manual-open>Mark as sent manually</button></footer>'
          +'</form>'
          +'<form class="founder-composer-manual" data-composer-manual hidden novalidate><div><p class="founder-composer-eyebrow">After sending</p><h3>Record the follow-up</h3><p>This records an internal activity only. It does not send an email.</p></div><label>Next follow-up date <span>(optional)</span><input name="nextFollowUpDate" type="date" /></label><label class="founder-composer-check"><input name="completeOriginatingTask" type="checkbox" checked /> Complete the related follow-up task</label><div class="founder-composer-manual-actions"><button class="is-primary" type="submit">Record sent</button><button type="button" data-composer-manual-cancel>Cancel</button></div></form>'
        +'</div>'
      +'</div>';
      document.body.append(layer);
      bind(layer);
      return layer;
    }
    function status(message,kind="success"){
      const target=node("[data-communication-composer-status]");
      if(!target)return;
      target.textContent=message||"";
      target.dataset.kind=message?kind:"";
    }
    function showError(message){
      node("[data-composer-loading]").hidden=true;
      node("[data-composer-content]").hidden=true;
      const target=node("[data-composer-error]");
      target.hidden=false;
      target.querySelector("p").textContent=message||"No changes were made. Try again.";
    }
    function setBusy(next,label="Saving…",button=null){
      busy=next;
      dialog()?.querySelectorAll("button,input,textarea").forEach((control)=>{if(!control.matches("[data-composer-close]"))control.disabled=next||control.dataset.policyDisabled==="true";});
      if(button){
        if(next){button.dataset.originalLabel=button.textContent;button.textContent=label;}
        else{button.textContent=button.dataset.originalLabel||button.textContent;delete button.dataset.originalLabel;}
      }
    }
    function fieldError(field,message){const target=node('[data-composer-field-error="'+field+'"]');if(target)target.textContent=message||"";}
    function clearErrors(){dialog()?.querySelectorAll("[data-composer-field-error]").forEach((target)=>{target.textContent="";});}
    function formValues(){
      const values=Object.fromEntries(new FormData(node("[data-communication-composer-form]")));
      return {draftId:String(values.draftId||""),expectedVersion:String(values.expectedVersion||""),recipient:String(values.recipient||"").trim(),recipientName:String(values.recipientName||"").trim(),recipientOrganization:String(values.recipientOrganization||"").trim(),subject:String(values.subject||"").trim(),body:String(values.body||"").trim()};
    }
    function validate(values){
      clearErrors();
      if(!/^\\S+@\\S+\\.\\S+$/.test(values.recipient)){fieldError("recipient","Enter a valid email address.");node('[name="recipient"]')?.focus();return false;}
      if(!values.subject){fieldError("subject","Add a subject.");node('[name="subject"]')?.focus();return false;}
      if(!values.body){fieldError("body","Write a message before saving.");node('[name="body"]')?.focus();return false;}
      return true;
    }
    function contextOf(payload){return payload.context||payload.communication||payload.draftContext||{};}
    function fill(payload){
      current=payload;
      const context=contextOf(payload);
      const recipient=context.recipient||{};
      const draft=payload.draft||payload.composer||context.draft||{};
      node('[name="draftId"]').value=draft.id||"";
      node('[name="expectedVersion"]').value=draft.version||"";
      node('[name="recipientName"]').value=draft.recipientName||recipient.name||context.recipientName||"";
      node('[name="recipientOrganization"]').value=draft.recipientOrganization||recipient.organization||context.recipientOrganization||context.organization||"";
      node('[name="recipient"]').value=draft.recipient||draft.to||recipient.email||context.recipientEmail||"";
      node('[name="subject"]').value=draft.subject||context.subject||"";
      node('[name="body"]').value=draft.body||context.body||"";
      node("[data-composer-context-title]").textContent=context.relationshipName||recipient.name||context.title||"Relationship";
      node("[data-composer-context-organization]").textContent=recipient.organization||context.recipientOrganization||context.organization||"Not set";
      node("[data-composer-context-interaction]").textContent=context.recentInteractionSummary||context.recentInteraction||"Not available";
      node("[data-composer-context-task]").textContent=context.relatedTask?.title||context.relatedCommitment||"Not set";
      node("[data-composer-context-summary]").textContent=context.relationshipContext||context.summary||"";
      node("[data-composer-loading]").hidden=true;
      node("[data-composer-error]").hidden=true;
      node("[data-composer-content]").hidden=false;
      node("[data-composer-manual]").hidden=true;
      const contactAllowed=draft.manualContactAllowed!==false;
      const gmail=node("[data-composer-gmail]");
      const manual=node("[data-composer-manual-open]");
      if(gmail){gmail.disabled=!contactAllowed;gmail.dataset.policyDisabled=contactAllowed?"":"true";gmail.title=contactAllowed?"":"This recipient cannot be contacted.";}
      if(manual){manual.disabled=!contactAllowed;manual.dataset.policyDisabled=contactAllowed?"":"true";manual.title=contactAllowed?"":"This recipient cannot be contacted.";}
      status(draft.id?"Saved draft reopened.":"");
      setTimeout(()=>node("#founder-composer-title")?.focus(),0);
    }
    async function load(){
      try{
        const params=new URLSearchParams({sourceKind:current.sourceKind,sourceId:current.sourceId});
        const response=await fetch(contextEndpoint+"?"+params.toString(),{credentials:"same-origin",headers:{accept:"application/json"}});
        const payload=await response.json().catch(()=>({}));
        if(response.status===401){close(false);document.dispatchEvent(new CustomEvent("vnext:session-expired"));return;}
        if(!response.ok||payload.ok!==true)throw new Error(payload.message||"Draft context could not load.");
        fill({...payload,sourceKind:current.sourceKind,sourceId:current.sourceId});
      }catch(error){showError(error.message||"No changes were made. Try again.");}
    }
    async function open(options={},returnTarget=null){
      const sourceKind=String(options.sourceKind||"").trim();
      const sourceId=String(options.sourceId||"").trim();
      if(!sourceKind||!sourceId)return;
      trigger=returnTarget||document.activeElement;
      current={sourceKind,sourceId};
      const layer=ensureDialog();
      status("");
      node("[data-composer-loading]").hidden=false;
      node("[data-composer-error]").hidden=true;
      node("[data-composer-content]").hidden=true;
      if(!layer.open)layer.showModal();
      await load();
    }
    function close(restore=true){
      const layer=dialog();
      if(layer?.open&&!busy)layer.close();
      current=null;
      if(restore&&trigger?.isConnected)setTimeout(()=>trigger.focus(),0);
    }
    async function save(button){
      const values=formValues();
      if(!validate(values)||busy)return null;
      setBusy(true,"Saving…",button);status("");
      try{
        const response=await fetch(draftsEndpoint,{method:"POST",credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json","x-csrf-token":cookieValue("leos_csrf")},body:JSON.stringify({...values,requestId:requestId("communication_draft"),sourceKind:current.sourceKind,sourceId:current.sourceId})});
        const payload=await response.json().catch(()=>({}));
        if(response.status===401){close(false);document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;}
        if(!response.ok||payload.ok!==true){if(payload.field)fieldError(payload.field,payload.message);throw new Error(payload.message||"Draft could not be saved.");}
        current={...current,...payload,draft:payload.draft};
        node('[name="draftId"]').value=payload.draft?.id||values.draftId;
        node('[name="expectedVersion"]').value=payload.draft?.version||values.expectedVersion;
        status(payload.message||"Draft saved.");
        document.dispatchEvent(new CustomEvent("vnext:communication-draft-saved",{detail:{draft:payload.draft||null,sourceKind:current.sourceKind,sourceId:current.sourceId}}));
        return payload.draft||values;
      }catch(error){status(error.message||"Draft could not be saved. No changes were made.","error");return null;}
      finally{setBusy(false,"",button);}
    }
    async function copy(button){
      const values=formValues();
      if(!validate(values)||busy)return;
      const copyText=[values.subject,values.body].filter(Boolean).join("\\n\\n");
      setBusy(true,"Copying…",button);
      try{await navigator.clipboard.writeText(copyText);status("Draft copied.");}
      catch{const body=node('[name="body"]');body.focus();body.select();status("Copy was unavailable. The message is selected so you can copy it.","error");}
      finally{setBusy(false,"",button);}
    }
    async function openGmail(button){
      const values=formValues();
      if(!validate(values)||busy)return;
      const draft=await save(button);
      if(!draft)return;
      const target=draft.gmailUrl||draft.gmailComposeUrl;
      if(!target){status("This recipient cannot be opened in Gmail.","error");return;}
      window.open(target,"_blank","noopener,noreferrer");
      status("Draft saved and opened in Gmail.");
    }
    async function manualSent(form,button){
      if(busy)return;
      let draftId=String(node('[name="draftId"]')?.value||"");
      if(!draftId){const saved=await save(node("[data-communication-composer-save]"));draftId=String(saved?.id||node('[name="draftId"]')?.value||"");}
      if(!draftId)return;
      const values=Object.fromEntries(new FormData(form));
      setBusy(true,"Recording…",button);status("");
      try{
        const response=await fetch(draftsEndpoint+"/"+encodeURIComponent(draftId)+"/manual-sent",{method:"POST",credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json","x-csrf-token":cookieValue("leos_csrf")},body:JSON.stringify({requestId:requestId("communication_manual_sent"),expectedVersion:String(node('[name="expectedVersion"]')?.value||"legacy"),nextFollowUpDate:String(values.nextFollowUpDate||""),completeOriginatingTask:values.completeOriginatingTask==="on",completionNote:"Manual follow-up sent and recorded."})});
        const payload=await response.json().catch(()=>({}));
        if(response.status===401){close(false);document.dispatchEvent(new CustomEvent("vnext:session-expired"));return;}
        if(!response.ok||payload.ok!==true)throw new Error(payload.message||"Sent activity could not be recorded.");
        form.hidden=true;
        if(payload.draft){node('[name="expectedVersion"]').value=payload.draft.version||"";current={...current,draft:payload.draft};}
        status(payload.message||"Sent activity recorded.");
        document.dispatchEvent(new CustomEvent("vnext:communication-sent-recorded",{detail:payload}));
        await Promise.all([Promise.resolve(window.__LE_TODAY_PAGE?.refresh?.()),Promise.resolve(window.__LE_INBOX_PAGE?.refresh?.()),Promise.resolve(window.__LE_PARTNERS_HOME?.load?.())]);
      }catch(error){status(error.message||"Sent activity could not be recorded. No changes were made.","error");}
      finally{setBusy(false,"",button);}
    }
    function bind(layer){
      layer.addEventListener("click",(event)=>{
        if(event.target.closest("[data-composer-close]")){close();return;}
        if(event.target.closest("[data-composer-retry]")){node("[data-composer-loading]").hidden=false;node("[data-composer-error]").hidden=true;load();return;}
        if(event.target.closest("[data-composer-copy]")){copy(event.target.closest("button"));return;}
        if(event.target.closest("[data-composer-gmail]")){openGmail(event.target.closest("button"));return;}
        if(event.target.closest("[data-composer-manual-open]")){node("[data-composer-manual]").hidden=false;node('[name="nextFollowUpDate"]')?.focus();return;}
        if(event.target.closest("[data-composer-manual-cancel]")){node("[data-composer-manual]").hidden=true;return;}
        if(event.target===layer&&!busy)close();
      });
      layer.addEventListener("submit",(event)=>{
        if(event.target.matches("[data-communication-composer-form]")){event.preventDefault();save(event.submitter||node("[data-communication-composer-save]"));}
        if(event.target.matches("[data-composer-manual]")){event.preventDefault();manualSent(event.target,event.submitter);}
      });
      layer.addEventListener("cancel",(event)=>{if(busy)event.preventDefault();else close();});
    }
    document.addEventListener("click",(event)=>{
      const control=event.target.closest?.("[data-compose-source-kind][data-compose-source-id]");
      if(!control)return;
      event.preventDefault();
      open({sourceKind:control.dataset.composeSourceKind,sourceId:control.dataset.composeSourceId},control);
    });
    document.addEventListener("vnext:session-expired",()=>close(false));
    document.addEventListener("vnext:recovery-mode",()=>close(false));
    window.commandCenterOpenComposer=open;
    window.__LE_COMMUNICATION_COMPOSER=Object.freeze({open,close});
    ensureDialog();
  })();`;
}
