// Prospect bulk-approval workbench (2026-07-26).
//
// Served as a LAZY RUNTIME FILE, not inline, so it costs the initial client-JavaScript budget
// nothing — the same mechanism as founder-campaigns. The legacy #prospects page ships only a
// container and a tiny loader; everything below arrives when Roger actually opens the page.
//
// What it does: GET /api/prospects/selection (the server is the one truth for what a filter
// matches), render the ranked pending list with per-row checkboxes, and submit ONE confirmed
// decision as an explicit id list to the existing /api/prospects/approve | /reject endpoints.
// The confirmation sentence mirrors describeProspectApproval in scripts/prospect-selection.mjs:
// exact organisation count, exact contactable count, and what approval does NOT do.
//
// What it cannot do: decide anything without window.confirm, approve a filter (only reviewed
// ids travel), touch a non-pending row (server refuses), or send anything (approval sits far
// upstream of every outreach gate).

const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);

function optionsHtml(values, selected) {
  return ["<option value=\"\">All</option>"].concat(values.map((value) =>
    "<option value=\"" + escapeHtml(value) + "\"" + (value === selected ? " selected" : "") + ">" + escapeHtml(value) + "</option>")).join("");
}

function rowHtml(row) {
  const meta = ["score " + row.score, row.classification || "unclassified", row.source,
    [row.city, row.state].filter(Boolean).join(", "), row.ntee_label].filter(Boolean).join(" · ");
  return "<div class=\"support-status-row\" style=\"align-items:center\">"
    + "<label style=\"display:flex;gap:10px;align-items:center;flex:1;min-width:0\">"
    + "<input type=\"checkbox\" data-prospect-id=\"" + escapeHtml(row.id) + "\">"
    + "<span style=\"min-width:0\"><strong>" + escapeHtml(row.organization_name) + "</strong> "
    + "<span class=\"muted\">" + escapeHtml(meta) + "</span>"
    + (row.hasEmail ? "" : " <span class=\"badge info\">no email yet</span>")
    + (row.is_duplicate ? " <span class=\"badge warn\">possible duplicate</span>" : "")
    + "</span></label></div>";
}

function workbenchHtml(view, filters, segments, sources) {
  const rows = view.rows || [];
  const filtering = Boolean(filters.classification || filters.source || filters.minScore || filters.q);
  return "<section class=\"growth-card\">"
    + "<div class=\"growth-card-head\"><h2>Build a selection</h2><small>" + rows.length + " of " + view.pendingTotal + " pending shown" + (filtering ? " (filtered)" : "") + "</small></div>"
    + "<div class=\"card-actions\" style=\"flex-wrap:wrap;gap:8px;align-items:flex-end\">"
    + "<label>Segment <select data-prospect-filter=\"classification\">" + optionsHtml(segments, filters.classification) + "</select></label>"
    + "<label>Source <select data-prospect-filter=\"source\">" + optionsHtml(sources, filters.source) + "</select></label>"
    + "<label>Min score <input data-prospect-filter=\"minScore\" type=\"number\" inputmode=\"numeric\" style=\"width:90px\" value=\"" + escapeHtml(filters.minScore) + "\"></label>"
    + "<label>Search <input data-prospect-filter=\"q\" type=\"search\" placeholder=\"Name, city, state, NTEE\" value=\"" + escapeHtml(filters.q) + "\"></label>"
    + "<button class=\"primary\" data-prospect-action=\"apply\">Apply filters</button>"
    + "<button data-prospect-action=\"clear\">Clear</button>"
    + "</div></section>"
    + "<section class=\"growth-card\">"
    + "<div class=\"growth-card-head\"><h2>Review and decide</h2><small data-prospect-count>0 of " + rows.length + " shown selected</small></div>"
    + "<div class=\"card-actions\" style=\"gap:8px\">"
    + "<button data-prospect-action=\"all\">Select all shown</button>"
    + "<button data-prospect-action=\"none\">Select none</button>"
    + "<button class=\"primary\" data-prospect-action=\"approve\" disabled>Approve selection (0)</button>"
    + "<button data-prospect-action=\"reject\" disabled>Reject selection (0)</button>"
    + "</div>"
    + "<p class=\"muted\" data-prospect-status></p>"
    + (rows.length === 0
      ? "<p class=\"muted\">" + (filtering ? "No pending organisations match these filters." : "Nothing is pending review.") + "</p>"
      : "<div class=\"support-status-list\">" + rows.map(rowHtml).join("") + "</div>")
    + "</section>";
}

