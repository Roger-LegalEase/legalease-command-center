import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { analyzeOperations } from "./priority-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const devRoot = path.resolve(rootDir, "..");
const dataPath = path.join(rootDir, "data", "social-command-center.json");
const finalPngDir = path.join(rootDir, "data", "exports", "final-pngs");
const kitRoot = path.join(rootDir, "data", "exports", "posting-kits");
const checkpointRoot = path.join(devRoot, "checkpoints", "legalease-command-center-launch-demo-2026-05-22");
const demoScriptPath = path.join(rootDir, "DEMO_SCRIPT.md");
const now = new Date().toISOString();
const dateSlug = "2026-05-22";

const demoPosts = [
  {
    id: "demo-post-ready",
    title: "RecordShield turns uncertainty into a clear next step",
    platform: "linkedin",
    status: "approved",
    contentBucket: "RecordShield",
    speaker: "legalease",
    audience: "partners",
    campaign: "RecordShield Beta Launch",
    hook: "RecordShield turns uncertainty into a clear next step.",
    body: "The first job is not to promise an outcome. It is to help people and partners understand what is in front of them, what might matter, and what action is worth taking next.",
    cta: "Use clarity as the first conversion event.",
    hashtags: ["#LegalEase", "#RecordShield"],
    overlay: "Uncertainty becomes a next step",
    visual: "Layered blank records becoming one clear path",
    treatment: "Archival Futurism",
    palette: ["#071F4D", "#F7F3EA", "#F04800", "#B8D8D8"],
    shape: "records"
  },
  {
    id: "demo-post-image",
    title: "A county pilot needs a story people can repeat",
    platform: "linkedin",
    status: "approved",
    contentBucket: "Pilot Proof",
    speaker: "legalease",
    audience: "partners",
    campaign: "County Intake Pilot",
    hook: "A county pilot needs a story people can repeat.",
    body: "The strongest pilot is not just a workflow. It is a simple promise staff can explain, residents can trust, and leadership can measure.",
    cta: "Turn the pilot into proof before it becomes a brochure.",
    hashtags: ["#LegalEase", "#RecordShield"],
    overlay: "A pilot needs a story staff can repeat",
    visual: "County services as a clean handoff system",
    treatment: "Civic Infrastructure",
    palette: ["#10243E", "#F5F0E8", "#0E8A8A", "#F04800"],
    shape: "network"
  },
  {
    id: "demo-post-review",
    title: "Wilma explains the process without sounding like a lawyer",
    platform: "facebook",
    status: "needs_review",
    contentBucket: "Wilma Explainer",
    speaker: "wilma",
    audience: "consumers",
    campaign: "Consumer Education",
    hook: "Wilma should explain the process without sounding like a lawyer.",
    body: "People do not need a lecture. They need a plain-English guide that says what to check, what not to assume, and when a human review matters.",
    cta: "Keep the explanation useful, careful, and human.",
    hashtags: ["#AskWilma", "#LegalEase"],
    overlay: "Plain English first. Legal promises never.",
    visual: "A calm guide stage with blank cards and open space",
    treatment: "Wilma Guide Environment",
    palette: ["#06135B", "#FFF7EC", "#F04800", "#8ECAC6"],
    shape: "guide",
    complianceRisk: "medium"
  },
  {
    id: "demo-post-blocked",
    title: "Do not launch a campaign without tracking",
    platform: "linkedin",
    status: "blocked_channel_not_connected",
    contentBucket: "Growth Discipline",
    speaker: "legalease",
    audience: "internal",
    campaign: "Partner Referral Campaign",
    hook: "Do not launch a campaign without tracking.",
    body: "A partner campaign only becomes proof when referrals, RecordShield starts, and handoff behavior are visible.",
    cta: "Fix attribution before calling anything live.",
    hashtags: ["#LegalEase", "#GrowthOps"],
    overlay: "No tracking. No launch.",
    visual: "A launch gate holding back untracked campaign motion",
    treatment: "Neo-Brutalist Legal Tech",
    palette: ["#111827", "#F4F2EC", "#B42318", "#F04800"],
    shape: "gate",
    publishErrorSummary: "LinkedIn account is not connected.",
    publishingStatus: "blocked"
  },
  {
    id: "demo-post-posted",
    title: "Fresh Start Campaign produced the first proof loop",
    platform: "linkedin",
    status: "manually_posted",
    contentBucket: "Traction Update",
    speaker: "legalease",
    audience: "partners",
    campaign: "Fresh Start Campaign",
    hook: "Fresh Start Campaign produced the first proof loop.",
    body: "A partner distributed the message, users started RecordShield, and the cleanup handoff produced measurable Expungement.ai intent.",
    cta: "This is the loop to repeat.",
    hashtags: ["#LegalEase", "#RecordShield"],
    overlay: "Distribution became proof",
    visual: "Three physical proof blocks: partner, users, conversion",
    treatment: "Data as Sculpture",
    palette: ["#071F4D", "#F7F3EA", "#1B8A72", "#F04800"],
    shape: "proof",
    manuallyPostedAt: "2026-05-21T15:30:00.000Z",
    performance: { impressions: 4200, likes: 118, comments: 14, shares: 22, saves: 31, reposts: 9, clicks: 86, leads: 17 },
    engagementRate: 4.6
  },
  {
    id: "demo-post-campaign",
    title: "A partner campaign is only real when distribution happens",
    platform: "instagram",
    status: "approved",
    contentBucket: "Partner Campaign",
    speaker: "legalease",
    audience: "partners",
    campaign: "Civic Access RecordShield Week",
    hook: "A partner campaign is only real when distribution happens.",
    body: "The asset is not the milestone. The milestone is a partner sending it, people clicking it, and RecordShield turning the traffic into measurable next steps.",
    cta: "Track the handoff, then scale what works.",
    hashtags: ["#LegalEase", "#PartnerCampaigns"],
    overlay: "Distribution is the proof",
    visual: "Community campaign materials becoming measurable movement",
    treatment: "Documentary Graphic",
    palette: ["#0B1D2E", "#FAF4E8", "#F04800", "#2AA3A3"],
    shape: "campaign"
  }
];

