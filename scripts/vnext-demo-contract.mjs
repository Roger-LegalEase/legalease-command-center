export const VNEXT_DEMO_DESTINATIONS = Object.freeze([
  "Today",
  "Social",
  "Outreach",
  "Partners",
  "Files"
]);

const WORKFLOW_REFERENCES = Object.freeze({
  today: Object.freeze({ collection: "tasks", id: "demo-task-fulton-kickoff", route: "#today" }),
  social: Object.freeze({ collection: "posts", id: "demo-post-review", route: "#social/post/demo-post-review" }),
  outreach: Object.freeze({ collection: "campaigns", id: "demo-campaign-county-intake", route: "#outreach/campaign/demo-campaign-county-intake" }),
  partners: Object.freeze({ collection: "partners", id: "demo-partner-fulton", route: "#partners/demo-partner-fulton" }),
  files: Object.freeze({ collection: "dataRoomItems", id: "demo-dr-compliance", route: "#files" })
});

function requireRecord(state, reference) {
  const records = Array.isArray(state?.[reference.collection]) ? state[reference.collection] : [];
  if (!records.some((record) => record?.id === reference.id)) {
    throw new Error(`vNext demo reference is missing: ${reference.collection}/${reference.id}`);
  }
}

export function applyVNextDemoContract(state, { generatedAt } = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("A persisted Command Center state object is required.");
  }

  for (const reference of Object.values(WORKFLOW_REFERENCES)) {
    requireRecord(state, reference);
  }

  const posts = Array.isArray(state.posts)
    ? state.posts.map((post) => ({
        ...post,
        _version: Number.isInteger(post?._version) && post._version > 0 ? post._version : 1
      }))
    : [];

  return {
    ...state,
    posts,
    settings: {
      ...(state.settings || {}),
      vnextDemo: {
        schemaVersion: "1.1",
        generatedAt: generatedAt || new Date().toISOString(),
        source: "persisted-local-demo-dataset",
        primaryDestinations: [...VNEXT_DEMO_DESTINATIONS],
        workflows: Object.fromEntries(
          Object.entries(WORKFLOW_REFERENCES).map(([name, reference]) => [name, { ...reference }])
        ),
        externalActionsEnabled: false,
        proof: "Edits are written through scoped application APIs and verified after reload."
      }
    }
  };
}
