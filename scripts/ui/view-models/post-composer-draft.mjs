import { collectPostComposerDraftSources } from "./post-composer-draft-sources.mjs";

const clean = (value = "") => String(value ?? "").trim();
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function referenceKey(reference = {}) {
  return `${clean(reference.collection || reference.sourceCollection)}:${clean(reference.sourceId)}:${clean(reference.relationship)}`;
}

function compactReference(reference = {}) {
  const collection = clean(reference.collection || reference.sourceCollection);
  const sourceId = clean(reference.sourceId);
  if (!collection || !sourceId) return null;
  const output = { collection, sourceId };
  const relationship = clean(reference.relationship);
  if (relationship) output.relationship = relationship;
  const href = clean(reference.href);
  if (href.startsWith("#")) output.href = href;
  return output;
}

function dedupeReferences(references = []) {
  const map = new Map();
  for (const raw of references) {
    const reference = compactReference(raw);
    if (reference) map.set(referenceKey(reference), reference);
  }
  return [...map.values()].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right), "en-US"));
}

function catalogAssets(catalog = {}) {
  return (catalog.assetGroups || []).flatMap((group) => (group.assets || []).map((asset) => ({
    group: group.key,
    asset
  })));
}

function compactAsset(asset = {}) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    role: asset.role,
    approved: asset.approved === true,
    suitableSurface: asset.suitableSurface,
    sourceReference: compactReference(asset.sourceReference),
    safePreviewReference: asset.safePreviewReference ? { ...asset.safePreviewReference } : null,
    usageGuidance: asset.usageGuidance || null
  };
}

function assetUnavailableReason(source, id) {
  if (id === "brand-contract-white-wordmark") {
    const issue = source.catalog.availability?.issues?.find((item) => item.key === "white_wordmark_requires_dark_surface");
    if (issue) return "incompatible_surface";
    if (!["dark", "dark_only", "deep_navy", "navy", "navy_950"].includes(source.creativeSelections.surfaceTone)) {
      return "surface_unavailable";
    }
  }
  return "asset_unavailable";
}

function emptySelection(kind, fact, reason = "") {
  const resolvedReason = reason || (fact.present ? "not_selected" : "selection_source_unavailable");
  return {
    kind,
    selected: false,
    requestedIds: [...fact.ids],
    value: null,
    availability: { key: resolvedReason === "not_selected" ? "not_selected" : "unavailable", reason: resolvedReason }
  };
}

function resolveTemplate(source) {
  const fact = source.creativeSelections.template;
  if (!fact.ids.length) return emptySelection("template", fact);
  if (fact.ambiguous) return emptySelection("template", fact, "ambiguous_selection");
  const id = fact.ids[0];
  const matches = source.catalog.templates.filter((template) => template.id === id);
  if (matches.length !== 1) return emptySelection("template", fact, matches.length > 1 ? "ambiguous_reference" : "template_unavailable");
  const template = matches[0];
  return {
    kind: "template",
    selected: true,
    requestedIds: [id],
    value: {
      id: template.id,
      name: template.name,
      category: { ...template.category },
      supportedChannels: [...template.supportedChannels],
      surfaceTone: template.surfaceTone,
      requiredAssetRoles: [...template.requiredAssetRoles],
      sourceReference: compactReference(template.sourceReference),
      assetReferences: dedupeReferences(template.assetReferences),
      defaultDisclaimerReference: compactReference(template.defaultDisclaimerReference),
      missingAssetReferences: template.missingAssetReferences.map((item) => ({ id: item.assetId, reason: item.reason }))
    },
    availability: { ...template.availability }
  };
}

function resolveSingleAsset(source, kind, allowedGroups) {
  const fact = source.creativeSelections[kind];
  if (!fact.ids.length) return emptySelection(kind, fact);
  if (fact.ambiguous) return emptySelection(kind, fact, "ambiguous_selection");
  const id = fact.ids[0];
  const matches = catalogAssets(source.catalog).filter((entry) => entry.asset.id === id);
  if (matches.length !== 1) return emptySelection(kind, fact, matches.length > 1 ? "ambiguous_reference" : assetUnavailableReason(source, id));
  if (!allowedGroups.includes(matches[0].group)) return emptySelection(kind, fact, "incompatible_asset_role");
  return {
    kind,
    selected: true,
    requestedIds: [id],
    value: compactAsset(matches[0].asset),
    availability: { key: "available", reason: null }
  };
}

