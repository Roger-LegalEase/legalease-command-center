export const FILES_REPORT_GENERATE_ENDPOINT = "/api/ui/files/reports/generate";

export function renderFilesReportActions() {
  return `<section class="files-report-actions" aria-labelledby="files-report-title"><div><h2 id="files-report-title">Generate report</h2><p>A generated draft is saved once as a File. Review it before choosing a collection or sharing.</p></div><form data-files-report-form><label>Report type<select name="reportType" required><option value="">Choose report</option><option value="weekly_operating">Weekly operating report</option><option value="campaign_results">Campaign results report</option><option value="investor_update">Investor update draft</option></select></label><button type="submit">Generate report</button><p data-files-report-status role="status" aria-live="polite"></p></form></section>`;
}