const demoIdeaSeeds = [
  ["Clean Slate is infrastructure", "Explain why policy is only step one and implementation is the next phase.", "Implementation Layer", "LinkedIn, X, Facebook", "Learn more", "no", "medium", "Clean editorial graphic showing the gap between policy and process."],
  ["Ask Wilma: Do I need a lawyer?", "Wilma explains supported self-help without making legal advice claims.", "Trust & Guidance", "Instagram, TikTok, Facebook", "Start with Wilma", "yes", "high", "Warm help desk scene with reserved Wilma space."],
  ["RecordShield before the job interview", "Show why people need clarity before a background check blocks an opportunity.", "RecordShield", "LinkedIn, Instagram, Facebook", "Check what may show up", "optional", "medium", "Archival paper and privacy clarity visual."],
  ["Partner campaigns need tracking", "Make the case that distribution without attribution is activity, not proof.", "Growth Discipline", "LinkedIn, X", "Track the handoff", "no", "low", "Neo-brutalist launch gate visual."],
  ["County pilots need a small wedge", "Explain why a 30-day backlog triage pilot is easier to approve than a giant transformation project.", "Pilot Proof", "LinkedIn", "Start narrow", "no", "medium", "County service pathway as clean modular system."],
  ["Fresh Start Campaign launch", "Announce a partner campaign that helps people understand their record and next step.", "Partner Campaign", "Facebook, Instagram, Threads", "Start the check", "optional", "medium", "Human dignity editorial campaign visual."],
  ["Why RecordShield feeds Expungement.ai", "Explain the conversion loop from clarity to qualified cleanup demand.", "Conversion Proof", "LinkedIn, X", "Measure the loop", "no", "low", "Data as physical proof blocks."],
  ["Compliance is a growth feature", "Show why careful claims make partner distribution safer and more scalable.", "Compliance Safety", "LinkedIn", "Review before launch", "no", "medium", "Museum minimal object with approval gate."],
  ["What partners actually need", "Partners do not need another brochure; they need a simple campaign they can send.", "Partner Motion", "LinkedIn, Facebook", "Generate the kit", "no", "low", "Documentary graphic collaboration table."],
  ["The dashboard is proof", "Investor-ready infrastructure means showing pilots, users, conversion, and compliance in one operating layer.", "Infrastructure Dashboard", "LinkedIn", "Show the operating layer", "no", "low", "Product system visual without fake UI text."],
  ["Second chances need operations", "Human impact happens when forms, staff, and follow-up are coordinated.", "Human Impact", "Instagram, Facebook, Threads", "Make the next step clear", "optional", "medium", "Grounded kitchen-table document scene."],
  ["No fake legal promises", "Explain why LegalEase avoids eligibility guarantees and outcome promises.", "Trust & Guidance", "LinkedIn, Facebook", "Use careful language", "yes", "high", "Wilma guide environment with calm warning space."],
  ["RecordShield as the front door", "Position RecordShield as the low-friction entry point into the LegalEase ecosystem.", "RecordShield", "LinkedIn, X", "Start with clarity", "no", "low", "Minimal premium front-door metaphor."],
  ["Partner proof beats pitch decks", "A live campaign with tracked users says more than a slide about market size.", "Public Proof", "LinkedIn", "Turn activity into proof", "no", "low", "Data room sculpture with partner proof artifact."],
  ["Ask Wilma: What should I check first?", "Wilma explains the first safe step without legal advice.", "Wilma Explainer", "Instagram, TikTok, Facebook", "Ask Wilma", "yes", "high", "Reserved Wilma stage with blank cards."],
  ["Why active campaigns matter", "Ten partner campaigns creates distribution proof across multiple channels.", "Partner Campaign", "LinkedIn, X", "Launch and measure", "no", "low", "Campaign energy with restrained color blocking."],
  ["Follow-up is the operating system", "The company wins when every partner has a next action and owner.", "COO Discipline", "LinkedIn", "Set the next action", "no", "low", "Cinematic operator desk with action cards."],
  ["The compliance memo is not paperwork", "Compliance artifacts reduce risk for partners, investors, and acquirers.", "Acquisition Readiness", "LinkedIn", "Build the data room", "no", "medium", "Archival futurism compliance folder."],
  ["RecordShield users are the signal", "A thousand users with source attribution creates a measurable acquisition funnel.", "Traction", "LinkedIn, X", "Track users by source", "no", "low", "Data as sculpture with source channels."],
  ["Proof point request", "Ask a successful partner for a quote or public case study after measurable usage.", "Public Proof", "LinkedIn", "Request proof", "no", "medium", "Museum campaign minimal testimonial placeholder with no text."],
  ["Campaigns need staff language", "Partner staff need one sentence they can repeat to send people to RecordShield.", "Partner Motion", "Facebook, Instagram", "Give staff the words", "optional", "medium", "Blank talking-points cards in a meeting scene."],
  ["The first 25 users matter", "A pilot becomes real when the first 25 people move through the funnel.", "Pilot Proof", "LinkedIn", "Measure first usage", "no", "low", "Physical milestone blocks, no numbers or text."],
  ["No tracking means no story", "Without source attribution, LegalEase cannot prove what created demand.", "Growth Discipline", "LinkedIn, X", "Fix attribution", "no", "low", "Sharp launch gate and missing path metaphor."],
  ["Ask Wilma: Is this legal advice?", "Wilma explains the difference between legal information and legal advice.", "Trust & Guidance", "Instagram, Facebook, TikTok", "Ask Wilma", "yes", "high", "Warm guide environment with clear reserved space."],
  ["Partners want outcomes, not dashboards", "Show how the command center translates activity into partner reports.", "Infrastructure Dashboard", "LinkedIn", "Export the report", "no", "low", "Report artifacts as tactile designed objects."],
  ["The acquisition thesis", "LegalEase becomes valuable when it owns demand, workflow, proof, and compliance evidence.", "Acquisition Readiness", "LinkedIn", "Build proof every week", "no", "low", "Editorial poster with connected proof layers."],
  ["Goodwill workforce pathway", "Frame RecordShield as a workforce readiness tool without promising outcomes.", "Partner Campaign", "Facebook, Instagram, LinkedIn", "Launch a Fresh Start campaign", "optional", "medium", "Human dignity editorial at a community workspace."],
  ["Civic access without politics", "A record-clearing pathway can support civic participation without political imagery.", "Civic Access", "Facebook, Instagram, Threads", "Check the path", "optional", "medium", "Cut-paper civic collage without seals or flags."],
  ["The weekly operating report", "Every Friday, LegalEase should know wins, blockers, proof, and next moves.", "COO Discipline", "LinkedIn", "Generate the report", "no", "low", "Cinematic operator desk, quiet Friday closeout."],
  ["What makes a pilot expandable", "Every pilot needs a renewal path before it launches.", "Pilot Proof", "LinkedIn", "Define expansion", "no", "medium", "Museum minimal bridge object with warm light."]
];