export function prospectWorkbenchBrowserSource() {
  const renderer = [
    `const escapeHtml=${escapeHtml.toString()};`,
    `const optionsHtml=${optionsHtml.toString()};`,
    `const rowHtml=${rowHtml.toString()};`,
    `const workbenchHtml=${workbenchHtml.toString()};`
  ].join("\n");
  return `(() => { "use strict";
    ${renderer}
    let root=null, view=null, busy=false;
    const filters={classification:"",source:"",minScore:"",q:""};
    function cookieValue(name){const parts=String(document.cookie||"").split("; ");for(const part of parts){if(part.indexOf(name+"=")===0)return decodeURIComponent(part.slice(name.length+1));}return "";}
    function status(message,isError){const el=root&&root.querySelector("[data-prospect-status]");if(el){el.textContent=message||"";el.style.color=isError?"var(--danger,#b00020)":"";}}
    function selectedIds(){return Array.prototype.slice.call(root.querySelectorAll("input[data-prospect-id]:checked")).map(box=>box.getAttribute("data-prospect-id"));}
    function updateCount(){const ids=selectedIds();const total=root.querySelectorAll("input[data-prospect-id]").length;
      const count=root.querySelector("[data-prospect-count]");if(count)count.textContent=ids.length+" of "+total+" shown selected";
      const approve=root.querySelector("[data-prospect-action=approve]");if(approve){approve.textContent="Approve selection ("+ids.length+")";approve.disabled=ids.length===0||busy;}
      const reject=root.querySelector("[data-prospect-action=reject]");if(reject){reject.textContent="Reject selection ("+ids.length+")";reject.disabled=ids.length===0||busy;}}
    function setAll(checked){root.querySelectorAll("input[data-prospect-id]").forEach(box=>{box.checked=checked;});updateCount();}
    function readFilters(){root.querySelectorAll("[data-prospect-filter]").forEach(input=>{filters[input.getAttribute("data-prospect-filter")]=String(input.value||"").trim();});}
    function query(){const params=new URLSearchParams();
      if(filters.classification)params.set("classification",filters.classification);
      if(filters.source)params.set("source",filters.source);
      if(filters.minScore)params.set("minScore",filters.minScore);
      if(filters.q)params.set("q",filters.q);
      const text=params.toString();return text?"?"+text:"";}
    async function load(){const response=await fetch("/api/prospects/selection"+query(),{credentials:"same-origin",headers:{accept:"application/json"}});
      if(response.status===401){document.dispatchEvent(new CustomEvent("vnext:session-expired"));return;}
      view=await response.json().catch(()=>null);
      if(!view||!Array.isArray(view.rows)){draw();status("The ranked list could not be read.",true);return;}
      draw();}
    function segmentsOf(){const seen=[];(view&&view.rows||[]).forEach(row=>{if(row.classification&&seen.indexOf(row.classification)<0)seen.push(row.classification);});
      Object.keys(view&&view.byClassification||{}).forEach(key=>{if(seen.indexOf(key)<0)seen.push(key);});return seen.sort();}
    function sourcesOf(){const seen=Object.keys(view&&view.bySource||{});(view&&view.rows||[]).forEach(row=>{if(row.source&&seen.indexOf(row.source)<0)seen.push(row.source);});return seen.sort();}
    function draw(){if(!root)return;root.innerHTML=workbenchHtml(view||{rows:[],pendingTotal:0},filters,segmentsOf(),sourcesOf());updateCount();}
    async function decide(kind){if(busy)return;const ids=selectedIds();if(!ids.length)return;
      const chosen={};ids.forEach(id=>{chosen[id]=true;});
      let withEmail=0;(view.rows||[]).forEach(row=>{if(chosen[row.id]&&row.hasEmail)withEmail+=1;});
      const noun=ids.length===1?"organisation":"organisations";
      const message=kind==="approve"
        ?"Approve "+ids.length+" "+noun+" for partner outreach? "
          +(withEmail===0
            ?"None of them has an email address on file yet, so this makes nobody contactable by itself. "
            :withEmail+" of them "+(withEmail===1?"has":"have")+" an email address on file. ")
          +"Contact discovery, not-eligible-to-contact checks, sending windows and every safeguard still apply before any email exists or sends."
        :"Reject "+ids.length+" "+noun+"? They leave the ranked list and will not be contacted.";
      if(!window.confirm(message))return;
      busy=true;updateCount();status(kind==="approve"?"Approving…":"Rejecting…");
      try{const response=await fetch(kind==="approve"?"/api/prospects/approve":"/api/prospects/reject",{
          method:"POST",credentials:"same-origin",
          headers:{accept:"application/json","content-type":"application/json","x-csrf-token":cookieValue("leos_csrf")},
          body:JSON.stringify({ids})});
        if(response.status===401){document.dispatchEvent(new CustomEvent("vnext:session-expired"));return;}
        const body=await response.json().catch(()=>({}));
        if(!response.ok||body.ok!==true)throw new Error(body.error||"The decision was not saved.");
        const done=Number(kind==="approve"?body.approved:body.rejected)||0;
        const skipped=Number(body.skipped)||0;
        busy=false;
        await load();
        status((kind==="approve"?"Approved ":"Rejected ")+done+" "+(done===1?"organisation":"organisations")
          +(skipped>0?" — "+skipped+" already decided elsewhere.":"."));
      }catch(error){busy=false;updateCount();status(error&&error.message?error.message:"The decision was not saved.",true);}}
    function mount(element){if(!element)return;root=element;
      if(!root.__prospectWired){root.__prospectWired=true;
        root.addEventListener("change",event=>{if(event.target&&event.target.hasAttribute("data-prospect-id"))updateCount();});
        root.addEventListener("click",event=>{const button=event.target&&event.target.closest?event.target.closest("[data-prospect-action]"):null;if(!button)return;
          const action=button.getAttribute("data-prospect-action");
          if(action==="apply"){readFilters();void load();}
          else if(action==="clear"){filters.classification="";filters.source="";filters.minScore="";filters.q="";void load();}
          else if(action==="all")setAll(true);
          else if(action==="none")setAll(false);
          else if(action==="approve")void decide("approve");
          else if(action==="reject")void decide("reject");});}
      void load();}
    window.__LE_PROSPECT_WORKBENCH=Object.freeze({mount});
  })();`;
}
