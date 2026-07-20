import { DISCOVERY_HELP_ITEMS } from "../../discovery-help.mjs";

export function discoveryHelpBrowserSource() {
  const items = JSON.stringify(DISCOVERY_HELP_ITEMS).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const items=${items};let opener=null;
    const root=()=>document.querySelector("[data-discovery-help]");const drawer=()=>root()?.querySelector('[role="dialog"]');
    function selected(id){root()?.querySelectorAll("[data-help-topic]").forEach(button=>button.setAttribute("aria-current",String(button.dataset.helpTopic===id)));root()?.querySelectorAll("[data-help-panel]").forEach(panel=>panel.hidden=panel.dataset.helpPanel!==id);}
    function context(){const destination=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash||"#today")?.destination;return items.find(item=>item.destinations.includes(destination))?.id||"overview";}
    function open(returnTarget){opener=returnTarget||document.activeElement;root().hidden=false;selected(context());drawer()?.focus();}
    function close(){root().hidden=true;opener?.isConnected&&opener.focus();}
    function safeRoute(action){const result=window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(action?.href||"");return result?.kind==="page"&&result.destination===action.expectedDestination?result.safeHash:"";}
    function action(id){const item=items.find(entry=>entry.id===id);if(!item)return;if(item.action.kind==="close")return close();if(item.action.kind==="onboarding"){close();return document.dispatchEvent(new CustomEvent("vnext:open-onboarding",{detail:{returnTarget:opener}}));}const href=safeRoute(item.action);if(href){close();location.hash=href.slice(1);}}
    function bind(){const container=root();if(!container||container.dataset.bound==="true")return;container.dataset.bound="true";container.querySelectorAll("[data-help-close]").forEach(button=>button.addEventListener("click",close));container.querySelectorAll("[data-help-topic]").forEach(button=>button.addEventListener("click",()=>selected(button.dataset.helpTopic)));container.querySelectorAll("[data-help-action]").forEach(button=>button.addEventListener("click",()=>action(button.dataset.helpItem)));container.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();close();return;}if(event.key!=="Tab")return;const controls=[...container.querySelectorAll('button:not([disabled]):not([tabindex="-1"])')];const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});}
    document.addEventListener("vnext:open-contextual-help",event=>open(event.detail?.returnTarget));document.addEventListener("click",event=>{const trigger=event.target.closest('[data-shell-action="open-contextual-help"]');if(trigger){event.preventDefault();open(trigger);}});bind();window.__LE_DISCOVERY_HELP=Object.freeze({open,close});
  })();`;
}
