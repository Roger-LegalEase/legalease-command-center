import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { renderFileDetails } from "../../scripts/ui/pages/file-details.mjs";
import { renderFilesHome } from "../../scripts/ui/pages/files-home.mjs";
import { renderInvestorRoom } from "../../scripts/ui/pages/investor-room.mjs";
import { buildFileDetails } from "../../scripts/ui/view-models/file-details.mjs";
import { buildFilesHome } from "../../scripts/ui/view-models/files-home.mjs";
import { buildInvestorRoom } from "../../scripts/ui/view-models/investor-room.mjs";

const screenshotDirectory = path.resolve("docs/ux-vnext/screenshots/ccx-607");
const actor = { authenticated:true, role:"owner" };
const state = {
  reports:[{ id:"report-1", title:"Q2 traction report", status:"current", filesCollection:"investor-room", generatedAt:"2026-07-18T10:00:00.000Z", verifiedAt:"2026-07-18T10:00:00.000Z", markdownPath:"data/reports/q2.md", owner:"Roger" }],
  dataRoomItems:[
    { id:"overview", title:"Company overview", fileName:"overview.pdf", status:"current", filesCollection:"investor-room", verifiedAt:"2026-07-01T10:00:00.000Z", updatedAt:"2026-07-18T09:00:00.000Z", owner:"Roger", starred:true },
    { id:"partner", title:"Community partner brief", fileName:"partner.md", status:"draft", filesCollection:"partner-files", updatedAt:"2026-07-17T09:00:00.000Z", partnerId:"partner-1" },
    { id:"stale", title:"Legal review", fileName:"legal.pdf", status:"current", filesCollection:"investor-room", verifiedAt:"2025-01-01T00:00:00.000Z" },
    { id:"unavailable", title:"Unclassified document", fileName:"notes.txt" }
  ],
  evidencePackNotes:[{ id:"evidence", title:"Control evidence", status:"needs_update" }],
  soc2Evidence:[], soc2Policies:[], brandAssets:[{ id:"logo", name:"LegalEase white logo", mimeType:"image/png", status:"current" }], activityEvents:[], auditHistory:[]
};
const requirements = [
  { id:"overview", name:"Company overview", section:"Company", sourceRefs:["data-room-item:overview"], staleAfterDays:90 },
  { id:"traction", name:"Traction report", section:"Traction", sourceRefs:["report:report-1"], staleAfterDays:30 },
  { id:"legal", name:"Legal review", section:"Legal & Compliance", sourceRefs:["data-room-item:stale"], staleAfterDays:90 },
  { id:"team", name:"Team biographies", section:"Team", sourceRefs:["data-room-item:missing-team"] }
];

async function styles(...files) { return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n"); }
async function render(page, body, css, width = 1440) {
  await page.setViewportSize({ width, height:width === 390 ? 844 : 900 });
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Files acceptance</title><style>${css}</style></head><body><main>${body}</main></body></html>`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("Files train renders truthful accessible responsive evidence", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive:true });
  const clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") clientErrors.push(message.text()); });
  const homeCss = await styles("assets/ui/tokens.css", "assets/ui/files-home.css", "assets/ui/files-organization.css");
  const home = buildFilesHome(state, actor, {}, { cursorSecret:"browser-files-cursor-secret" });
  await render(page, renderFilesHome(home), homeCss, 1440);
  await expect(page.getByRole("heading", { name:"Files", level:1 })).toBeVisible();
  await expect(page.getByRole("button", { name:"New" })).toBeVisible();
  await expect(page.getByRole("link", { name:"Company overview" })).toHaveAttribute("href", "#files/data-room-item/overview");
  await page.screenshot({ path:path.join(screenshotDirectory, "files-populated-1440.png"), fullPage:true, animations:"disabled" });
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => ["critical", "serious"].includes(item.impact))).toEqual([]);

  await render(page, renderFilesHome(home), homeCss, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "files-mobile-390.png"), fullPage:true, animations:"disabled" });
  const filtered = buildFilesHome(state, actor, { search:"no matching file" }, { cursorSecret:"browser-files-cursor-secret" });
  await render(page, renderFilesHome(filtered), homeCss, 1440);
  await expect(page.getByRole("heading", { name:"No files match this view" })).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "files-filtered-empty-1440.png"), fullPage:true, animations:"disabled" });
  const unavailable = buildFilesHome(state, actor, { search:"Unclassified" }, { cursorSecret:"browser-files-cursor-secret" });
  await render(page, renderFilesHome(unavailable), homeCss, 1440);
  await expect(page.getByText("Unavailable").first()).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "files-unavailable-1440.png"), fullPage:true, animations:"disabled" });

  const detailCss = await styles("assets/ui/tokens.css", "assets/ui/file-details.css");
  await render(page, renderFileDetails(buildFileDetails(state, "report:report-1", actor)), detailCss, 1440);
  await expect(page.getByRole("tab")).toHaveCount(5);
  await page.screenshot({ path:path.join(screenshotDirectory, "file-preview-1440.png"), fullPage:true, animations:"disabled" });

  const investorCss = await styles("assets/ui/tokens.css", "assets/ui/investor-room.css");
  const investor = buildInvestorRoom(state, actor, requirements, "2026-07-19T12:00:00.000Z");
  await render(page, renderInvestorRoom(investor), investorCss, 1440);
  await expect(page.getByText("50%")).toBeVisible();
  await expect(page.locator(".investor-status-needs-update")).toBeVisible();
  await expect(page.locator(".investor-status-missing")).toBeVisible();
  await page.screenshot({ path:path.join(screenshotDirectory, "investor-room-1440.png"), fullPage:true, animations:"disabled" });
  await render(page, renderInvestorRoom(investor), investorCss, 390);
  await page.screenshot({ path:path.join(screenshotDirectory, "investor-room-mobile-390.png"), fullPage:true, animations:"disabled" });
  expect(clientErrors).toEqual([]);
});
