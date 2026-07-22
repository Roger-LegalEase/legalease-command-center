import { escapeAttribute } from "../html.mjs";
import {
  FOUNDER_CALENDAR_ACTION_PATH,
  FOUNDER_CALENDAR_CREATE_LINK_PATH,
  FOUNDER_CALENDAR_VIEW_PATH
} from "../../founder-calendar-api.mjs";

export const FOUNDER_CALENDAR_STYLESHEET_PATH = "assets/ui/founder-calendar.css";
export const FOUNDER_CALENDAR_ENDPOINT = FOUNDER_CALENDAR_VIEW_PATH;
export const FOUNDER_CALENDAR_ACTION_ENDPOINT = FOUNDER_CALENDAR_ACTION_PATH;
export const FOUNDER_CALENDAR_CREATE_LINK_ENDPOINT = FOUNDER_CALENDAR_CREATE_LINK_PATH;

export function renderFounderCalendarPageShell(pageClass = "page-section active") {
  return `<section id="meetings" class="${escapeAttribute(pageClass)} founder-calendar-route lee-bubble-safe-space" data-founder-calendar-page aria-labelledby="founder-calendar-title">
    <div class="founder-calendar">
      <header class="founder-calendar__hero">
        <div><p class="founder-calendar__eyebrow">Read-only Google context</p><h1 id="founder-calendar-title">Calendar</h1><p>See the week clearly, prepare for important conversations, and turn meeting follow-through into internal tasks.</p></div>
        <button class="founder-calendar__primary" type="button" data-calendar-plan-event>Plan a Google event</button>
      </header>
      <div class="founder-calendar__safety"><span aria-hidden="true">✓</span><p>Events stay read-only here. Event creation opens a prefilled Google Calendar page for your review.</p></div>
      <div class="founder-calendar__notice" data-calendar-notice role="status" aria-live="polite"></div>
      <dl class="founder-calendar__summary" data-calendar-summary aria-label="Calendar summary">
        <div><dt>Today</dt><dd data-calendar-count="today">—</dd></div>
        <div><dt>This week</dt><dd data-calendar-count="thisWeek">—</dd></div>
        <div><dt>Partner meetings</dt><dd data-calendar-count="upcomingPartnerMeetings">—</dd></div>
        <div><dt>Customer calls</dt><dd data-calendar-count="customerCalls">—</dd></div>
      </dl>
      <div class="founder-calendar__range" data-calendar-range role="group" aria-label="Calendar range">
        <button type="button" data-calendar-range-value="today" aria-pressed="false">Today</button>
        <button type="button" data-calendar-range-value="this_week" aria-pressed="false">This week</button>
        <button type="button" data-calendar-range-value="upcoming" aria-pressed="true">Upcoming</button>
        <button type="button" data-calendar-range-value="all" aria-pressed="false">All</button>
      </div>
      <form class="founder-calendar__filters" data-calendar-filters aria-label="Calendar filters">
        <label class="founder-calendar__search"><span>Find a meeting</span><input type="search" name="search" maxlength="100" autocomplete="off" placeholder="Title, person, organization, or context"></label>
        <label><span>Meeting type</span><select name="category"><option value="">All meeting types</option></select></label>
      </form>
      <div class="founder-calendar__body" data-calendar-body aria-busy="true">
        <div class="founder-calendar__skeleton" data-calendar-loading role="status" aria-label="Loading Calendar"><span></span><span></span><span></span></div>
        <section class="founder-calendar__state" data-calendar-empty hidden role="status"><h2>No events match this view</h2><p>Try a wider date range or open Google Calendar to review the full calendar.</p><a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer">Open Google Calendar</a></section>
        <section class="founder-calendar__state founder-calendar__state--error" data-calendar-error hidden role="alert"><h2>Calendar could not load</h2><p>No changes were made. Try again.</p><button type="button" data-calendar-retry>Try again</button></section>
        <div class="founder-calendar__groups" data-calendar-groups></div>
      </div>
      <div class="founder-calendar__planner-layer" data-calendar-planner-layer hidden>
        <button class="founder-calendar__planner-backdrop" type="button" data-calendar-planner-close aria-label="Close event planner"></button>
        <aside class="founder-calendar__planner" role="dialog" aria-modal="true" aria-labelledby="founder-calendar-planner-title">
          <header><div><p class="founder-calendar__eyebrow">Google Calendar</p><h2 id="founder-calendar-planner-title" tabindex="-1">Plan a new event</h2><p>We’ll prepare the details, then you review and save them in Google Calendar.</p></div><button class="founder-calendar__planner-close" type="button" data-calendar-planner-close aria-label="Close event planner">×</button></header>
          <div class="founder-calendar__planner-status" data-calendar-planner-status role="status" aria-live="polite"></div>
          <form class="founder-calendar__planner-form" data-calendar-planner-form novalidate>
            <label>Event title<input type="text" name="title" maxlength="180" required></label>
            <div class="founder-calendar__planner-times"><label>Starts<input type="datetime-local" name="start" required></label><label>Ends<input type="datetime-local" name="end" required></label></div>
            <label>Location <span>(optional)</span><input type="text" name="location" maxlength="240"></label>
            <label>Details <span>(optional)</span><textarea name="details" rows="5" maxlength="1000"></textarea></label>
            <p class="founder-calendar__field-error" data-calendar-planner-error role="alert"></p>
            <footer><button class="is-primary" type="submit" data-calendar-prepare-link>Prepare in Google Calendar</button><button type="button" data-calendar-planner-close>Cancel</button><a data-calendar-prepared-link hidden target="_blank" rel="noopener noreferrer">Open event in Google Calendar</a></footer>
          </form>
        </aside>
      </div>
    </div>
  </section>`;
}

