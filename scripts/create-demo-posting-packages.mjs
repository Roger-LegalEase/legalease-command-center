import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "data", "social-command-center.json");
const finalPngDir = path.join(rootDir, "data", "exports", "final-pngs");
const postingKitRoot = path.join(rootDir, "data", "exports", "posting-kits");
const now = new Date().toISOString();
const dateSlug = "2026-05-22";

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "item";
}

function composeCaption(post = {}) {
  return [post.hook, "", post.body, "", post.cta, "", (post.hashtags || []).join(" ")]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function platformFormat(platform = "linkedin") {
  if (platform === "instagram" || platform === "facebook") return { id: `${platform}-square`, label: `${platform} square`, width: 1200, height: 1200 };
  if (platform === "x") return { id: "x-twitter-landscape", label: "X landscape", width: 1600, height: 900 };
  return { id: "linkedin-square", label: "LinkedIn square", width: 1200, height: 1200 };
}

function altText(post = {}) {
  const bucket = post.contentBucket || post.wilmaVisualBucket || "LegalEase post";
  return `LegalEase ${bucket} social graphic for ${post.platform || "social media"} about ${post.title || post.hook || "the post topic"}.`;
}

function findSourcePng() {
  const preferred = path.join(finalPngDir, "legalease-recordshield-linkedin-square-2026-05-22-demo-post-ready.png");
  if (existsSync(preferred)) return preferred;
  const fallback = path.join(finalPngDir, "legalease-legalease-pov-linkedin-square-2026-05-20-cd392274-6a64-404a-bf30-55c6f60fe631.png");
  if (existsSync(fallback)) return fallback;
  throw new Error("No source final PNG exists under data/exports/final-pngs/.");
}

function writeText(filePath, contents = "") {
  writeFileSync(filePath, `${String(contents || "").trim()}\n`, "utf8");
}

const state = JSON.parse(readFileSync(dataPath, "utf8"));
const sourcePng = findSourcePng();
mkdirSync(finalPngDir, { recursive: true });
mkdirSync(postingKitRoot, { recursive: true });

const generated = [];

state.posts = (state.posts || []).map((post) => {
  const format = platformFormat(post.platform);
  const bucket = post.contentBucket || post.wilmaVisualBucket || "LegalEase";
  const exportFilename = `legalease-${slugify(bucket)}-${slugify(format.id)}-${dateSlug}-${slugify(post.id)}.png`;
  const finalRelativePath = `data/exports/final-pngs/${exportFilename}`;
  const finalPath = path.join(rootDir, finalRelativePath);
  copyFileSync(sourcePng, finalPath);
  const finalSize = statSync(finalPath).size;

  const kitRelativePath = `data/exports/posting-kits/${slugify(post.id)}-${dateSlug}`;
  const kitPath = path.join(rootDir, kitRelativePath);
  mkdirSync(kitPath, { recursive: true });
  copyFileSync(finalPath, path.join(kitPath, "final.png"));

  const caption = composeCaption(post);
  const hashtags = (post.hashtags || []).join(" ");
  const notes = [
    "Demo posting package.",
    "Manual posting only.",
    "Confirm channel, account, and compliance status before any live publish.",
    post.status === "blocked_channel_not_connected" ? "This post is intentionally blocked until the channel is connected." : ""
  ].filter(Boolean).join(" ");
  const metadata = {
    postId: post.id,
    title: post.title || post.hook || "",
    topic: post.hook || post.title || "",
    platform: post.platform || "",
    contentBucket: bucket,
    speaker: post.speaker || "legalease",
    riskLevel: post.complianceRisk || "low",
    wilmaExpression: post.wilmaImageWorkflow?.wilmaExpression || post.wilmaExpression || "",
    wilmaPoseRef: post.wilmaImageWorkflow?.wilmaPoseReferenceId || post.wilmaPoseReferenceId || "",
    finalPngFilename: exportFilename,
    finalPngSourcePath: finalRelativePath,
    generatedTimestamp: now,
    manualPostingKitStatus: "ready",
    livePostingStatus: "disabled/manual-only"
  };

  writeText(path.join(kitPath, "caption.txt"), caption);
  writeText(path.join(kitPath, "hashtags.txt"), hashtags);
  writeText(path.join(kitPath, "alt-text.txt"), altText(post));
  writeText(path.join(kitPath, "posting-notes.txt"), notes);
  writeText(path.join(kitPath, "metadata.json"), JSON.stringify(metadata, null, 2));

  const fileList = ["final.png", "caption.txt", "hashtags.txt", "alt-text.txt", "posting-notes.txt", "metadata.json"];
  const finalExportKit = {
    ...(post.finalExportKit || {}),
    status: "ready",
    platformFormatId: format.id,
    platformFormatLabel: format.label,
    platform: post.platform,
    width: format.width,
    height: format.height,
    dimensions: `${format.width}x${format.height}`,
    contentBucket: bucket,
    overlayText: post.wilmaImageWorkflow?.overlayText || post.overlayHeadline || post.title || "",
    caption,
    hashtags,
    altText: altText(post),
    postingNotes: notes,
    exportFilename,
    imageUrl: finalRelativePath,
    finalImageUrl: finalRelativePath,
    finalPngUrl: finalRelativePath,
    finalPngPath: finalRelativePath,
    finalPngFileSize: finalSize,
    finalPngGeneratedAt: now,
    downloadUrl: `/api/posts/${encodeURIComponent(post.id)}/final-png`,
    finalPngReady: true,
    livePostingDisabled: true,
    operatorMustPostManually: true,
    manualPostingKitReady: true,
    postingPackageGenerated: true,
    postingPackage: {
      generated: true,
      path: kitPath,
      relativePath: kitRelativePath,
      downloadUrl: `/${kitRelativePath}/metadata.json`,
      fileList,
      generatedAt: now
    },
    updatedAt: now
  };

  generated.push({ id: post.id, kit: kitRelativePath, png: finalRelativePath });

  return {
    ...post,
    imageFinalized: true,
    finalPreviewConfirmed: true,
    finalPreviewConfirmedAt: post.finalPreviewConfirmedAt || now,
    manualPostingKitReady: true,
    postingPackageGenerated: true,
    postingPackagePath: kitPath,
    postingPackageDownloadUrl: `/${kitRelativePath}/metadata.json`,
    postingPackageGeneratedAt: now,
    postingPackageFileList: fileList,
    postingPackage: finalExportKit.postingPackage,
    finalPngFilename: exportFilename,
    finalExportKit,
    updatedAt: now
  };
});

const existingImages = new Map((state.postImages || []).map((image) => [image.postId, image]));
state.postImages = [
  ...state.posts.map((post) => {
    const format = platformFormat(post.platform);
    const kit = post.finalExportKit || {};
    const existing = existingImages.get(post.id) || {};
    return {
      ...existing,
      id: existing.id || `demo-image-${post.id}`,
      postId: post.id,
      imageUrl: kit.finalPngPath,
      finalImageUrl: kit.finalPngPath,
      finalPngUrl: kit.finalPngPath,
      finalPngPath: kit.finalPngPath,
      finalPngFileSize: kit.finalPngFileSize,
      finalPngGeneratedAt: now,
      generationStatus: "generated",
      imageStatus: "final_composited",
      generationMode: existing.generationMode || "demo_package_final_png",
      finalImageReady: true,
      textRenderingMode: "baked_overlay",
      finalImageWidth: format.width,
      finalImageHeight: format.height,
      aspectRatio: format.width === format.height ? "1:1" : "16:9",
      versionNumber: Number(existing.versionNumber || 1),
      promptVersion: existing.promptVersion || "legalese-image-prompt-v3-art-directed",
      createdAt: existing.createdAt || now,
      updatedAt: now,
      assetBundleUsed: {
        ...(existing.assetBundleUsed || {}),
        finalImage: {
          ready: true,
          localPath: kit.finalPngPath,
          fileSize: kit.finalPngFileSize,
          createdAt: now
        }
      }
    };
  }),
  ...(state.postImages || []).filter((image) => !state.posts.some((post) => post.id === image.postId))
];

state.activityEvents = [
  {
    id: `activity-demo-posting-packages-${Date.now()}`,
    eventType: "Posting packages created",
    title: `${generated.length} demo posting packages`,
    relatedObjectType: "posts",
    relatedObjectId: "demo",
    createdAt: now
  },
  ...(state.activityEvents || [])
].slice(0, 100);

writeFileSync(dataPath, `${JSON.stringify(state, null, 2)}\n`);

console.log(JSON.stringify({ ok: true, generated }, null, 2));
