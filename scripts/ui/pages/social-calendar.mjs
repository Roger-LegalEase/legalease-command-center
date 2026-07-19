export const SOCIAL_CALENDAR_STYLESHEET_PATH = "assets/ui/social-calendar.css";
const esc = (value = "") => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);

function postCard(item) {
  return `<article class="social-calendar-card" data-calendar-post="${esc(item.postId)}" data-calendar-channels="${esc((item.channels || []).map((channel) => channel.channel).join(" "))}"><h3><a href="${esc(item.href)}">${esc(item.title)}</a></h3><p>${esc(item.scheduledAt || "Unscheduled")}</p><p>${esc(item.timezone || "Timezone unavailable")}</p><p>${esc((item.channels || []).map((channel) => channel.label).join(", ") || "No channels selected")}</p><button type="button" data-move-post="${esc(item.postId)}">Move date</button></article>`;
}

export function renderSocialCalendarPage(contract = {}) {
  if (!contract.ok) return `<section class="social-calendar" data-calendar-state="unavailable"><h1>Social calendar unavailable</h1><p>No protected schedule details were loaded.</p></section>`;
  return `<section class="social-calendar" data-social-calendar data-calendar-active-view="month"><header><p class="eyebrow">Social</p><h1>Calendar</h1><div role="group" aria-label="Calendar view"><button type="button" aria-pressed="true" data-calendar-view="month">Month</button><button type="button" aria-pressed="false" data-calendar-view="week">Week</button></div><label>Channel<select data-calendar-channel><option value="all">All channels</option><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="x">X</option><option value="threads">Threads</option></select></label><p class="social-calendar-status" data-calendar-view-status role="status">Month view · All channels</p></header><div class="social-calendar-layout"><section aria-labelledby="scheduled-title"><h2 id="scheduled-title">Scheduled Posts</h2><div class="social-calendar-grid" data-calendar-grid>${contract.items.length ? contract.items.map(postCard).join("") : '<p data-calendar-empty>No Posts are scheduled in this view.</p>'}</div></section><aside aria-labelledby="unscheduled-title"><h2 id="unscheduled-title">Unscheduled</h2>${contract.unscheduled.length ? contract.unscheduled.map(postCard).join("") : "<p>No unscheduled Posts.</p>"}</aside></div></section>`;
}

function calendarClient() {
  const root = document.querySelector("[data-social-calendar]"); if (!root) return;
  const channel = root.querySelector("[data-calendar-channel]"); const status = root.querySelector("[data-calendar-view-status]");
  const update = () => { const view = root.dataset.calendarActiveView || "month"; const selected = channel?.value || "all"; root.querySelectorAll("[data-calendar-post]").forEach((card) => { card.hidden = selected !== "all" && !String(card.dataset.calendarChannels || "").split(" ").includes(selected); }); if (status) status.textContent = (view === "week" ? "Week" : "Month") + " view · " + (selected === "all" ? "All channels" : channel.selectedOptions[0].textContent); };
  root.querySelectorAll("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => { root.dataset.calendarActiveView = button.dataset.calendarView; root.querySelectorAll("[data-calendar-view]").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); update(); }));
  channel?.addEventListener("change", update);
  root.querySelectorAll("[data-move-post]").forEach((button) => button.addEventListener("click", () => root.dispatchEvent(new CustomEvent("vnext:social-move-date", { bubbles:true, detail:{ postId:button.dataset.movePost } }))));
  update();
}

export function socialCalendarBrowserSource() { return `(${calendarClient.toString()})();`; }