export function founderCalendarPageBrowserSource() {
  const endpoints = JSON.stringify({
    view:FOUNDER_CALENDAR_ENDPOINT,
    action:FOUNDER_CALENDAR_ACTION_ENDPOINT,
    createLink:FOUNDER_CALENDAR_CREATE_LINK_ENDPOINT
  }).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderFounderCalendarPageShell()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const endpoints=${endpoints};
    const loadingHtml=${loadingHtml};
    const filterKey="legalease-founder-calendar-filters";
    const allowedRanges=new Set(["all","today","this_week","upcoming"]);
    let payload=null;
    let pending=null;
    let sequence=0;
    let debounceTimer=0;
    let sessionEnded=false;
    let plannerReturnTarget=null;
    let plannerBusy=false;
    const busyEvents=new Set();

    function routeRoot(){let section=document.querySelector("main#app #meetings.page-section.active");if(!section)return null;if(!section.matches("[data-founder-calendar-page]")){const template=document.createElement("template");template.innerHTML=loadingHtml;const replacement=template.content.firstElementChild;if(!replacement)return null;section.replaceWith(replacement);section=replacement;}return section;}
    function node(selector){return routeRoot()?.querySelector(selector)||null;}
    function resolution(){return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#meetings");}
    function active(){const value=resolution();if(value)return value.kind==="page"&&value.canonicalRoute==="meetings";return ["#meetings","#calendar","#meeting","#meeting-prep"].includes(String(location.hash||"").split("?")[0]);}
    function text(tag,value,className=""){const element=document.createElement(tag);if(className)element.className=className;element.textContent=String(value??"");return element;}
    function cookieValue(name){const prefix=name+"=";const part=String(document.cookie||"").split(";").map((item)=>item.trim()).find((item)=>item.startsWith(prefix));if(!part)return "";try{return decodeURIComponent(part.slice(prefix.length));}catch{return "";}}
    function requestId(){const value=globalThis.crypto?.randomUUID?.()||String(Date.now())+"_"+Math.random().toString(16).slice(2);return "founder_calendar_"+value.replaceAll("-","");}
    function browserTimeZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"America/Chicago";}catch{return "America/Chicago";}}
    function readFilters(){try{const saved=JSON.parse(sessionStorage.getItem(filterKey)||"{}");return {range:allowedRanges.has(saved.range)?saved.range:"upcoming",category:String(saved.category||""),search:String(saved.search||"").slice(0,100)};}catch{return {range:"upcoming",category:"",search:""};}}
    function writeFilters(filters){try{sessionStorage.setItem(filterKey,JSON.stringify(filters));}catch{}}
    function filters(){const form=node("[data-calendar-filters]");const saved=readFilters();if(!form)return saved;return {range:saved.range,category:String(new FormData(form).get("category")||""),search:String(new FormData(form).get("search")||"").trim().slice(0,100)};}
    function setNotice(message="",kind="success"){const target=node("[data-calendar-notice]");if(!target)return;target.textContent=message;target.dataset.kind=message?kind:"";}
    function setLoading(loading){const body=node("[data-calendar-body]");const skeleton=node("[data-calendar-loading]");if(body)body.setAttribute("aria-busy",loading?"true":"false");if(skeleton)skeleton.hidden=!loading;}
    function showError(message){setLoading(false);node("[data-calendar-groups]")?.replaceChildren();const empty=node("[data-calendar-empty]");if(empty)empty.hidden=true;const state=node("[data-calendar-error]");if(!state)return;state.hidden=false;const copy=state.querySelector("p");if(copy)copy.textContent=message||"No changes were made. Try again.";}
    function safeCalendarHref(value){const href=String(value||"").trim();try{const url=new URL(href);return url.protocol==="https:"&&url.hostname==="calendar.google.com"&&!url.username&&!url.password?url.toString():"";}catch{return "";}}
    function formatTime(value){const raw=String(value||"");if(/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)){const parsed=new Date(raw+"T12:00:00");return Number.isFinite(parsed.valueOf())?new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"}).format(parsed):"Date unavailable";}const parsed=Date.parse(raw);if(!Number.isFinite(parsed))return "Time unavailable";return new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(parsed));}
    function dateKey(value){const parsed=Date.parse(value||"");if(!Number.isFinite(parsed))return "Date unavailable";return new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric"}).format(new Date(parsed));}
    function phaseLabel(value){return value==="in progress"?"In progress":value==="past"?"Past":"Upcoming";}
    function fact(label,value){const group=document.createElement("div");group.append(text("dt",label),text("dd",value||"Not recorded"));return group;}
    function actionButton(label,action,tone="secondary"){const control=text("button",label,"founder-calendar__action founder-calendar__action--"+tone);control.type="button";control.dataset.calendarAction=action;return control;}
    function externalLink(label,href,tone="secondary"){const safe=safeCalendarHref(href);if(!safe)return null;const link=text("a",label,"founder-calendar__action founder-calendar__action--"+tone);link.href=safe;link.target="_blank";link.rel="noopener noreferrer";return link;}
    function openRelationship(event,returnTarget){if(!event?.relationship?.id)return;if(typeof window.commandCenterOpenRelationship==="function")window.commandCenterOpenRelationship(event.relationship.id,returnTarget||document.activeElement);else location.hash="partners";}
    function eventFor(card){const id=typeof card==="string"?card:card?.closest?.("[data-calendar-event]")?.dataset.calendarEvent;return payload?.items?.find((event)=>event.id===id)||null;}
    function eventCard(event){const card=document.createElement("article");card.className="founder-calendar__event";card.dataset.calendarEvent=event.id;card.dataset.version=event.source?.version||"legacy";
      const body=document.createElement("div");body.className="founder-calendar__event-body";const top=document.createElement("div");top.className="founder-calendar__event-top";const category=text("span",event.category||"Other","founder-calendar__chip");category.dataset.category=String(event.category||"other").toLowerCase().replaceAll(" ","-");const phase=text("span",phaseLabel(event.phase),"founder-calendar__chip");phase.dataset.phase=event.phase||"upcoming";top.append(category,phase);body.append(top,text("h3",event.title||"Calendar event"),text("p",event.summary||"Review the event and desired outcome.","founder-calendar__event-summary"));const facts=document.createElement("dl");facts.className="founder-calendar__facts";facts.append(fact("Starts",formatTime(event.start)),fact("Ends",formatTime(event.end)),fact("Guests",event.attendeeNames?.join(", ")||String(Number(event.attendeeCount||0))+" listed"),fact("Open tasks",String(Number(event.openTaskCount||0))));if(event.location)facts.append(fact("Location",event.location));if(event.relationship?.label)facts.append(fact("Relationship",event.relationship.label));body.append(facts);
      const actions=document.createElement("div");actions.className="founder-calendar__event-actions";const preparation=event.phase!=="past";if(preparation&&event.actions?.createPreparationTask)actions.append(actionButton("Create preparation task","create_preparation_task","primary"));if(!preparation&&event.actions?.createFollowUpTask)actions.append(actionButton("Create follow-up task","create_follow_up_task","primary"));const google=externalLink("Open in Google Calendar",event.openGoogleHref);if(google)actions.append(google);const more=document.createElement("details");more.className="founder-calendar__more";const summary=text("summary","More actions");const moreActions=document.createElement("div");if(preparation&&event.actions?.createFollowUpTask)moreActions.append(actionButton("Create post-meeting follow-up","create_follow_up_task"));if(!preparation&&event.actions?.createPreparationTask)moreActions.append(actionButton("Create preparation task","create_preparation_task"));const similar=externalLink("Plan a similar event",event.createSimilarHref,"quiet");if(similar)moreActions.append(similar);if(event.relationship?.id)moreActions.append(actionButton("Open relationship","open_relationship","quiet"));more.append(summary,moreActions);if(moreActions.childElementCount)actions.append(more);const status=text("div","","founder-calendar__event-status");status.dataset.calendarEventStatus="true";status.setAttribute("role","status");status.setAttribute("aria-live","polite");card.append(body,actions,status);return card;
    }
    function renderCounts(next){routeRoot()?.querySelectorAll("[data-calendar-count]").forEach((target)=>{target.textContent=String(Number(next.counts?.[target.dataset.calendarCount]||0));});}
    function syncFilters(next){const form=node("[data-calendar-filters]");if(!form)return;const saved=readFilters();if(document.activeElement!==form.elements.search)form.elements.search.value=saved.search;const category=form.elements.category;category.replaceChildren();const all=document.createElement("option");all.value="";all.textContent="All meeting types";category.append(all);(next.categories||[]).forEach((value)=>{const option=document.createElement("option");option.value=value;option.textContent=value;category.append(option);});category.value=(next.categories||[]).includes(saved.category)?saved.category:"";node("[data-calendar-range]")?.querySelectorAll("[data-calendar-range-value]").forEach((control)=>{const selected=control.dataset.calendarRangeValue===saved.range;control.setAttribute("aria-pressed",String(selected));control.classList.toggle("is-active",selected);});}
    function render(next,{preserveScroll=false,focusEvent=""}={}){const y=window.scrollY;payload=next;setLoading(false);const error=node("[data-calendar-error]");if(error)error.hidden=true;syncFilters(next);renderCounts(next);const items=Array.isArray(next.items)?next.items:[];const groups=new Map();items.forEach((event)=>{const key=dateKey(event.start);const current=groups.get(key)||[];current.push(event);groups.set(key,current);});const host=node("[data-calendar-groups]");host?.replaceChildren(...[...groups.entries()].map(([label,events])=>{const section=document.createElement("section");section.className="founder-calendar__day";const heading=document.createElement("header");heading.append(text("h2",label),text("span",String(events.length)+(events.length===1?" event":" events")));const list=document.createElement("div");list.className="founder-calendar__event-list";list.append(...events.map(eventCard));section.append(heading,list);return section;}));const empty=node("[data-calendar-empty]");if(empty)empty.hidden=items.length>0;if(preserveScroll)requestAnimationFrame(()=>window.scrollTo({top:y,left:window.scrollX,behavior:"instant"}));if(focusEvent)setTimeout(()=>node('[data-calendar-event="'+CSS.escape(focusEvent)+'"] [data-calendar-action]')?.focus(),0);}
    async function load({force=false,preserveScroll=false,focusEvent=""}={}){if(!active()||sessionEnded||!routeRoot())return null;const selected=filters();writeFilters(selected);const query=new URLSearchParams({range:selected.range,timeZone:browserTimeZone()});if(selected.category)query.set("category",selected.category);if(selected.search)query.set("search",selected.search);const key=query.toString();if(pending){if(!force&&pending.key===key)return pending.promise;pending.controller.abort();}const controller=new AbortController();const current=++sequence;if(!payload)setLoading(true);const promise=fetch(endpoints.view+"?"+query.toString(),{credentials:"same-origin",headers:{accept:"application/json"},signal:controller.signal}).then(async(response)=>{const body=await response.json().catch(()=>({}));if(response.status===401){sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return null;}if(!response.ok||body.ok!==true||body.available!==true)throw new Error(body.message||"Calendar could not load. No changes were made.");if(current===sequence&&active())render(body,{preserveScroll,focusEvent});return body;}).catch((error)=>{if(error.name!=="AbortError"&&current===sequence&&active())showError(error.message);return null;}).finally(()=>{if(pending?.controller===controller)pending=null;});pending={key,controller,promise};return promise;}
    function setEventBusy(card,busy,trigger,label){const event=eventFor(card);if(!event)return;if(busy)busyEvents.add(event.id);else busyEvents.delete(event.id);card.querySelectorAll("button").forEach((control)=>{control.disabled=busy;});if(trigger){if(busy){trigger.dataset.originalLabel=trigger.textContent;trigger.textContent=label;}else{trigger.textContent=trigger.dataset.originalLabel||trigger.textContent;delete trigger.dataset.originalLabel;}}}
    function eventStatus(card,message="",kind="success"){const target=card?.querySelector("[data-calendar-event-status]");if(!target)return;target.textContent=message;target.dataset.kind=message?kind:"";}
    async function createTask(card,action,trigger){const event=eventFor(card);if(!event||busyEvents.has(event.id))return;const label=action==="create_preparation_task"?"Creating preparation…":"Creating follow-up…";setEventBusy(card,true,trigger,label);eventStatus(card,"");try{const response=await fetch(endpoints.action,{method:"POST",credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json","x-csrf-token":cookieValue("leos_csrf")},body:JSON.stringify({eventId:event.id,action,requestId:requestId(),expectedVersion:event.source?.version||"legacy"})});const body=await response.json().catch(()=>({}));if(response.status===401){sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return;}if(!response.ok||body.ok!==true)throw new Error(body.message||"The Calendar task could not be created. No changes were made.");if(body.result?.calendarChanged!==false||body.result?.invitationSent!==false||Number(body.externalActions||0)!==0)throw new Error("The Calendar safety receipt was incomplete. No success was recorded.");setNotice(body.message||body.result?.message||"Calendar task created.");document.dispatchEvent(new CustomEvent("vnext:calendar-task-created",{detail:{eventId:event.id,taskId:body.result?.taskId||""}}));await Promise.all([load({force:true,preserveScroll:true,focusEvent:event.id}),Promise.resolve(window.__LE_TODAY_PAGE?.refresh?.())]);}catch(error){eventStatus(card,error.message||"No changes were made. Try again.","error");}finally{setEventBusy(card,false,trigger);}}

    function datetimeLocal(date){const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,16);}
    function resetPlanner(){const form=node("[data-calendar-planner-form]");if(!form)return;form.reset();const start=new Date();start.setMinutes(Math.ceil(start.getMinutes()/30)*30,0,0);if(start.getTime()<Date.now()+600000)start.setMinutes(start.getMinutes()+30);const end=new Date(start.getTime()+3600000);form.elements.start.value=datetimeLocal(start);form.elements.end.value=datetimeLocal(end);node("[data-calendar-planner-error]").textContent="";node("[data-calendar-planner-status]").textContent="";const link=node("[data-calendar-prepared-link]");if(link){link.hidden=true;link.removeAttribute("href");}}
    function openPlanner(returnTarget){plannerReturnTarget=returnTarget||document.activeElement;resetPlanner();const layer=node("[data-calendar-planner-layer]");if(layer)layer.hidden=false;document.body.classList.add("founder-calendar-planner-open");setTimeout(()=>node("#founder-calendar-planner-title")?.focus(),0);}
    function closePlanner(restore=true,force=false){if(plannerBusy&&!force)return;const layer=node("[data-calendar-planner-layer]");if(layer)layer.hidden=true;document.body.classList.remove("founder-calendar-planner-open");if(restore&&plannerReturnTarget?.isConnected)setTimeout(()=>plannerReturnTarget.focus(),0);}
    function plannerSetBusy(busy,button){plannerBusy=busy;const form=node("[data-calendar-planner-form]");form?.querySelectorAll("input,textarea,button").forEach((control)=>{if(!control.matches("[data-calendar-planner-close]"))control.disabled=busy;});if(button){if(busy){button.dataset.originalLabel=button.textContent;button.textContent="Preparing…";}else{button.textContent=button.dataset.originalLabel||button.textContent;delete button.dataset.originalLabel;}}}
    function plannerIso(value){const parsed=new Date(String(value||""));return Number.isFinite(parsed.valueOf())?parsed.toISOString():"";}
    async function prepareLink(form,button){if(plannerBusy)return;const values=Object.fromEntries(new FormData(form));const error=node("[data-calendar-planner-error]");const start=plannerIso(values.start);const end=plannerIso(values.end);if(!String(values.title||"").trim()){error.textContent="Add an event title.";form.elements.title.focus();return;}if(!start||!end||Date.parse(end)<Date.parse(start)){error.textContent="Choose a valid start and end time.";form.elements.start.focus();return;}error.textContent="";plannerSetBusy(true,button);try{const response=await fetch(endpoints.createLink,{method:"POST",credentials:"same-origin",headers:{accept:"application/json","content-type":"application/json","x-csrf-token":cookieValue("leos_csrf")},body:JSON.stringify({title:String(values.title||"").trim(),start,end,location:String(values.location||"").trim(),details:String(values.details||"").trim()})});const body=await response.json().catch(()=>({}));if(response.status===401){sessionEnded=true;document.dispatchEvent(new CustomEvent("vnext:session-expired"));return;}const href=safeCalendarHref(body.href);if(!response.ok||body.ok!==true||!href)throw new Error(body.message||"Google Calendar details could not be prepared.");if(Number(body.calendarWrites||0)!==0||body.invitationSent!==false||Number(body.externalActions||0)!==0)throw new Error("The Calendar safety receipt was incomplete. No link was opened.");const link=node("[data-calendar-prepared-link]");link.href=href;link.hidden=false;node("[data-calendar-planner-status]").textContent=body.message||"Event details are ready to review in Google Calendar.";setTimeout(()=>link.focus(),0);}catch(caught){error.textContent=caught.message||"No changes were made. Try again.";}finally{plannerSetBusy(false,button);}}

    function bind(){const root=routeRoot();if(!root||root.dataset.calendarBound==="true")return;root.dataset.calendarBound="true";const saved=readFilters();node("[data-calendar-range]")?.querySelectorAll("[data-calendar-range-value]").forEach((control)=>{const selected=control.dataset.calendarRangeValue===saved.range;control.setAttribute("aria-pressed",String(selected));control.classList.toggle("is-active",selected);});const form=node("[data-calendar-filters]");if(form){form.elements.search.value=saved.search;if(saved.category){const option=document.createElement("option");option.value=saved.category;option.textContent=saved.category;option.selected=true;form.elements.category.append(option);}form.addEventListener("change",(event)=>{if(event.target.name!=="search")load({force:true});});form.addEventListener("submit",(event)=>{event.preventDefault();load({force:true});});form.elements.search.addEventListener("input",()=>{clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>load({force:true}),260);});}
      root.addEventListener("click",(event)=>{if(event.target.closest("[data-calendar-retry]")){payload=null;load({force:true});return;}const range=event.target.closest("[data-calendar-range-value]");if(range){const savedFilters=readFilters();savedFilters.range=range.dataset.calendarRangeValue;writeFilters(savedFilters);load({force:true});return;}const plan=event.target.closest("[data-calendar-plan-event]");if(plan){openPlanner(plan);return;}if(event.target.closest("[data-calendar-planner-close]")){closePlanner();return;}const control=event.target.closest("[data-calendar-action]");if(!control)return;const card=control.closest("[data-calendar-event]");const calendarEvent=eventFor(card);if(!calendarEvent)return;const action=control.dataset.calendarAction;if(action==="open_relationship"){openRelationship(calendarEvent,control);return;}if(["create_preparation_task","create_follow_up_task"].includes(action))createTask(card,action,control);});
      node("[data-calendar-planner-form]")?.addEventListener("submit",(event)=>{event.preventDefault();prepareLink(event.target,event.submitter||node("[data-calendar-prepare-link]"));});
    }
    function activate(){if(!active()||sessionEnded||!routeRoot())return;bind();load();}
    document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&!node("[data-calendar-planner-layer]")?.hidden)closePlanner();});
    window.addEventListener("hashchange",()=>{if(active()){payload=null;queueMicrotask(activate);}else closePlanner(false,true);});
    document.addEventListener("vnext:session-expired",()=>{sessionEnded=true;payload=null;pending?.controller?.abort();pending=null;closePlanner(false,true);});
    const host=document.querySelector("main#app");if(host)new MutationObserver(()=>{if(active()&&routeRoot()&&!routeRoot().dataset.calendarBound)queueMicrotask(activate);}).observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    window.__LE_FOUNDER_CALENDAR=Object.freeze({activate,refresh:()=>load({force:true,preserveScroll:true}),openPlanner});activate();
  })();`;
}
