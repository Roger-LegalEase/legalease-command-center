const freezeList = (values) => Object.freeze(values.map((value) => Object.freeze({
  ...value,
  collections:Object.freeze([...(value.collections || [])])
})));

export const GLOBAL_SEARCH_LIMITS = Object.freeze({
  queryLength:160,
  defaultResults:36,
  maximumResults:60,
  recentRecords:8,
  contextLength:220
});

export const GLOBAL_SEARCH_GROUPS = freezeList([
  { id:"posts", label:"Posts", objectType:"Post", collections:["posts"] },
  { id:"campaigns", label:"Campaigns", objectType:"Campaign", collections:["campaigns"] },
  { id:"partners", label:"Partners", objectType:"Partner", collections:["partners"] },
  { id:"files", label:"Files", objectType:"File", collections:["dataRoomItems", "evidencePackNotes", "soc2Evidence", "soc2Policies", "brandAssets"] },
  { id:"tasks", label:"Tasks", objectType:"Task", collections:["tasks"] },
  { id:"reports", label:"Reports", objectType:"Report", collections:["reports"] }
]);