function referenceMatchesId(reference = {}, id = "") {
  return clean(reference.sourceId) === id;
}

function resolveManyAssets(source, kind, fact, allowedGroups = null) {
  const catalog = catalogAssets(source.catalog);
  const variantReferences = [
    ...(source.variants.shared?.creativeReferences || []),
    ...(source.variants.shared?.disclaimerReferences || []),
    ...source.variants.variants.flatMap((variant) => [...variant.assetReferences, ...variant.disclaimerReferences])
  ];
  const values = [];
  const issues = [];
  for (const id of fact.ids) {
    const matches = catalog.filter((entry) => entry.asset.id === id && (!allowedGroups || allowedGroups.includes(entry.group)));
    if (matches.length === 1) {
      values.push(compactAsset(matches[0].asset));
      continue;
    }
    if (matches.length > 1) {
      issues.push({ id, reason: "ambiguous_reference" });
      continue;
    }
    const exactReferences = variantReferences.filter((reference) => referenceMatchesId(reference, id));
    const safePostAsset = exactReferences.length === 1 && clean(exactReferences[0].sourceCollection) === "postImages";
    if (safePostAsset && !allowedGroups) {
      values.push({
        id,
        name: null,
        kind: "post_image",
        role: "Post image",
        approved: null,
        suitableSurface: "unspecified",
        sourceReference: compactReference(exactReferences[0]),
        safePreviewReference: null,
        usageGuidance: null
      });
    } else {
      issues.push({ id, reason: assetUnavailableReason(source, id) });
    }
  }
  return {
    kind,
    selected: fact.ids.length > 0,
    requestedIds: [...fact.ids],
    values,
    availability: issues.length
      ? { key: values.length ? "partial" : "unavailable", reason: "referenced_asset_unavailable", issues }
      : fact.ids.length
        ? { key: "available", reason: null, issues: [] }
        : fact.present
          ? { key: "not_selected", reason: "not_selected", issues: [] }
          : { key: "unavailable", reason: "selection_source_unavailable", issues: [] }
  };
}

function creativeProjection(source) {
  const template = resolveTemplate(source);
  const logo = resolveSingleAsset(source, "logo", ["logos"]);
  const wilma = resolveSingleAsset(source, "wilma", ["wilma_poses"]);
  const background = resolveSingleAsset(source, "background", ["backgrounds"]);
  const disclaimers = resolveManyAssets(source, "disclaimers", source.creativeSelections.disclaimers, ["disclaimer_blocks"]);
  const otherAssets = resolveManyAssets(source, "otherAssets", source.creativeSelections.otherAssets);
  const selections = [template, logo, wilma, background, disclaimers, otherAssets];
  const unavailableRelationships = selections.reduce((sum, selection) => {
    if (!["partial", "unavailable"].includes(selection.availability.key)) return sum;
    if (selection.availability.issues?.length) return sum + selection.availability.issues.length;
    if (selection.kind === "template" && selection.value?.missingAssetReferences?.length) {
      return sum + selection.value.missingAssetReferences.length;
    }
    return sum + Math.max(1, selection.requestedIds.length);
  }, 0);
  return {
    surfaceTone: source.creativeSelections.surfaceTone,
    template,
    logo,
    wilma,
    background,
    disclaimers,
    otherAssets,
    sharedReferences: dedupeReferences([
      ...(source.variants.shared?.creativeReferences || []),
      ...(source.variants.shared?.disclaimerReferences || [])
    ]),
    availability: {
      key: unavailableRelationships ? "partial" : "available",
      reason: unavailableRelationships ? "creative_relationships_incomplete" : null,
      counts: {
        selections: selections.filter((selection) => selection.selected).length,
        relationships: selections.reduce((sum, selection) => sum + selection.requestedIds.length, 0),
        unavailableRelationships
      }
    }
  };
}