function demoContentBank() {
  return demoIdeaSeeds.map(([title, rawIdea, bucket, platforms, cta, usesWilma, complianceRisk, creativeDirection], index) => ({
    id: `idea-${String(index + 1).padStart(3, "0")}`,
    title,
    rawIdea,
    bucket,
    audience: bucket.includes("RecordShield") || usesWilma === "yes" ? "consumers" : "partners",
    platforms: platforms.split(",").map((platform) => platform.trim().toLowerCase().replace("x", "x").replace("twitter", "x")),
    campaign: bucket.includes("Partner") ? "Partner Referral Campaign" : bucket.includes("RecordShield") ? "RecordShield Beta Launch" : "",
    cta,
    creativeDirection,
    usesWilma,
    complianceRisk,
    priority: index < 10 ? "high" : "medium",
    status: index < 10 ? "generated" : "ready_to_generate",
    createdAt: now,
    updatedAt: now,
    nextBestAction: index < 10 ? "Review generated draft" : "Generate draft"
  }));
}

function readState() {
  return JSON.parse(readFileSync(dataPath, "utf8"));
}

function writeState(state) {
  writeFileSync(dataPath, `${JSON.stringify(state, null, 2)}\n`);
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function xml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(value = "", max = 18, limit = 4) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, limit);
}

