import { escapeAttribute } from "../html.mjs";
import { FOUNDER_SUPPORT_ACTION_PATH, FOUNDER_SUPPORT_VIEW_PATH } from "../../founder-support-api.mjs";

export const FOUNDER_SUPPORT_STYLESHEET_PATH = "assets/ui/founder-support.css";
export const FOUNDER_SUPPORT_ENDPOINT = FOUNDER_SUPPORT_VIEW_PATH;
export const FOUNDER_SUPPORT_ACTION_ENDPOINT = FOUNDER_SUPPORT_ACTION_PATH;

export function renderFounderSupportPageShell(pageClass = "page-section active") {
  return `<section id="support" class="${escapeAttribute(pageClass)} founder-support-route lee-bubble-safe-space" data-founder-support-page aria-labelledby="founder-support-title">
    <div class="founder-support">
      <header class="founder-support__hero">
        <div><p class="founder-support__eyebrow">Customer care</p><h1 id="founder-support-title">Support</h1><p>Keep customer issues moving, prepare thoughtful responses, and protect every commitment from one calm queue.</p></div>
        <a class="founder-support__inbox-link" href="#inbox">Review customer conversations</a>
      </header>
      <div class="founder-support__notice" data-support-notice role="status" aria-live="polite"></div>
      <dl class="founder-support__summary" data-support-summary aria-label="Support summary">
        <div><dt>New</dt><dd data-support-count="New">—</dd></div>
        <div><dt>Waiting on LegalEase</dt><dd data-support-count="Waiting on LegalEase">—</dd></div>
        <div><dt>Waiting on customer</dt><dd data-support-count="Waiting on customer">—</dd></div>
        <div><dt>Needs attention</dt><dd data-support-count="attention">—</dd></div>
      </dl>
      <form class="founder-support__filters" data-support-filters aria-label="Support filters">
        <label class="founder-support__search"><span>Find an issue</span><input type="search" name="search" maxlength="100" autocomplete="off" placeholder="Customer, relationship, or issue"></label>
        <label><span>Status</span><select name="lane"><option value="">All statuses</option></select></label>
        <label class="founder-support__resolved"><input type="checkbox" name="includeResolved" checked><span>Show resolved</span></label>
      </form>
      <div class="founder-support__body" data-support-body aria-busy="true">
        <div class="founder-support__skeleton" data-support-loading role="status" aria-label="Loading Support"><span></span><span></span><span></span></div>
        <section class="founder-support__state" data-support-empty hidden role="status"><h2>No issues match this view</h2><p>Change a filter or check the customer conversations in Inbox.</p></section>
        <section class="founder-support__state founder-support__state--error" data-support-error hidden role="alert"><h2>Support could not load</h2><p>No changes were made. Try again.</p><button type="button" data-support-retry>Try again</button></section>
        <ol class="founder-support__list" data-support-list aria-label="Support issues"></ol>
      </div>
      <div class="founder-support__drawer-layer" data-support-drawer-layer hidden>
        <button class="founder-support__drawer-backdrop" type="button" data-support-drawer-close aria-label="Close issue"></button>
        <aside class="founder-support__drawer" data-support-drawer role="dialog" aria-modal="true" aria-labelledby="founder-support-drawer-title">
          <header><div><p class="founder-support__eyebrow">Support issue</p><h2 id="founder-support-drawer-title" data-support-drawer-title tabindex="-1">Issue</h2></div><button type="button" class="founder-support__drawer-close" data-support-drawer-close aria-label="Close issue">×</button></header>
          <div class="founder-support__drawer-status" data-support-drawer-status></div>
          <p class="founder-support__drawer-summary" data-support-drawer-summary></p>
          <dl class="founder-support__drawer-facts" data-support-drawer-facts></dl>
          <div class="founder-support__drawer-warning" data-support-drawer-warning hidden><strong>Personal review needed</strong><p>This may include a sensitive legal question. Review the customer’s words before drafting.</p></div>
          <div class="founder-support__drawer-actions">
            <button type="button" class="is-primary" data-support-drawer-action="draft_response">Draft response</button>
            <button type="button" data-support-drawer-action="create_task">Create task</button>
            <button type="button" data-support-drawer-action="open_relationship">Open relationship</button>
            <a data-support-drawer-source hidden>View full record</a>
          </div>
        </aside>
      </div>
    </div>
  </section>`;
}