function readinessProjection(readiness = {}) {
  const checks = (readiness.checks || []).map((item) => ({
    key: item.key,
    category: item.category,
    label: item.label,
    status: { ...item.status },
    explanation: item.explanation,
    blocking: item.blocking === true,
    hardFailure: item.hardFailure === true,
    guidance: item.actionHint || null,
    executable: false,
    sourceReference: compactReference(item.sourceReference)
  }));
  const publishing = checks.find((item) => item.key === "publishing");
  let publicationState = "unavailable";
  if (publishing?.status.key === "passed" && /every selected channel/i.test(publishing.explanation)) publicationState = "published";
  else if (publishing?.status.key === "needs_attention" && /partial channel result|publication result needs attention/i.test(publishing.explanation)) publicationState = "partial";
  else if (publishing?.status.key === "needs_attention" && /scheduled but has not been published/i.test(publishing.explanation)) publicationState = "scheduled";
  const nextStep = readiness.nextStep ? {
    label: readiness.nextStep.label,
    explanation: readiness.nextStep.explanation,
    href: clean(readiness.nextStep.href).startsWith("#") ? readiness.nextStep.href : null,
    executable: false
  } : null;
  return {
    available: readiness.available === true,
    state: readiness.state ? { ...readiness.state } : { key: "unavailable", label: "Unavailable" },
    headline: readiness.headline,
    summary: readiness.summary,
    nextStep,
    counts: { ...readiness.counts },
    checks,
    publication: {
      state: publicationState,
      explicitEvidence: ["published", "partial", "scheduled"].includes(publicationState),
      sourceReference: publishing?.sourceReference || null
    },
    sourceAvailability: { ...readiness.sourceAvailability }
  };
}

function unavailableResult(source) {
  return deepFreeze({
    postId: null,
    href: null,
    generatedAt: source.generatedAt,
    sharedContent: null,
    selectedChannels: [],
    channelVariants: [],
    creative: null,
    schedule: null,
    approval: null,
    readiness: null,
    sourceReferences: [],
    availability: { key: "unavailable", reason: source.reason, counts: null },
    performance: { postsExamined: 0, variantsExamined: 0, creativeCandidatesScanned: 0, readinessCandidatesExamined: 0 },
    capabilities: {
      edits: false,
      persistsSelections: false,
      writesVariants: false,
      autosaves: false,
      schedules: false,
      approves: false,
      publishes: false,
      generatesImages: false,
      callsProviders: false,
      writesStorage: false
    }
  });
}

export function buildPostComposerDraft(state = {}, actor = {}, postId = "", context = {}) {
  const source = collectPostComposerDraftSources(state, actor, postId, context);
  if (!source.authorized || !source.found) return unavailableResult(source);
  const creative = creativeProjection(source);
  const readiness = readinessProjection(source.readiness);
  const variantIssues = source.variants.availability?.issues || [];
  const partial = creative.availability.key === "partial" || source.variants.availability?.key === "partial";
  const sourceReferences = dedupeReferences([
    ...source.postView.sourceReferences,
    ...source.variants.sourceReferences,
    creative.template.value?.sourceReference,
    creative.logo.value?.sourceReference,
    creative.wilma.value?.sourceReference,
    creative.background.value?.sourceReference,
    ...creative.disclaimers.values.map((asset) => asset.sourceReference),
    ...creative.otherAssets.values.map((asset) => asset.sourceReference),
    ...readiness.checks.map((item) => item.sourceReference)
  ]);
  const result = {
    postId: source.postView.id,
    href: source.postView.href,
    generatedAt: source.generatedAt,
    sharedContent: source.variants.shared,
    selectedChannels: [...source.variants.selectedChannels],
    channelVariants: source.variants.variants.map((variant) => ({ ...variant })),
    creative,
    schedule: { ...source.schedule },
    approval: { ...source.approval },
    readiness,
    sourceReferences,
    availability: {
      key: partial ? "partial" : "available",
      reason: partial ? "draft_sources_incomplete" : null,
      counts: {
        selectedChannels: source.variants.selectedChannels.length,
        variants: source.variants.variants.length,
        customizedVariants: source.variants.variants.filter((variant) => variant.customized === true).length,
        assetRelationships: creative.availability.counts.relationships,
        unavailableRelationships: creative.availability.counts.unavailableRelationships + variantIssues.length,
        readinessChecks: readiness.checks.length
      }
    },
    performance: { ...source.diagnostics },
    capabilities: {
      edits: false,
      persistsSelections: false,
      writesVariants: false,
      autosaves: false,
      schedules: false,
      approves: false,
      publishes: false,
      generatesImages: false,
      callsProviders: false,
      writesStorage: false
    }
  };
  return deepFreeze(result);
}
