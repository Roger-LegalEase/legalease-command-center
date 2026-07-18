import {
  comparePostChannels,
  collectPostChannelVariantSources,
  normalizePostChannel,
  postChannelLabel
} from "./post-channel-variant-sources.mjs";

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const CONTENT_FIELDS = Object.freeze(["headline", "body", "hook", "cta", "hashtags"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeCopy(value = "", limit = 10_000) {
  const text = clean(value);
  if (!text) return null;
  if (/data:image\//i.test(text) || /(?:^|\s)(?:\/(?:private|home|users|var|tmp)\/|[a-z]:\\)/i.test(text)) return null;
  if (/\b(?:access|refresh|storage|service.?role|oauth)[_ -]?(?:token|key)|\bcredential|\bprovider payload|\bsecret\b/i.test(text)) return null;
  if (/https?:\/\/[^\s]+[?&](?:token|signature|sig|key|credential|x-amz-credential)=/i.test(text)) return null;
  return text.slice(0, limit);
}

function hashtagValues(value) {
  const values = Array.isArray(value) ? value : clean(value).split(/[\s,]+/u);
  return [...new Set(values.map((item) => safeCopy(item, 100)).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en-US"));
}

function normalizedFieldValue(field, presence) {
  if (!presence?.present) return null;
  if (field === "hashtags") return hashtagValues(presence.value);
  return safeCopy(presence.value);
}

function sharedField(field, presence, explicitBlankFields) {
  const explicitlyBlank = explicitBlankFields.includes(field)
    || (field === "hashtags" && presence.present && Array.isArray(presence.value) && presence.value.length === 0);
  if (explicitlyBlank) return { value: field === "hashtags" ? [] : null, source: "shared", state: "explicitly_blank", explicitlyBlank: true };
  const value = normalizedFieldValue(field, presence);
  const available = field === "hashtags" ? Array.isArray(value) && value.length > 0 : Boolean(value);
  return available
    ? { value, source: "shared", state: "stored", explicitlyBlank: false }
    : { value: field === "hashtags" ? null : null, source: "missing", state: "missing", explicitlyBlank: false };
}

function sharedContent(source) {
  return Object.fromEntries(CONTENT_FIELDS.map((field) => [field, sharedField(field, source.shared.values[field], source.shared.explicitBlankFields)]));
}

function fallbackField(field, presence, explicitBlankFields, shared) {
  const explicitlyBlank = explicitBlankFields.includes(field)
    || (field === "hashtags" && presence.present && Array.isArray(presence.value) && presence.value.length === 0);
  if (explicitlyBlank) return { value: field === "hashtags" ? [] : null, source: "variant", state: "explicitly_blank", explicitlyBlank: true };
  const value = normalizedFieldValue(field, presence);
  const customized = field === "hashtags" ? Array.isArray(value) && value.length > 0 : Boolean(value);
  if (customized) return { value, source: "variant", state: "stored", explicitlyBlank: false };
  if (shared.state === "stored" || shared.state === "explicitly_blank") {
    return {
      value: Array.isArray(shared.value) ? [...shared.value] : shared.value,
      source: "shared",
      state: presence.present ? "shared_fallback_empty_override" : "shared_fallback",
      explicitlyBlank: shared.explicitlyBlank
    };
  }
  return { value: null, source: "missing", state: "missing", explicitlyBlank: false };
}

function unavailableContent() {
  return Object.fromEntries(CONTENT_FIELDS.map((field) => [field, {
    value: null,
    source: "unavailable",
    state: "ambiguous_variant",
    explicitlyBlank: false
  }]));
}

function resolveVariantCandidates(candidates = []) {
  if (!candidates.length) return { candidate: null, ambiguous: false };
  if (candidates.length === 1) return { candidate: candidates[0], ambiguous: false };
  const current = candidates.filter((candidate) => candidate.identity.isCurrent && candidate.identity.stableId);
  if (current.length === 1) return { candidate: current[0], ambiguous: false };
  const lineage = candidates[0].identity.lineageId;
  const versioned = lineage && candidates.every((candidate) => candidate.identity.lineageId === lineage && candidate.identity.version !== null);
  if (versioned) {
    const highest = Math.max(...candidates.map((candidate) => candidate.identity.version));
    const matches = candidates.filter((candidate) => candidate.identity.version === highest);
    if (matches.length === 1) return { candidate: matches[0], ambiguous: false };
  }
  return { candidate: null, ambiguous: true };
}

function sourceKey(reference = {}) {
  return `${clean(reference.sourceCollection)}:${clean(reference.sourceId)}:${clean(reference.relationship)}`;
}

function dedupeReferences(references = []) {
  const map = new Map();
  for (const reference of references.filter(Boolean)) map.set(sourceKey(reference), { ...reference });
  return [...map.values()].sort((left, right) => sourceKey(left).localeCompare(sourceKey(right), "en-US"));
}

function resolveAssetIds(assetRecords, requestedIds, relationship, scope) {
  const references = [];
  const issues = [];
  for (const requestedId of [...new Set(requestedIds)].sort((left, right) => left.localeCompare(right, "en-US"))) {
    const matches = assetRecords.filter((record) => record.aliases.includes(requestedId));
    if (matches.length !== 1) {
      issues.push({
        key: matches.length > 1 ? "ambiguous_asset_reference" : "asset_unavailable",
        scope,
        assetId: requestedId
      });
      continue;
    }
    references.push({ ...matches[0].sourceReference, relationship });
  }
  return { references: dedupeReferences(references), issues };
}

function guidanceFor(source, channel, candidate) {
  const postGuidance = source.postGuidance.find((item) => item.channel === channel)?.guidance || null;
  const selected = candidate?.formatGuidance || postGuidance || {};
  return {
    characterGuidance: selected.characterGuidance || null,
    hashtagGuidance: selected.hashtagGuidance || null,
    imageAspectGuidance: selected.imageAspectGuidance || null,
    linkGuidance: selected.linkGuidance || null,
    limitations: [...(selected.limitations || [])],
    classification: selected.classification || "advisory",
    scopeNote: "Read-only guidance; this model does not assert current platform limits."
  };
}

function unavailableResult(postId, reason) {
  return deepFreeze({
    postId: clean(postId) || null,
    shared: null,
    selectedChannels: [],
    variants: [],
    availability: {
      key: "unavailable",
      reason,
      counts: { selectedChannels: null, variants: null, customizedVariants: null, missingRelationships: null },
      issues: []
    },
    sourceReferences: [],
    performance: { postsExamined: 0, variantsExamined: 0 },
    capabilities: {
      mutatesPost: false,
      mutatesVariant: false,
      mutatesSelection: false,
      schedules: false,
      approves: false,
      publishes: false
    }
  });
}

export function buildPostChannelVariants(state = {}, actor = {}, postId = "") {
  const source = collectPostChannelVariantSources(state, actor, postId);
  if (!source.authorized) return unavailableResult(postId, source.reason);

  const sharedFields = sharedContent(source);
  const automaticSharedReferences = source.assetRecords
    .filter((record) => record.sharedByPost)
    .map((record) => ({ ...record.sourceReference, relationship: "shared_creative" }));
  const sharedCreative = resolveAssetIds(source.assetRecords, source.shared.creativeIds, "shared_creative", "shared");
  const sharedDisclaimers = resolveAssetIds(source.assetRecords, source.shared.disclaimerIds, "shared_disclaimer", "shared");
  const sharedIssues = [...sharedCreative.issues, ...sharedDisclaimers.issues];
  const shared = {
    ...sharedFields,
    creativeReferences: dedupeReferences([...automaticSharedReferences, ...sharedCreative.references]),
    disclaimerReferences: sharedDisclaimers.references,
    availability: sharedIssues.length
      ? { key: "unavailable", reason: "shared_reference_unavailable" }
      : { key: "available", reason: null }
  };

  const byChannel = new Map();
  for (const candidate of source.variantCandidates) {
    const values = byChannel.get(candidate.channel) || [];
    values.push(candidate);
    byChannel.set(candidate.channel, values);
  }
  const channels = [...new Set([...source.selectedChannels, ...byChannel.keys()])].sort(comparePostChannels);
  const issues = [...sharedIssues];
  const variants = channels.map((channel) => {
    const resolved = resolveVariantCandidates(byChannel.get(channel) || []);
    const selected = source.selectedChannels.includes(channel);
    if (resolved.ambiguous) {
      const issue = { key: "ambiguous_variant", channel };
      issues.push(issue);
      return {
        channel,
        label: postChannelLabel(channel),
        selected,
        customized: null,
        stored: true,
        content: unavailableContent(),
        assetReferences: [],
        disclaimerReferences: [],
        formatGuidance: guidanceFor(source, channel, null),
        sourceReference: null,
        availability: { key: "unavailable", reason: "ambiguous_variant" }
      };
    }

    const candidate = resolved.candidate;
    const content = Object.fromEntries(CONTENT_FIELDS.map((field) => [
      field,
      candidate
        ? fallbackField(field, candidate.content[field], candidate.explicitBlankFields, sharedFields[field])
        : fallbackField(field, { present: false }, [], sharedFields[field])
    ]));
    const creative = candidate
      ? resolveAssetIds(source.assetRecords, candidate.creativeIds, "channel_creative", channel)
      : { references: [], issues: [] };
    const disclaimers = candidate
      ? resolveAssetIds(source.assetRecords, candidate.disclaimerIds, "channel_disclaimer", channel)
      : { references: [], issues: [] };
    const variantIssues = [...creative.issues, ...disclaimers.issues];
    issues.push(...variantIssues);
    const customized = Boolean(candidate) && (
      Object.values(content).some((field) => field.source === "variant")
      || candidate.creativeIds.length > 0
      || candidate.disclaimerIds.length > 0
    );
    return {
      channel,
      label: postChannelLabel(channel),
      selected,
      customized,
      stored: Boolean(candidate),
      content,
      assetReferences: creative.references,
      disclaimerReferences: disclaimers.references,
      formatGuidance: guidanceFor(source, channel, candidate),
      sourceReference: candidate?.sourceReference ? { ...candidate.sourceReference } : null,
      availability: variantIssues.length
        ? { key: "unavailable", reason: "referenced_asset_unavailable" }
        : { key: "available", reason: null }
    };
  });

  const customizedVariants = variants.filter((variant) => variant.customized === true).length;
  const missingRelationships = issues.filter((issue) => /asset|reference/.test(issue.key)).length;
  const availability = issues.length
    ? { key: "partial", reason: "variant_truth_incomplete" }
    : { key: "available", reason: null };
  return deepFreeze({
    postId: source.postView.id,
    shared,
    selectedChannels: [...source.selectedChannels],
    variants,
    availability: {
      ...availability,
      counts: {
        selectedChannels: source.selectedChannels.length,
        variants: variants.length,
        customizedVariants,
        missingRelationships
      },
      issues
    },
    sourceReferences: source.postView.sourceReferences.map((reference) => ({ ...reference })),
    performance: {
      postsExamined: source.diagnostics.postsExamined,
      variantsExamined: source.diagnostics.variantsExamined
    },
    capabilities: {
      mutatesPost: false,
      mutatesVariant: false,
      mutatesSelection: false,
      schedules: false,
      approves: false,
      publishes: false
    }
  });
}

export { normalizePostChannel };
