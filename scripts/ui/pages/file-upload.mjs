import { escapeHtml } from "../html.mjs";
import { FILE_UPLOAD_LIMITS } from "../../files-storage-adapter.mjs";

export const FILE_UPLOAD_ENDPOINT = "/api/ui/files/upload";
export const FILE_UPLOAD_STYLESHEET = "/assets/ui/file-upload.css";

export function renderFileUploadDialog() {
  return `<section class="file-upload-dialog" data-file-upload-dialog role="dialog" aria-modal="true" aria-labelledby="file-upload-title" hidden tabindex="-1"><form data-file-upload-form><header><h2 id="file-upload-title">Upload file</h2><p>The file stays private unless access is granted separately.</p></header><label>File name<input name="name" maxlength="200" required></label><label>Collection<select name="collection"><option value="">No collection</option><option value="brand-assets">Brand Assets</option><option value="partner-files">Partner Files</option><option value="campaign-assets">Campaign Assets</option><option value="investor-room">Investor Room</option><option value="compliance-evidence">Compliance &amp; Evidence</option></select></label><label>Choose file<input name="file" type="file" required></label><p class="file-upload-help">Maximum ${escapeHtml(Math.round(FILE_UPLOAD_LIMITS.maxBytes / 1024 / 1024))} MB. PDF, image, text, Markdown, CSV, Word, Excel, and PowerPoint files are supported.</p><div data-file-upload-status role="status" aria-live="polite"></div><footer><button type="button" data-file-upload-cancel>Cancel</button><button type="submit" class="file-upload-primary">Upload</button></footer></form></section>`;
}
