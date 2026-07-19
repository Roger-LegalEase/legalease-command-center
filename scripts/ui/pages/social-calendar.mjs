export const SOCIAL_CALENDAR_STYLESHEET_PATH = "assets/ui/social-calendar.css";
const esc = (value = "") => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);

function postCard(item) {
  return `<article class="social-calendar-card" data-calendar-post="${esc(item.postId)}"><h3><a href="${esc(item.href)}">${esc(item.title)}</a></h3><p>${esc(item.scheduledAt || "Unscheduled")}</p><p>${esc(item.timezone || "Timezone unavailable")}</p><p>${esc((item.channels || []).map((channel) => channel.label).join(", ") || "No channels selected")}</p><button type="button" data-move-post="${esc(item.postId)}">Move date</button></article>`;
}

export function renderSocialCalendarPage(contract = {}) {
  if (!contract.ok) return `<section class="social-calendar" data-calendar-state="unavailable"><h1>Social calendar unavailable</h1><p>No protected schedule details were loaded.</p></section>`;
  return `<section class="social-calendar" data-social-calendar><header><p class="eyebrow">Social</p><h1>Calendar</h1><div role="group" aria-label="Calendar view"><button type="button" aria-pressed="true" data-calendar-view="month">Month</button><button type="button" aria-pressed="false" data-calendar-view="week">Week</button></div><label>Channel<select data-calendar-channel><option value="all">All channels</option><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="x">X</option><option value="threads">Threads</option></select></label></header><div class="social-calendar-layout"><section aria-labelledby="scheduled-title"><h2 id="scheduled-title">Scheduled Posts</h2><div class="social-calendar-grid" data-calendar-grid>${contract.items.length ? contract.items.map(postCard).join("") : '<p data-calendar-empty>No Posts are scheduled in this view.</p>'}</div></section><aside aria-labelledby="unscheduled-title"><h2 id="unscheduled-title">Unscheduled</h2>${contract.unscheduled.length ? contract.unscheduled.map(postCard).join("") : "<p>No unscheduled Posts.</p>"}</aside></div></section>`;
}
