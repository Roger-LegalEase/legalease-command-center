export const RELATIONSHIP_DRAWER_STYLESHEET_PATH = "assets/ui/relationship-drawer.css";
export const RELATIONSHIP_DRAWER_ENDPOINT_PREFIX = "/api/ui/relationships/";

export function relationshipDrawerBrowserSource() {
  const endpointPrefix = JSON.stringify(RELATIONSHIP_DRAWER_ENDPOINT_PREFIX);
  return `(() => {
    "use strict";
    const endpointPrefix = ${endpointPrefix};
    let currentId = "";
    let currentRelationship = null;
    let lastTrigger = null;
    let savedScroll = { x:0, y:0 };
    let loading = false;
    let requestToken = 0;

    function layer() { return document.querySelector("[data-relationship-drawer]"); }
    function node(selector) { return layer()?.querySelector(selector) || null; }
    function value(...choices) {
      return choices.find((choice) => choice !== undefined && choice !== null && String(choice).trim() !== "");
    }
    function text(tag, content, className = "") {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = String(content ?? "");
      return element;
    }
    function asList(candidate) {
      if (Array.isArray(candidate)) return candidate;
      if (Array.isArray(candidate?.items)) return candidate.items;
      if (Array.isArray(candidate?.records)) return candidate.records;
      return candidate && typeof candidate === "object" ? [candidate] : [];
    }
    function labelFor(raw) {
      return String(raw || "")
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\\b\\w/g, (character) => character.toUpperCase());
    }
    function formatDate(raw, includeTime = false) {
      const parsed = Date.parse(raw || "");
      if (!Number.isFinite(parsed)) return "Not available";
      return new Intl.DateTimeFormat("en-US", includeTime
        ? { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }
        : { month:"short", day:"numeric", year:"numeric" }
      ).format(new Date(parsed));
    }
    function safeHref(raw) {
      const href = String(raw || "").trim();
      if (/^#/.test(href) || /^\\/(?!\\/)/.test(href) || /^https:\\/\\//i.test(href) || /^mailto:/i.test(href)) return href;
      return "";
    }
    function empty(message) { return text("p", message, "relationship-empty"); }
    function fact(label, content) {
      const wrapper = document.createElement("div");
      wrapper.append(text("dt", label), text("dd", value(content, "Not available")));
      return wrapper;
    }
    function statusChip(content, kind = "neutral") {
      const chip = text("span", content, "relationship-chip");
      chip.dataset.kind = kind;
      return chip;
    }
    function description(item) {
      return value(item?.summary, item?.description, item?.note, item?.detail, item?.bodyPreview, item?.context);
    }
    function itemDate(item) {
      return value(item?.at, item?.occurredAt, item?.createdAt, item?.updatedAt, item?.date, item?.startAt, item?.start);
    }
    function linkFor(item) {
      return safeHref(value(item?.href, item?.url, item?.recordHref, item?.fullRecordHref, item?.googleCalendarUrl));
    }
    function titleLink(label, item) {
      const href = linkFor(item);
      if (!href) return text("strong", label);
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      link.dataset.relationshipSecondaryLink = "true";
      if (/^https:\\/\\//i.test(href)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      return link;
    }

    function ensureLayer() {
      if (layer()) return layer();
      const dialog = document.createElement("dialog");
      dialog.className = "founder-relationship-drawer";
      dialog.dataset.relationshipDrawer = "true";
      dialog.setAttribute("aria-labelledby", "founder-relationship-title");
      dialog.innerHTML = '<div class="founder-relationship-frame">'
        + '<header class="founder-relationship-header"><div><p class="relationship-eyebrow">Relationship</p><h2 id="founder-relationship-title" data-relationship-title tabindex="-1">Relationship</h2></div><button type="button" class="founder-relationship-close" data-relationship-close aria-label="Close relationship details">×</button></header>'
        + '<div class="relationship-announcer" data-relationship-announcer role="status" aria-live="polite"></div>'
        + '<div class="relationship-loading" data-relationship-loading aria-label="Opening relationship"><div class="relationship-skeleton relationship-skeleton--hero"></div><div class="relationship-skeleton-grid"><div class="relationship-skeleton"></div><div class="relationship-skeleton"></div><div class="relationship-skeleton"></div><div class="relationship-skeleton"></div></div></div>'
        + '<div class="relationship-load-error" data-relationship-error hidden role="alert"><h3>Relationship could not load</h3><p>No changes were made. Try again.</p><button type="button" data-relationship-retry>Try again</button></div>'
        + '<div class="founder-relationship-content" data-relationship-content hidden>'
          + '<section class="relationship-overview" aria-labelledby="relationship-overview-title"><div class="relationship-chip-row" data-relationship-chips></div><h3 id="relationship-overview-title" class="relationship-visually-hidden">Overview</h3><p class="relationship-summary" data-relationship-summary></p><dl class="relationship-facts" data-relationship-facts></dl><div class="relationship-next-action" data-relationship-next-action hidden></div><div class="relationship-primary-actions"><button type="button" class="relationship-primary-button" data-relationship-draft>Draft follow-up</button><div data-relationship-overview-links></div></div></section>'
          + '<div class="relationship-section-grid">'
            + '<section class="relationship-section" id="relationship-contacts"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">People</p><h3>Contacts</h3></div><span data-relationship-contacts-count></span></div><div class="relationship-card-list" data-relationship-contacts></div></section>'
            + '<section class="relationship-section relationship-section--wide" id="relationship-activity"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">Conversation</p><h3>Recent activity</h3></div><span data-relationship-activity-count></span></div><ol class="relationship-timeline" data-relationship-activity></ol></section>'
            + '<section class="relationship-section" id="relationship-tasks"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">Commitments</p><h3>Tasks</h3></div><span data-relationship-tasks-count></span></div><div class="relationship-card-list" data-relationship-tasks></div></section>'
            + '<section class="relationship-section" id="relationship-outreach"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">Follow-through</p><h3>Outreach</h3></div><span data-relationship-outreach-count></span></div><div class="relationship-card-list" data-relationship-outreach></div></section>'
            + '<section class="relationship-section" id="relationship-meetings"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">Time together</p><h3>Meetings</h3></div><span data-relationship-meetings-count></span></div><div class="relationship-card-list" data-relationship-meetings></div></section>'
            + '<section class="relationship-section" id="relationship-notes"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">Context</p><h3>Notes</h3></div><span data-relationship-notes-count></span></div><div class="relationship-card-list" data-relationship-notes></div></section>'
            + '<section class="relationship-section relationship-section--wide" id="relationship-files"><div class="relationship-section-heading"><div><p class="relationship-eyebrow">Reference</p><h3>Files</h3></div><span data-relationship-files-count></span></div><div class="relationship-file-list" data-relationship-files></div></section>'
          + '</div>'
          + '<footer class="founder-relationship-footer"><nav aria-label="Related records" data-relationship-links></nav><button type="button" class="relationship-secondary-button" data-relationship-close>Close</button></footer>'
        + '</div>'
      + '</div>';
      document.body.append(dialog);
      bindLayer(dialog);
      return dialog;
    }

    function announce(message, kind = "success") {
      const target = node("[data-relationship-announcer]");
      if (!target) return;
      target.textContent = message || "";
      target.dataset.kind = message ? kind : "";
    }
    function showLoading() {
      loading = true;
      announce("");
      node("[data-relationship-title]").textContent = "Relationship";
      node("[data-relationship-loading]").hidden = false;
      node("[data-relationship-error]").hidden = true;
      node("[data-relationship-content]").hidden = true;
      layer()?.setAttribute("aria-busy", "true");
    }
    function showError(message) {
      loading = false;
      node("[data-relationship-loading]").hidden = true;
      node("[data-relationship-content]").hidden = true;
      const target = node("[data-relationship-error]");
      target.hidden = false;
      target.querySelector("p").textContent = message || "No changes were made. Try again.";
      layer()?.removeAttribute("aria-busy");
      target.querySelector("button")?.focus();
    }
    function setCount(name, count) {
      const target = node('[data-relationship-' + name + '-count]');
      if (target) target.textContent = count ? count + (count === 1 ? " item" : " items") : "";
    }
    function replaceWithEmpty(host, items, message) {
      host.replaceChildren();
      if (!items.length) host.append(empty(message));
    }

    function renderContacts(relationship) {
      let contacts = asList(relationship.contacts);
      if (!contacts.length && value(relationship.primaryContact, relationship.email)) {
        contacts = [{ name:relationship.primaryContact, email:relationship.email, role:relationship.primaryContactRole }];
      }
      const host = node("[data-relationship-contacts]");
      replaceWithEmpty(host, contacts, "No contacts are connected yet.");
      contacts.forEach((contact) => {
        const card = document.createElement("article");
        card.className = "relationship-card";
        const heading = text("strong", value(contact.name, contact.displayName, contact.fullName, contact.email, "Contact"));
        const role = value(contact.role, contact.title, contact.position, contact.relationship);
        const organization = value(contact.organizationName, contact.organization?.name, contact.company, contact.orgName);
        const email = value(contact.email, contact.primaryEmail);
        card.append(heading);
        if (role || organization) card.append(text("p", [role, organization].filter(Boolean).join(" · ")));
        if (email) {
          const emailLink = document.createElement("a");
          emailLink.href = "mailto:" + encodeURIComponent(String(email));
          emailLink.textContent = String(email);
          card.append(emailLink);
        }
        const phone = value(contact.phone, contact.phoneNumber);
        if (phone) card.append(text("p", phone));
        host.append(card);
      });
      setCount("contacts", contacts.length);
    }

    function renderActivity(relationship) {
      const items = asList(value(relationship.activity, relationship.timeline, relationship.activities, relationship.conversationTimeline));
      const host = node("[data-relationship-activity]");
      replaceWithEmpty(host, items, "No activity has been recorded yet.");
      items.forEach((item) => {
        const row = document.createElement("li");
        const marker = document.createElement("span");
        marker.setAttribute("aria-hidden", "true");
        const body = document.createElement("div");
        const label = value(item.title, item.label, item.action, item.type, item.eventType, "Activity");
        const heading = document.createElement("p");
        heading.append(text("strong", labelFor(label)));
        const date = itemDate(item);
        if (date) heading.append(document.createTextNode(" · " + formatDate(date, true)));
        body.append(heading);
        const detail = description(item);
        if (detail) body.append(text("p", detail));
        const href = linkFor(item);
        if (href) {
          const link = titleLink(value(item.linkLabel, "Open context"), { href });
          link.classList.add("relationship-text-link");
          body.append(link);
        }
        row.append(marker, body);
        host.append(row);
      });
      setCount("activity", items.length);
    }

    function renderTasks(relationship) {
      const tasks = asList(value(relationship.tasks, relationship.commitments));
      const host = node("[data-relationship-tasks]");
      replaceWithEmpty(host, tasks, "No open tasks are connected.");
      tasks.forEach((task) => {
        const card = document.createElement("article");
        card.className = "relationship-card relationship-card--actionable";
        const title = value(task.title, task.name, task.summary, "Task");
        const taskId = value(task.id, task.taskId);
        if (taskId) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "relationship-title-button";
          button.dataset.taskOpen = "true";
          button.dataset.taskId = String(taskId);
          button.textContent = String(title);
          card.append(button);
        } else {
          card.append(titleLink(title, task));
        }
        const status = value(task.status, task.state);
        const due = value(task.dueDate, task.dueAt);
        const metadata = [status ? labelFor(status) : "", due ? "Due " + formatDate(due) : ""].filter(Boolean);
        if (metadata.length) card.append(text("p", metadata.join(" · ")));
        const detail = description(task);
        if (detail && detail !== title) card.append(text("p", detail));
        host.append(card);
      });
      setCount("tasks", tasks.length);
    }

    function renderOutreach(relationship) {
      const items = asList(value(relationship.outreach, relationship.outreachActivity, relationship.outreachAttempts, relationship.attempts));
      const host = node("[data-relationship-outreach]");
      replaceWithEmpty(host, items, "No outreach activity is connected.");
      items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "relationship-card";
        const title = value(item.title, item.campaignName, item.sequenceName, item.channel, item.type, "Outreach activity");
        card.append(titleLink(labelFor(title), item));
        const status = value(item.result, item.status, item.replyState, item.outcome);
        const date = itemDate(item);
        if (status || date) card.append(text("p", [status ? labelFor(status) : "", date ? formatDate(date, true) : ""].filter(Boolean).join(" · ")));
        const detail = description(item);
        if (detail) card.append(text("p", detail));
        host.append(card);
      });
      setCount("outreach", items.length);
    }

    function renderMeetings(relationship) {
      const meetings = asList(value(relationship.meetings, relationship.calendarEvents, relationship.events));
      const host = node("[data-relationship-meetings]");
      replaceWithEmpty(host, meetings, "No meetings are connected.");
      meetings.forEach((meeting) => {
        const card = document.createElement("article");
        card.className = "relationship-card";
        card.append(titleLink(value(meeting.title, meeting.name, meeting.summary, "Meeting"), meeting));
        const date = itemDate(meeting);
        const location = value(meeting.location, meeting.meetingLocation);
        if (date || location) card.append(text("p", [date ? formatDate(date, true) : "", location].filter(Boolean).join(" · ")));
        const detail = description(meeting);
        if (detail && detail !== meeting.title) card.append(text("p", detail));
        host.append(card);
      });
      setCount("meetings", meetings.length);
    }

    function renderNotes(relationship) {
      const notes = asList(relationship.notes).map((note) => typeof note === "string" ? { note } : note);
      const host = node("[data-relationship-notes]");
      replaceWithEmpty(host, notes, "No notes have been added.");
      notes.forEach((note) => {
        const card = document.createElement("article");
        card.className = "relationship-card";
        const detail = description(note);
        if (detail) card.append(text("p", detail));
        const date = itemDate(note);
        const author = value(note.authorName, note.author, note.createdBy);
        if (author || date) card.append(text("small", [author, date ? formatDate(date, true) : ""].filter(Boolean).join(" · ")));
        host.append(card);
      });
      setCount("notes", notes.length);
    }

    function renderFiles(relationship) {
      const files = asList(value(relationship.files, relationship.attachments));
      const host = node("[data-relationship-files]");
      replaceWithEmpty(host, files, "No files are connected.");
      files.forEach((file) => {
        const row = document.createElement("article");
        const identity = text("span", String(value(file.fileType, file.type, "File")).slice(0, 1).toUpperCase());
        identity.setAttribute("aria-hidden", "true");
        const body = document.createElement("div");
        body.append(titleLink(value(file.name, file.title, file.filename, "File"), file));
        const meta = [value(file.fileType, file.type), value(file.sizeLabel, file.category)].filter(Boolean);
        if (meta.length) body.append(text("p", meta.join(" · ")));
        row.append(identity, body);
        host.append(row);
      });
      setCount("files", files.length);
    }

    function normalizedLinks(relationship) {
      const links = [];
      const supplied = relationship.links;
      if (Array.isArray(supplied)) links.push(...supplied);
      else if (supplied && typeof supplied === "object") {
        Object.entries(supplied).forEach(([label, entry]) => {
          if (typeof entry === "string") links.push({ label:labelFor(label), href:entry });
          else if (entry) links.push({ label:value(entry.label, labelFor(label)), ...entry });
        });
      }
      const known = [
        ["Open full record", relationship.fullRecordHref],
        ["Open campaign", relationship.campaignHref],
        ["Open support issue", relationship.supportIssueHref],
        ["Open Gmail context", relationship.gmailHref]
      ];
      known.forEach(([label, href]) => { if (href) links.push({ label, href }); });
      const seen = new Set();
      return links.filter((entry) => {
        const href = safeHref(value(entry.href, entry.url));
        if (!href || seen.has(href)) return false;
        seen.add(href);
        entry.href = href;
        return true;
      });
    }

    function renderLinks(relationship) {
      const links = normalizedLinks(relationship);
      const footer = node("[data-relationship-links]");
      const overview = node("[data-relationship-overview-links]");
      footer.replaceChildren();
      overview.replaceChildren();
      links.forEach((entry, index) => {
        const link = document.createElement("a");
        link.href = entry.href;
        link.textContent = value(entry.label, entry.title, "Open related record");
        link.dataset.relationshipSecondaryLink = "true";
        if (/^https:\\/\\//i.test(entry.href)) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        (index === 0 ? overview : footer).append(link);
      });
      footer.hidden = links.length < 2;
    }

    function render(payload) {
      const base = value(payload?.relationship, payload?.detail, payload?.data?.relationship, payload?.data, payload);
      const outreach = payload?.outreach || base?.outreach;
      const relationship = {
        ...base,
        contacts:base?.contacts || payload?.contacts,
        activity:base?.activity || base?.timeline || payload?.timeline,
        tasks:base?.tasks || payload?.tasks,
        outreach:Array.isArray(outreach) ? outreach : [
          ...asList(outreach?.campaigns),
          ...asList(outreach?.attempts),
          ...asList(outreach?.replies)
        ],
        meetings:base?.meetings || payload?.meetings,
        notes:base?.notes || payload?.notes,
        files:base?.files || payload?.files,
        links:base?.links || payload?.links
      };
      currentRelationship = relationship;
      const displayName = value(relationship.name, relationship.displayName, relationship.personName, relationship.organizationName, relationship.organization?.name, "Relationship");
      currentId = String(value(relationship.id, relationship.relationshipId, currentId));
      node("[data-relationship-title]").textContent = displayName;
      const chips = node("[data-relationship-chips]");
      chips.replaceChildren();
      const category = value(relationship.categoryLabel, relationship.category?.label, relationship.category, relationship.relationshipCategory, relationship.relationshipType, relationship.type);
      const stage = value(relationship.stageLabel, relationship.stage?.label, relationship.stage, relationship.relationshipStage);
      const eligibility = value(relationship.eligibilityStatus, relationship.suppressionStatus, relationship.eligibility?.label,
        relationship.suppressed === true ? "Suppressed" : relationship.eligible === true ? "Eligible" : relationship.eligible === false ? "Needs attention" : "");
      if (category) chips.append(statusChip(labelFor(category), "category"));
      if (stage) chips.append(statusChip(labelFor(stage), "stage"));
      if (eligibility) chips.append(statusChip(labelFor(eligibility), /suppressed|ineligible|attention/i.test(eligibility) ? "attention" : "eligible"));
      node("[data-relationship-summary]").textContent = value(relationship.summary, relationship.description, relationship.contextSummary, "No relationship summary is available yet.");
      const organization = value(relationship.organizationName, relationship.organization?.name, relationship.companyName, relationship.company);
      const contact = value(relationship.primaryContact, relationship.contactName, relationship.contact?.name);
      const email = value(relationship.email, relationship.primaryEmail, relationship.contact?.email);
      const facts = node("[data-relationship-facts]");
      facts.replaceChildren(
        fact("Organization", organization),
        fact("Primary contact", contact),
        fact("Email", email),
        fact("Owner", value(relationship.owner, relationship.ownerName)),
        fact("Last inbound", formatDate(value(relationship.lastInboundAt, relationship.lastInboundInteraction), true)),
        fact("Last outbound", formatDate(value(relationship.lastOutboundAt, relationship.lastOutboundInteraction), true)),
        fact("Next follow-up", formatDate(value(relationship.nextFollowUpDate, relationship.followUpDate, relationship.nextActionDueAt))),
        fact("Reply state", labelFor(value(relationship.replyStateLabel, relationship.replyState?.label, relationship.replyState, relationship.recentReplyState, "Not available")))
      );
      const rawNextAction = relationship.nextAction;
      const nextAction = value(rawNextAction?.title, rawNextAction?.summary, rawNextAction?.label, rawNextAction?.name,
        typeof rawNextAction === "string" ? rawNextAction : "");
      const nextActionHost = node("[data-relationship-next-action]");
      nextActionHost.replaceChildren();
      if (nextAction) {
        nextActionHost.append(text("span", "Next action"), text("strong", nextAction));
        const due = value(relationship.nextAction?.dueDate, relationship.nextAction?.dueAt, relationship.nextActionDueAt);
        if (due) nextActionHost.append(text("small", "Due " + formatDate(due)));
        nextActionHost.hidden = false;
      } else {
        nextActionHost.hidden = true;
      }
      renderContacts(relationship);
      renderActivity(relationship);
      renderTasks(relationship);
      renderOutreach(relationship);
      renderMeetings(relationship);
      renderNotes(relationship);
      renderFiles(relationship);
      renderLinks(relationship);
      loading = false;
      node("[data-relationship-loading]").hidden = true;
      node("[data-relationship-error]").hidden = true;
      node("[data-relationship-content]").hidden = false;
      layer()?.removeAttribute("aria-busy");
      requestAnimationFrame(() => node("[data-relationship-title]")?.focus());
    }

    async function loadRelationship(id) {
      const token = ++requestToken;
      try {
        const response = await fetch(endpointPrefix + encodeURIComponent(id), { credentials:"same-origin", headers:{ accept:"application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (token !== requestToken) return;
        if (response.status === 401 || payload.outcome === "session_expired") {
          close({ restoreFocus:false });
          document.dispatchEvent(new CustomEvent("vnext:session-expired"));
          return;
        }
        if (!response.ok || payload.ok === false) throw new Error(payload.message || "Relationship could not load. No changes were made.");
        render(payload);
      } catch (error) {
        if (token !== requestToken) return;
        showError(error.message || "Relationship could not load. No changes were made. Try again.");
      }
    }
    async function open(id, trigger = null) {
      const relationshipId = String(id || "").trim();
      if (!relationshipId) return;
      const target = ensureLayer();
      currentId = relationshipId;
      currentRelationship = null;
      lastTrigger = trigger || document.activeElement;
      savedScroll = { x:window.scrollX, y:window.scrollY };
      target.dataset.relationshipId = relationshipId;
      showLoading();
      if (!target.open) target.showModal();
      await loadRelationship(relationshipId);
    }
    function close({ restoreFocus = true } = {}) {
      const target = layer();
      requestToken += 1;
      loading = false;
      if (target?.open) target.close();
      currentRelationship = null;
      requestAnimationFrame(() => window.scrollTo(savedScroll.x, savedScroll.y));
      if (restoreFocus && lastTrigger?.isConnected) setTimeout(() => lastTrigger.focus(), 0);
    }
    function openComposer(button) {
      if (typeof window.commandCenterOpenComposer !== "function") {
        announce("The follow-up composer is still loading. Try again.", "error");
        return;
      }
      const relationshipId = currentId;
      button.disabled = true;
      button.textContent = "Opening…";
      close({ restoreFocus:false });
      try {
        window.commandCenterOpenComposer({ sourceKind:"relationship", sourceId:relationshipId });
      } catch {
        button.disabled = false;
        button.textContent = "Draft follow-up";
      }
    }
    function bindLayer(target) {
      target.addEventListener("click", (event) => {
        if (event.target.closest("[data-relationship-close]")) { close(); return; }
        if (event.target.closest("[data-relationship-retry]")) { showLoading(); loadRelationship(currentId); return; }
        const draft = event.target.closest("[data-relationship-draft]");
        if (draft) { openComposer(draft); return; }
        if (event.target.closest("[data-task-open]")) { close({ restoreFocus:false }); return; }
        const link = event.target.closest("[data-relationship-secondary-link]");
        if (link && String(link.getAttribute("href") || "").startsWith("#")) close({ restoreFocus:false });
        if (event.target === target && !loading) close();
      });
      target.addEventListener("cancel", (event) => {
        event.preventDefault();
        close();
      });
    }
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-relationship-open]");
      if (!trigger) return;
      const id = value(trigger.dataset.relationshipId, trigger.dataset.relationshipOpen);
      if (!id || id === "true") return;
      event.preventDefault();
      open(id, trigger);
    });
    document.addEventListener("vnext:session-expired", () => close({ restoreFocus:false }));
    document.addEventListener("vnext:recovery-mode", () => close({ restoreFocus:false }));
    window.commandCenterOpenRelationship = open;
    window.__LE_RELATIONSHIP_DRAWER = Object.freeze({ open, close, refresh:() => currentId && loadRelationship(currentId) });
    ensureLayer();
  })();`;
}