function formatFor(platform = "linkedin") {
  if (platform === "x") return { id: "x-twitter-landscape", label: "X landscape", width: 1600, height: 900 };
  return { id: `${platform || "linkedin"}-square`, label: `${platform || "linkedin"} square`, width: 1200, height: 1200 };
}

function captionFor(post = {}) {
  return [post.hook, "", post.body, "", post.cta, "", (post.hashtags || []).join(" ")]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shapeSvg(post, width, height) {
  const [navy, paper, accent, teal] = post.palette;
  if (post.shape === "network") {
    return `<g opacity=".94">
      <circle cx="770" cy="380" r="150" fill="${teal}" opacity=".14"/>
      <circle cx="880" cy="540" r="95" fill="${accent}" opacity=".18"/>
      ${[0,1,2,3,4].map((i) => `<circle cx="${680 + i * 92}" cy="${310 + (i % 2) * 170}" r="18" fill="${i % 2 ? accent : teal}"/>`).join("")}
      <path d="M680 310 L772 480 L864 310 L956 480 L1048 310" fill="none" stroke="${paper}" stroke-width="14" opacity=".68" stroke-linecap="round"/>
    </g>`;
  }
  if (post.shape === "guide") {
    return `<g>
      <rect x="735" y="260" width="300" height="470" rx="36" fill="${navy}" opacity=".92"/>
      <rect x="770" y="310" width="230" height="86" rx="18" fill="${paper}" opacity=".95"/>
      <rect x="770" y="430" width="180" height="26" rx="13" fill="${teal}" opacity=".7"/>
      <rect x="770" y="482" width="210" height="26" rx="13" fill="${accent}" opacity=".78"/>
      <circle cx="887" cy="648" r="62" fill="${paper}" opacity=".12"/>
      <path d="M430 710 C560 650 620 700 735 650" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>
    </g>`;
  }
  if (post.shape === "gate") {
    return `<g>
      <rect x="690" y="255" width="350" height="520" rx="14" fill="${paper}" opacity=".08"/>
      <path d="M710 300 H1010 M710 420 H1010 M710 540 H1010 M710 660 H1010" stroke="${paper}" stroke-width="22" opacity=".5"/>
      <rect x="760" y="345" width="190" height="260" rx="10" fill="none" stroke="${accent}" stroke-width="20"/>
      <path d="M725 710 L1010 280" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
    </g>`;
  }
  if (post.shape === "proof") {
    return `<g>
      <rect x="675" y="575" width="140" height="180" rx="18" fill="${teal}"/>
      <rect x="840" y="455" width="140" height="300" rx="18" fill="${accent}"/>
      <rect x="1005" y="335" width="140" height="420" rx="18" fill="${paper}" opacity=".88"/>
      <path d="M710 485 C800 410 880 355 1090 260" fill="none" stroke="${paper}" stroke-width="12" opacity=".55" stroke-linecap="round"/>
      <circle cx="1090" cy="260" r="24" fill="${accent}"/>
    </g>`;
  }
  if (post.shape === "campaign") {
    return `<g>
      <circle cx="825" cy="500" r="230" fill="${teal}" opacity=".13"/>
      <path d="M670 610 C760 480 875 430 1050 360" fill="none" stroke="${accent}" stroke-width="46" stroke-linecap="round"/>
      <path d="M690 710 C800 600 935 530 1110 500" fill="none" stroke="${paper}" stroke-width="18" stroke-linecap="round" opacity=".78"/>
      <rect x="790" y="290" width="250" height="120" rx="22" fill="${paper}" opacity=".9"/>
      <rect x="730" y="740" width="210" height="46" rx="23" fill="${accent}" opacity=".9"/>
    </g>`;
  }
  return `<g>
    <rect x="690" y="270" width="330" height="420" rx="22" fill="${paper}" opacity=".88"/>
    <rect x="735" y="220" width="330" height="420" rx="22" fill="${paper}" opacity=".52"/>
    <rect x="785" y="325" width="230" height="34" rx="17" fill="${accent}" opacity=".92"/>
    <rect x="785" y="404" width="280" height="34" rx="17" fill="${navy}" opacity=".36"/>
    <path d="M640 730 C755 665 890 650 1070 560" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>
  </g>`;
}

async function renderDemoPng(post, finalPath) {
  const format = formatFor(post.platform);
  const [navy, paper, accent, teal] = post.palette;
  const lines = wrapText(post.overlay, 17, 4);
  const titleLines = wrapText(post.visual, 34, 3);
  const lineHeight = 82;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${format.width}" height="${format.height}" viewBox="0 0 ${format.width} ${format.height}">
    <defs>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#000" flood-opacity=".28"/></filter>
      <pattern id="grain" width="80" height="80" patternUnits="userSpaceOnUse"><circle cx="12" cy="16" r="1.4" fill="${paper}" opacity=".12"/><circle cx="64" cy="46" r="1" fill="${paper}" opacity=".08"/><circle cx="40" cy="72" r="1.2" fill="${accent}" opacity=".1"/></pattern>
    </defs>
    <rect width="1200" height="1200" fill="${navy}"/>
    <rect width="1200" height="1200" fill="url(#grain)"/>
    <circle cx="1080" cy="120" r="360" fill="${teal}" opacity=".10"/>
    <rect x="70" y="70" width="1060" height="1060" rx="42" fill="${paper}" opacity=".96" filter="url(#soft)"/>
    <rect x="70" y="70" width="1060" height="18" rx="9" fill="${accent}"/>
    <rect x="122" y="126" width="220" height="36" rx="18" fill="${accent}" opacity=".95"/>
    <text x="146" y="151" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="2" fill="${paper}">${xml(post.treatment.toUpperCase())}</text>
    <g transform="translate(0,0)">${shapeSvg(post, format.width, format.height)}</g>
    <g>
      ${lines.map((line, index) => `<text x="140" y="${260 + index * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="850" fill="${index === 0 ? navy : "#1F2937"}">${xml(line)}</text>`).join("")}
    </g>
    <g>
      ${titleLines.map((line, index) => `<text x="145" y="${735 + index * 34}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#475467">${xml(line)}</text>`).join("")}
    </g>
    <rect x="140" y="970" width="320" height="42" rx="21" fill="${navy}" opacity=".9"/>
    <text x="166" y="998" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="${paper}">LegalEase Command Center</text>
    <path d="M865 985 H1030" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(finalPath);
  return { width: format.width, height: format.height };
}

function postRecord(post, finalKit = null) {
  return {
    id: post.id,
    title: post.title,
    platform: post.platform,
    status: post.status,
    contentType: "growth_update",
    campaign: post.campaign,
    scheduledFor: "",
    hook: post.hook,
    body: post.body,
    cta: post.cta,
    hashtags: post.hashtags,
    complianceRisk: post.complianceRisk || "low",
    complianceNotes: "Educational content only. No legal advice or guaranteed outcomes.",
    createdAt: now,
    updatedAt: now,
    speaker: post.speaker,
    audience: post.audience,
    contentBucket: post.contentBucket,
    targetChannels: [post.platform],
    copyReviewed: post.status !== "needs_review",
    copyReviewedAt: post.status !== "needs_review" ? now : "",
    overlayConfirmed: true,
    overlayConfirmedAt: now,
    imageFinalized: true,
    finalPreviewConfirmed: true,
    finalPreviewConfirmedAt: now,
    manualPostingKitReady: true,
    publishingStatus: post.publishingStatus || "",
    publishErrorSummary: post.publishErrorSummary || "",
    manuallyPostedAt: post.manuallyPostedAt || "",
    performance: post.performance || {},
    engagementRate: post.engagementRate || 0,
    wilmaImageWorkflow: {
      state: post.status === "needs_review" ? "Needs Copy Review" : "Manual Posting Kit Ready",
      visualBucket: post.contentBucket,
      wilmaExpression: post.speaker === "wilma" ? "Reassuring" : "",
      wilmaPoseReferenceId: post.speaker === "wilma" ? "pose-03" : "",
      wilmaPoseReferenceName: post.speaker === "wilma" ? "Helpful guide" : "",
      platformFormatSize: "1:1 square PNG, 1200 x 1200 preview target",
      overlayText: post.overlay,
      imagePrompt: `${post.treatment}: ${post.visual}. Text-free, no fake logos, no legal guarantees.`,
      negativePrompt: "No legal guarantees, fake logos, government seals, court victory imagery, mugshots, jail bars, handcuffs, or readable fake text.",
      brandSafeRules: ["No legal guarantees", "No fake partner logos", "No mugshots", "No readable fake text"],
      overlayRules: ["Keep copy short", "No outcome promises", "Readable on mobile"]
    },
    ...(finalKit ? {
      postingPackageGenerated: true,
      postingPackagePath: finalKit.postingPackage.path,
      postingPackageDownloadUrl: finalKit.postingPackage.downloadUrl,
      postingPackageGeneratedAt: now,
      postingPackageFileList: finalKit.postingPackage.fileList,
      postingPackage: finalKit.postingPackage,
      finalPngFilename: finalKit.exportFilename,
      finalExportKit: finalKit
    } : {})
  };
}

function writeText(filePath, value = "") {
  writeFileSync(filePath, `${String(value || "").trim()}\n`, "utf8");
}

async function buildPostAssets(post) {
  const format = formatFor(post.platform);
  const exportFilename = `legalease-${slugify(post.contentBucket)}-${slugify(format.id)}-${dateSlug}-${slugify(post.id)}.png`;
  const finalRelativePath = `data/exports/final-pngs/${exportFilename}`;
  const finalPath = path.join(rootDir, finalRelativePath);
  await renderDemoPng(post, finalPath);
  const finalSize = statSync(finalPath).size;
  const kitRelativePath = `data/exports/posting-kits/${slugify(post.id)}-${dateSlug}`;
  const kitPath = path.join(rootDir, kitRelativePath);
  mkdirSync(kitPath, { recursive: true });
  copyFileSync(finalPath, path.join(kitPath, "final.png"));
  const caption = captionFor(post);
  const hashtags = post.hashtags.join(" ");
  const fileList = ["final.png", "caption.txt", "hashtags.txt", "alt-text.txt", "posting-notes.txt", "metadata.json"];
  const metadata = {
    postId: post.id,
    title: post.title,
    platform: post.platform,
    contentBucket: post.contentBucket,
    speaker: post.speaker,
    riskLevel: post.complianceRisk || "low",
    finalPngFilename: exportFilename,
    finalPngSourcePath: finalRelativePath,
    generatedTimestamp: now,
    manualPostingKitStatus: "ready",
    livePostingStatus: "disabled/manual-only"
  };
  writeText(path.join(kitPath, "caption.txt"), caption);
  writeText(path.join(kitPath, "hashtags.txt"), hashtags);
  writeText(path.join(kitPath, "alt-text.txt"), `LegalEase ${post.contentBucket} social graphic for ${post.platform} about ${post.title}.`);
  writeText(path.join(kitPath, "posting-notes.txt"), "Investor demo package. Confirm channel, account, compliance status, and live gate before publishing.");
  writeText(path.join(kitPath, "metadata.json"), JSON.stringify(metadata, null, 2));
  return {
    status: "ready",
    platformFormatId: format.id,
    platformFormatLabel: format.label,
    platform: post.platform,
    width: format.width,
    height: format.height,
    dimensions: `${format.width}x${format.height}`,
    contentBucket: post.contentBucket,
    overlayText: post.overlay,
    caption,
    hashtags,
    altText: metadata.title,
    postingNotes: "Investor demo package. Manual or live-gated posting only.",
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
}

function copyCheckpoint() {
  mkdirSync(path.dirname(checkpointRoot), { recursive: true });
  cpSync(rootDir, checkpointRoot, {
    recursive: true,
    force: true,
    filter(source) {
      const base = path.basename(source);
      if (["node_modules", ".next", ".npm-cache", ".git"].includes(base)) return false;
      if (base.startsWith(".env") && base !== ".env.example") return false;
      return true;
    }
  });
  writeFileSync(path.join(checkpointRoot, "CHECKPOINT.md"), `# LegalEase Command Center - Launch Demo Checkpoint

Date: ${dateSlug}

This checkpoint preserves the investor-demo launch stabilization pack.

Included:
- Clean six-month Growth Command Center demo data
- Six polished demo social posts
- Six generated final PNG files
- Posting kit folders for each demo post
- Demo script
- Local server launcher and keepalive workflow
- Safe fail-closed social publishing diagnostics

Security:
- .env and .env.local are excluded
- node_modules, .git, .next, and cache folders are excluded
- Live posting remains gated server-side

Demo URL:
http://127.0.0.1:3001/#overview
`);
}

function writeDemoScript() {
  writeFileSync(demoScriptPath, `# LegalEase Command Center Investor Demo Script

## 0. Open
URL: http://127.0.0.1:3001/#overview

Say: "This is LegalEase's operating system for turning partner demand, content production, RecordShield usage, and investor proof into one execution loop."

## 1. Overview
Show the 9.5 readiness score, Next actions, Blocked items, and Progress.

Point: "The app tells us what needs action today, what is blocked, and what proof is building."

## 2. Partners
Open Partners.

Point: "This is not a contact list. Each partner has owner, stage, next action, qualification, proof value, and follow-up discipline."

## 3. Campaigns
Open Campaigns.

Point: "Campaigns only count when tracking, compliance, partner approval, and distribution are real."

## 4. RecordShield Funnel
Open RecordShield Funnel.

Point: "This is the key acquisition proof: RecordShield starts are tracked into Expungement.ai intent and paid conversion."

## 5. Queue
Open Queue.

Show:
- A ready post
- A needs-review Wilma post
- A blocked post
- Final PNG download
- Posting Kit download
- Publish diagnostics

Point: "The content engine is production-ready, but publishing fails closed unless channel setup is correct."

## 6. Data Room
Open Data Room.

Point: "The system creates the investor/acquirer evidence trail as the company operates."

## 7. Close
Say: "The point is not another dashboard. The point is making it harder for LegalEase to lie to itself about pilots, users, conversion, compliance, and proof."

## Backup close
Checkpoint:
${checkpointRoot}
`);
}

async function main() {
  mkdirSync(finalPngDir, { recursive: true });
  mkdirSync(kitRoot, { recursive: true });
  execFileSync(process.execPath, [path.join("scripts", "create-demo-dataset.mjs")], { cwd: rootDir, stdio: "inherit" });

  const state = readState();
  const kits = new Map();
  for (const post of demoPosts) {
    kits.set(post.id, await buildPostAssets(post));
  }

  state.posts = demoPosts.map((post) => postRecord(post, kits.get(post.id)));
  state.contentBank = demoContentBank();
  state.generationBatches = [
    {
      id: "batch-launch-demo-001",
      source: "content_bank",
      ideaIds: state.contentBank.slice(0, 10).map((idea) => idea.id),
      postIds: state.posts.map((post) => post.id),
      createdAt: now,
      status: "generated",
      nextBestAction: "Review demo approvals"
    }
  ];
  state.postImages = demoPosts.map((post) => {
    const kit = kits.get(post.id);
    return {
      id: `demo-image-${post.id}`,
      postId: post.id,
      imageUrl: kit.finalPngPath,
      finalImageUrl: kit.finalPngPath,
      finalPngUrl: kit.finalPngPath,
      finalPngPath: kit.finalPngPath,
      finalPngFileSize: kit.finalPngFileSize,
      finalPngGeneratedAt: now,
      generationStatus: "generated",
      imageStatus: "final_composited",
      generationMode: "launch_demo_art_directed_png",
      finalImageReady: true,
      textRenderingMode: "baked_overlay",
      finalImageWidth: kit.width,
      finalImageHeight: kit.height,
      aspectRatio: kit.width === kit.height ? "1:1" : "16:9",
      versionNumber: 1,
      promptVersion: "launch-demo-polished-local-v1",
      visualLane: slugify(post.contentBucket),
      artisticTreatment: post.treatment,
      overlayZone: "left",
      visualMetaphor: post.visual,
      wilmaTreatment: post.speaker === "wilma" ? "reserved guide area" : "none",
      createdAt: now,
      updatedAt: now,
      assetBundleUsed: {
        finalImage: {
          ready: true,
          localPath: kit.finalPngPath,
          fileSize: kit.finalPngFileSize,
          createdAt: now
        }
      }
    };
  });
  state.settings = {
    ...(state.settings || {}),
    dailyTarget: 3,
    latestDemoDatasetLoadedAt: now,
    launchDemoPreparedAt: now,
    launchDemoCheckpointPath: checkpointRoot,
    launchDemoScriptPath: "DEMO_SCRIPT.md",
    firstQueueReviewPostIds: ["demo-post-ready", "demo-post-campaign", "demo-post-review"]
  };
  state.activityEvents = [
    { id: `activity-launch-demo-${Date.now()}`, eventType: "Launch demo prepared", title: "Six polished posts, PNGs, and posting kits are ready", relatedObjectType: "settings", relatedObjectId: "launch-demo", createdAt: now },
    ...(state.activityEvents || [])
  ].slice(0, 120);
  writeState(analyzeOperations(state));

  writeDemoScript();
  copyCheckpoint();

  console.log(JSON.stringify({
    ok: true,
    posts: state.posts.length,
    finalPngs: demoPosts.map((post) => kits.get(post.id).finalPngPath),
    postingKits: demoPosts.map((post) => kits.get(post.id).postingPackage.relativePath),
    demoScript: path.relative(rootDir, demoScriptPath),
    checkpoint: checkpointRoot
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