export function founderSupportPageBrowserSource() {
  const endpoints = JSON.stringify({
    view:FOUNDER_SUPPORT_ENDPOINT,
    action:FOUNDER_SUPPORT_ACTION_ENDPOINT
  }).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderFounderSupportPageShell()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const endpoints=${endpoints};
    const loadingHtml=${loadingHtml};
    const filterKey="legalease-founder-support-filters";
    let payload=null;
    let pending=null;
    let sequence=0;
    let debounceTimer=0;
    let sessionEnded=false;
    let drawerItemId="";
    let drawerReturnTarget=null;
    const busyItems=new Set();

    function routeRoot(){let section=document.querySelector("main#app #support.page-section.active");if(!section)return null;if(!section.matches("[data-founder-support-page]")){const template=document.createElement("template");template.innerHTML=loadingHtml;const replacement=template.content.firstElementChild;if(!replacement)return null;section.replaceWith(replacement);section=replacement;}return section;}
    function node(selector){return routeRoot()?.querySelector(selector)||null;}
    function resolution(){return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#support");}
    function active(){const value=resolution();if(value)return value.kind==="page"&&value.canonicalRoute==="support";return ["#support","#support-inbox"].includes(String(location.hash||"").split("?")[0]);}
    function text(tag,value,className=""){const element=document.createElement(tag);if(className)element.className=className;element.textContent=String(value??"");return element;}
    function cookieValue(name){const prefix=name+"=";const part=String(document.cookie||"").split(";").map((item)=>item.trim()).find((item)=>item.startsWith(prefix));if(!part)return "";try{return decodeURIComponent(part.slice(prefix.length));}catch{return "";}}
    function requestId(){const value=globalThis.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(16).slice(2);return "founder_support_"+value.replaceAll("-","");}
    function today(offset=0){const value=new Date();value.setDate(value.getDate()+offset);return value.toISOString().slice(0,10);}
    function readFilters(){try{const saved=JSON.parse(sessionStorage.getItem(filterKey)||"{}");return {search:String(saved.search||"").slice(0,100),lane:String(saved.lane||""),includeResolved:saved.includeResolved!==false};}catch{return {search:"",lane:"",includeResolved:true};}}
    function writeFilters(filters){try{sessionStorage.setItem(filterKey,JSON.stringify(filters));}catch{}}
    function filters(){const form=node("[data-support-filters]");if(!form)return readFilters();const values=new FormData(form);return {search:String(values.get("search")||"").trim().slice(0,100),lane:String(values.get("lane")||""),includeResolved:values.get("includeResolved")==="on"};}
    function setNotice(message="",kind="success"){const target=node("[data-support-notice]");if(!target)return;target.textContent=message;target.dataset.kind=message?kind:"";}
    function setLoading(loading){const body=node("[data-support-body]");const skeleton=node("[data-support-loading]");if(body)body.setAttribute("aria-busy",loading?"true":"false");if(skeleton)skeleton.hidden=!loading;}
    function showError(message){setLoading(false);node("[data-support-list]")?.replaceChildren();const empty=node("[data-support-empty]");if(empty)empty.hidden=true;const state=node("[data-support-error]");if(!state)return;state.hidden=false;const copy=state.querySelector("p");if(copy)copy.textContent=message||"No changes were made. Try again.";}
    function formatDate(value){const parsed=Date.parse(value||"");if(!Number.isFinite(parsed))return "Not recorded";return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(parsed));}
    function statusTone(item){if(item.lane==="Urgent"||item.lane==="Escalated")return "attention";if(item.lane==="Resolved")return "complete";if(item.lane.startsWith("Waiting"))return "waiting";return "new";}
    function button(label,action,tone="secondary"){const control=text("button",label,"founder-support__action founder-support__action--"+tone);control.type="button";control.dataset.supportAction=action;return control;}
    function fact(label,value){const group=document.createElement("div");group.append(text("dt",label),text("dd",value||"Not recorded"));return group;}
    function safeInternalHref(value){const href=String(value||"").trim();if(!href.startsWith("#"))return "";const checked=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(href);if(checked&&["unsafe","unknown"].includes(checked.kind))return "";return checked?.safeHash||href;}
    function openRelationship(item,returnTarget){if(!item?.relationship?.id)return;const opener=window.commandCenterOpenRelationship;if(typeof opener==="function")opener(item.relationship.id,returnTarget||document.activeElement);else location.hash="partners";}
    function openComposer(item,returnTarget){const source=item?.composerSource;if(!source?.kind||!source?.id){setNotice("Drafting context is unavailable for this issue.","error");return;}if(typeof window.commandCenterOpenComposer!=="function"){setNotice("Drafting is temporarily unavailable. No changes were made.","error");return;}window.commandCenterOpenComposer({sourceKind:source.kind,sourceId:source.id},returnTarget||document.activeElement);}

    function renderCounts(next){const byLane=next.counts?.byLane||{};routeRoot()?.querySelectorAll("[data-support-count]").forEach((target)=>{const key=target.dataset.supportCount;target.textContent=key==="attention"?String(Number(byLane.Urgent||0)+Number(byLane.Escalated||0)):String(Number(byLane[key]||0));});}
    function syncFilters(next){const form=node("[data-support-filters]");if(!form)return;const saved=readFilters();const search=form.elements.search;if(search&&document.activeElement!==search)search.value=saved.search;const select=form.elements.lane;if(select){select.replaceChildren();const all=document.createElement("option");all.value="";all.textContent="All statuses ("+String(next.counts?.total||0)+")";select.append(all);(next.lanes||[]).forEach((lane)=>{const option=document.createElement("option");option.value=lane;option.textContent=lane+" ("+String(next.counts?.byLane?.[lane]||0)+")";select.append(option);});select.value=(next.lanes||[]).includes(saved.lane)?saved.lane:"";}if(form.elements.includeResolved)form.elements.includeResolved.checked=saved.includeResolved;}
    function cardFor(item){return node('[data-support-item="'+CSS.escape(item.id)+'"]');}
    function itemFor(value){const id=typeof value==="string"?value:value?.closest?.("[data-support-item]")?.dataset.supportItem;return payload?.items?.find((item)=>item.id===id)||null;}
    function itemStatus(card,message="",kind="success"){const target=card?.querySelector("[data-support-item-status]");if(!target)return;target.textContent=message;target.dataset.kind=message?kind:"";}
    function setBusy(card,busy,trigger=null,label="Working…"){const item=itemFor(card);if(!item)return;if(busy)busyItems.add(item.id);else busyItems.delete(item.id);card.querySelectorAll("button,input,select").forEach((control)=>{control.disabled=busy;});if(trigger){if(busy){trigger.dataset.originalLabel=trigger.textContent;trigger.textContent=label;}else{trigger.textContent=trigger.dataset.originalLabel||trigger.textContent;delete trigger.dataset.originalLabel;}}}

    function inlineForm(item,kind){const form=document.createElement("form");form.className="founder-support__inline";form.dataset.supportInline=kind;const heading=text("h4",kind==="create_task"?"Create an internal task":kind==="set_status"?"Set who has the next move":"Link a customer relationship");form.append(heading);
      if(kind==="create_task"){
        const titleLabel=text("label","Task title");const title=document.createElement("input");title.name="title";title.type="text";title.maxLength=160;title.required=true;title.value=("Handle support issue: "+item.title).slice(0,160);titleLabel.append(title);
        const dueLabel=text("label","Due date");const due=document.createElement("input");due.name="dueDate";due.type="date";due.min=today();due.value=today();due.required=true;dueLabel.append(due);form.append(titleLabel,dueLabel);
      }else if(kind==="set_status"){
        const statusLabel=text("label","Waiting status");const select=document.createElement("select");select.name="status";select.required=true;[["waiting_on_legalease","Waiting on LegalEase"],["waiting_on_customer","Waiting on customer"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;if(label===item.lane)option.selected=true;select.append(option);});statusLabel.append(select);
        const noteLabel=text("label","Note (optional)");const note=document.createElement("input");note.name="note";note.type="text";note.maxLength=500;note.placeholder="What are you waiting for?";noteLabel.append(note);form.append(statusLabel,noteLabel);
      }else{
        const label=text("label","Relationship");const select=document.createElement("select");select.name="relationshipId";select.required=true;const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent=(payload?.relationshipOptions||[]).length?"Choose a relationship":"No relationships available";select.append(placeholder);(payload?.relationshipOptions||[]).forEach((relationship)=>{const option=document.createElement("option");option.value=relationship.id;option.textContent=[relationship.label,relationship.organization&&relationship.organization!==relationship.label?relationship.organization:"",relationship.category].filter(Boolean).join(" · ");if(item.relationship?.id===relationship.id)option.selected=true;select.append(option);});label.append(select);form.append(label);
      }
      const error=text("p","","founder-support__inline-error");error.dataset.supportInlineError="true";error.setAttribute("role","alert");const actions=document.createElement("div");actions.className="founder-support__inline-actions";const save=text("button",kind==="create_task"?"Create task":kind==="set_status"?"Save waiting status":"Link relationship","founder-support__action founder-support__action--primary");save.type="submit";if(kind==="link_relationship"&&!(payload?.relationshipOptions||[]).length)save.disabled=true;const cancel=button("Cancel","cancel_inline","quiet");actions.append(save,cancel);form.append(error,actions);return form;
    }
    function showInline(card,item,kind){card.querySelector("[data-support-inline]")?.remove();const form=inlineForm(item,kind);card.append(form);form.querySelector("input,select")?.focus();}

    function renderItem(item){const row=document.createElement("li");const card=document.createElement("article");row.append(card);card.className="founder-support__item";card.dataset.supportItem=item.id;card.dataset.version=item.source?.version||"legacy";
      const main=document.createElement("div");main.className="founder-support__item-main";const top=document.createElement("div");top.className="founder-support__item-top";const lane=text("span",item.lane||"New","founder-support__chip");lane.dataset.tone=statusTone(item);top.append(lane);if(item.sensitiveLegalQuestion){const sensitive=text("span","Personal review","founder-support__chip");sensitive.dataset.tone="attention";top.append(sensitive);}if(Number.isFinite(item.ageDays))top.append(text("span",item.ageDays===0?"Today":item.ageDays+"d old","founder-support__age"));
      const title=text("h2",item.title||"Customer issue");const summary=text("p",item.summary||"Review this customer issue and choose the next step.","founder-support__item-summary");const facts=document.createElement("dl");facts.className="founder-support__facts";facts.append(fact("Customer",item.requester),fact("Owner",item.owner),fact("Open tasks",String(Number(item.openTaskCount||0))),fact("Updated",formatDate(item.updatedAt)));if(item.relationship?.label)facts.append(fact("Relationship",item.relationship.label));main.append(top,title,summary,facts);
      const actions=document.createElement("div");actions.className="founder-support__item-actions";if(item.actions?.draftResponse)actions.append(button("Draft response","draft_response","primary"));actions.append(button("Open issue","open_issue"));const more=document.createElement("details");more.className="founder-support__more";const moreLabel=text("summary","More actions");const moreActions=document.createElement("div");if(item.actions?.createTask)moreActions.append(button("Create task","create_task"));if(item.actions?.setStatus)moreActions.append(button("Set waiting status","set_status"));if(item.actions?.resolve)moreActions.append(button("Resolve","resolve"));if(item.actions?.escalate)moreActions.append(button("Escalate","escalate","attention"));if(item.actions?.linkRelationship)moreActions.append(button(item.relationship?"Change relationship":"Link relationship","link_relationship"));if(item.relationship?.id)moreActions.append(button("Open relationship","open_relationship","quiet"));more.append(moreLabel,moreActions);if(moreActions.childElementCount)actions.append(more);
      const status=text("div","","founder-support__item-status");status.dataset.supportItemStatus="true";status.setAttribute("role","status");status.setAttribute("aria-live","polite");card.append(main,actions,status);return row;
    }
    function render(next,{preserveScroll=false,focusItem=""}={}){const y=window.scrollY;payload=next;setLoading(false);const error=node("[data-support-error]");if(error)error.hidden=true;syncFilters(next);renderCounts(next);const list=node("[data-support-list]");const items=Array.isArray(next.items)?next.items:[];list?.replaceChildren(...items.map(renderItem));const empty=node("[data-support-empty]");if(empty)empty.hidden=items.length>0;if(preserveScroll)requestAnimationFrame(()=>window.scrollTo({top:y,left:window.scrollX,behavior:"instant"}));if(focusItem)setTimeout(()=>cardFor({id:focusItem})?.querySelector("[data-support-action=open_issue]")?.focus(),0);}

    async function load({force=false,preserveScroll=false,focusItem=""}={}){if(!active()||sessionEnded||!routeRoot())return null;const selected=filters();writeFilters(selected);const query=new URLSearchParams({includeResolved:String(selected.includeResolved)});if(selected.search)query.set("search",selected.search);if(selected.lane)query.set("lane",selected.lane);const key=query.toString();if(pending){if(!force&&pending.key===key)return pending.promise;pending.controller.abort();}const controller=new AbortController();const current=++sequence;if(!payload)setLoading(true);const promise=fetch(endpoints.view+"?"+key,{credentials:"same-origin",headers:{accept:"application/json"},signal:controller.signal}).then(async(response)=>{const body=await response.json().catch(()=>({}));if(response.status===401){sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;}if(!response.ok||body.ok!==true||body.available!==true)throw new Error(body.message||"Support could not load. No changes were made.");if(current===sequence&&active())render(body,{preserveScroll,focusItem});return body;}).catch((error)=>{if(error.name!=="AbortError"&&current===sequence&&active())showError(error.message);return null;}).finally(()=>{if(pending?.controller===controller)pending=null;});pending={key,controller,promise};return promise;}

    async function mutate(card,action,details={},trigger=null){const item=itemFor(card);if(!item||busyItems.has(item.id))return null;const labels={create_task:"Creating…",set_status:"Saving…",resolve:"Resolving…",escalate:"Escalating…",link_relationship:"Linking…"};setBusy(card,true,trigger,labels[action]||"Working…");itemStatus(card,"");try{const response=await fetch(endpoints.action,{method:"POST",credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json","x-csrf-token":cookieValue("leos_csrf")},body:JSON.stringify({itemId:item.id,action,requestId:requestId(),expectedVersion:item.source?.version||"legacy",...details})});const body=await response.json().catch(()=>({}));if(response.status===401){sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;}if(!response.ok||body.ok!==true)throw new Error(body.message||"This Support issue could not be changed. No changes were made.");if(body.result?.responseSent!==false||Number(body.externalActions||0)!==0)throw new Error("The Support safety receipt was incomplete. No success was recorded.");setNotice(body.message||body.result?.message||"Support issue updated.");document.dispatchEvent(new CustomEvent("vnext:support-updated",{detail:{itemId:item.id,action}}));await Promise.all([load({force:true,preserveScroll:true,focusItem:item.id}),Promise.resolve(window.__LE_TODAY_PAGE?.refresh?.()),Promise.resolve(window.__LE_INBOX_PAGE?.refresh?.())]);return body;}catch(error){itemStatus(card,error.message||"No changes were made. Try again.","error");return null;}finally{setBusy(card,false,trigger);}}

    function openDrawer(item,returnTarget){drawerItemId=item.id;drawerReturnTarget=returnTarget||document.activeElement;const layer=node("[data-support-drawer-layer]");if(!layer)return;node("[data-support-drawer-title]").textContent=item.title||"Support issue";node("[data-support-drawer-status]").textContent=item.lane||"New";node("[data-support-drawer-status]").dataset.tone=statusTone(item);node("[data-support-drawer-summary]").textContent=item.summary||"No summary is available.";const facts=node("[data-support-drawer-facts]");facts?.replaceChildren(fact("Customer",item.requester),fact("Owner",item.owner),fact("Waiting on",item.waitingOn||"Not set"),fact("Open tasks",String(Number(item.openTaskCount||0))),fact("Relationship",item.relationship?.label||"Not linked"),fact("Last changed",formatDate(item.updatedAt)));const warning=node("[data-support-drawer-warning]");if(warning)warning.hidden=item.sensitiveLegalQuestion!==true;const relationship=node('[data-support-drawer-action="open_relationship"]');if(relationship)relationship.hidden=!item.relationship?.id;const source=node("[data-support-drawer-source]");const href=safeInternalHref(item.href);if(source){source.hidden=!href;if(href)source.href=href;}layer.hidden=false;document.body.classList.add("founder-support-drawer-open");setTimeout(()=>node("[data-support-drawer-title]")?.focus(),0);}
    function closeDrawer(restore=true){const layer=node("[data-support-drawer-layer]");if(layer)layer.hidden=true;document.body.classList.remove("founder-support-drawer-open");drawerItemId="";if(restore&&drawerReturnTarget?.isConnected)setTimeout(()=>drawerReturnTarget.focus(),0);}

    function bind(){const root=routeRoot();if(!root||root.dataset.supportBound==="true")return;root.dataset.supportBound="true";const saved=readFilters();const form=node("[data-support-filters]");if(form){form.elements.search.value=saved.search;form.elements.includeResolved.checked=saved.includeResolved;if(saved.lane){const option=document.createElement("option");option.value=saved.lane;option.textContent=saved.lane;option.selected=true;form.elements.lane.append(option);}form.addEventListener("change",(event)=>{if(event.target.name!=="search")load({force:true});});form.addEventListener("submit",(event)=>{event.preventDefault();load({force:true});});form.elements.search.addEventListener("input",()=>{clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>load({force:true}),260);});}
      root.addEventListener("click",(event)=>{const retry=event.target.closest("[data-support-retry]");if(retry){payload=null;load({force:true});return;}if(event.target.closest("[data-support-drawer-close]")){closeDrawer();return;}const drawerAction=event.target.closest("[data-support-drawer-action]");if(drawerAction){const item=itemFor(drawerItemId);if(!item)return;const action=drawerAction.dataset.supportDrawerAction;if(action==="draft_response"){openComposer(item,drawerAction);return;}if(action==="open_relationship"){openRelationship(item,drawerAction);return;}if(action==="create_task"){closeDrawer(false);const card=cardFor(item);if(card){showInline(card,item,"create_task");card.scrollIntoView({block:"center"});}return;}}
        const control=event.target.closest("[data-support-action]");if(!control)return;const card=control.closest("[data-support-item]");const item=itemFor(card);if(!item)return;const action=control.dataset.supportAction;if(action==="draft_response"){openComposer(item,control);return;}if(action==="open_issue"){openDrawer(item,control);return;}if(action==="open_relationship"){openRelationship(item,control);return;}if(action==="cancel_inline"){control.closest("[data-support-inline]")?.remove();return;}if(["create_task","set_status","link_relationship"].includes(action)){showInline(card,item,action);return;}if(["resolve","escalate"].includes(action))mutate(card,action,{},control);
      });
      root.addEventListener("submit",(event)=>{const inline=event.target.closest("[data-support-inline]");if(!inline)return;event.preventDefault();const card=inline.closest("[data-support-item]");const values=Object.fromEntries(new FormData(inline));const kind=inline.dataset.supportInline;const error=inline.querySelector("[data-support-inline-error]");if(kind==="link_relationship"&&!values.relationshipId){if(error)error.textContent="Choose a relationship.";return;}if(kind==="create_task"&&(!values.title||!values.dueDate)){if(error)error.textContent="Add a task title and due date.";return;}if(error)error.textContent="";mutate(card,kind,values,event.submitter);});
    }
    function activate(){if(!active()||sessionEnded||!routeRoot())return;bind();load();}
    document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&!node("[data-support-drawer-layer]")?.hidden)closeDrawer();});
    window.addEventListener("hashchange",()=>{if(active()){payload=null;queueMicrotask(activate);}else closeDrawer(false);});
    document.addEventListener("vnext:session-expired",()=>{sessionEnded=true;payload=null;pending?.controller?.abort();pending=null;closeDrawer(false);});
    document.addEventListener("vnext:communication-sent-recorded",()=>{if(active())load({force:true,preserveScroll:true});});
    const host=document.querySelector("main#app");if(host)new MutationObserver(()=>{if(active()&&routeRoot()&&!routeRoot().dataset.supportBound)queueMicrotask(activate);}).observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    window.__LE_FOUNDER_SUPPORT=Object.freeze({activate,refresh:()=>load({force:true,preserveScroll:true})});activate();
  })();`;
}
