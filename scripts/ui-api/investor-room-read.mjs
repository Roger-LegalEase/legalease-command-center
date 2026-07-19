import { buildInvestorRoom } from "../ui/view-models/investor-room.mjs";

export const INVESTOR_ROOM_ENDPOINT = "/api/ui/files/investor-room";

export function readInvestorRoom({ state = {}, actor = {}, requirements = [], now = "" } = {}) {
  return buildInvestorRoom(state, actor, requirements, now);
}
