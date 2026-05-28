import { createStore } from "./storage.mjs";
import { saveStateSnapshotFile } from "./state-integrity.mjs";

const store = createStore({});
const state = await store.readState();
const result = await saveStateSnapshotFile(state);

console.log(JSON.stringify({
  filePath: result.filePath,
  generated_at: result.snapshot.generated_at,
  collection_counts: result.snapshot.collection_counts,
  live_gates_count: result.snapshot.live_gates_count,
  no_external_actions_confirmation: result.snapshot.no_external_actions_confirmation
}, null, 2));
