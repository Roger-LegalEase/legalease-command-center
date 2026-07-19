import { buildFilesHome } from "../ui/view-models/files-home.mjs";

export const FILES_HOME_ENDPOINT = "/api/ui/files";

export function readFilesHome({ state = {}, actor = {}, query = {}, cursorSecret = "" } = {}) {
  return buildFilesHome(state, actor, query, { cursorSecret });
}
