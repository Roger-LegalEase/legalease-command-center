#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPartnersTrainScenario } from "./fixtures/vnext-partners-train.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(projectRoot, "data", "seed", "social-command-center.seed.json");
const networkGuardPath = path.join(projectRoot, "scripts", "test-support", "browser-network-guard.mjs");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const artifactDir = path.join(projectRoot, "test-results");
const inheritedNames = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];
const activeChildren = new Set();
let shutdownPromise = null;

function inheritedEnvironment() {
  return Object.fromEntries(inheritedNames.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
}

function sanitizedLog(value = "") {
  return String(value)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]");
}

function serverEnvironment({ dataPath, vnext, restricted = false, restrictedCredential = "", restrictedCredentials = {}, sessionSecret = "", productFlags = {} }) {
  return {
    ...inheritedEnvironment(),
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    NODE_DISABLE_COMPILE_CACHE:"1",
    NODE_OPTIONS:`--import=${networkGuardPath}`,
    HOST:"127.0.0.1",
    PORT:"0",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_ALLOW_JSON:"true",
    LOCAL_DEMO_MODE:"true",
    COMMAND_CENTER_AUTH_DISABLED:restricted ? "false" : "true",
    COMMAND_CENTER_REQUIRE_AUTH:restricted ? "true" : "false",
    COMMAND_CENTER_OWNER_TOKEN:restricted ? (restrictedCredentials.owner || "") : "",
    COMMAND_CENTER_ADMIN_TOKEN:restricted ? (restrictedCredentials.admin || "") : "",
    COMMAND_CENTER_OPERATOR_TOKEN:restricted ? (restrictedCredentials.operator || restrictedCredential) : "",
    COMMAND_CENTER_VIEWER_TOKEN:restricted ? (restrictedCredentials.viewer || "") : "",
    COMMAND_CENTER_SESSION_SECRET:restricted ? sessionSecret : "",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_SEED_PATH:seedPath,
    COMMAND_CENTER_UX_VNEXT:vnext ? "true" : "false",
    COMMAND_CENTER_UX_VNEXT_SOCIAL:productFlags.social === true ? "true" : "false",
    COMMAND_CENTER_UX_VNEXT_OUTREACH:productFlags.outreach === true ? "true" : "false",
    COMMAND_CENTER_UX_VNEXT_FILES:productFlags.files === true ? "true" : "false",
    COMMAND_CENTER_UX_VNEXT_DISCOVERY:productFlags.discovery === true ? "true" : "false",
    COMMAND_CENTER_FILES_CURSOR_SECRET:productFlags.files === true ? "synthetic-browser-files-cursor-secret" : "",
    LIVE_POSTING_ENABLED:"false",
    ENABLE_LIVE_LINKEDIN_POSTING:"false",
    ENABLE_LIVE_FACEBOOK_POSTING:"false",
    ENABLE_LIVE_INSTAGRAM_POSTING:"false",
    ENABLE_LIVE_X_POSTING:"false",
    ENABLE_LIVE_THREADS_POSTING:"false",
    ENABLE_LIVE_TIKTOK_POSTING:"false",
    LINKEDIN_LIVE_POSTING:"false",
    FACEBOOK_LIVE_POSTING:"false",
    INSTAGRAM_LIVE_POSTING:"false",
    X_LIVE_POSTING:"false",
    REACTIVATION_LIVE_SEND:"false",
    OUTREACH_LIVE_SEND:"false",
    ALERT_EMAIL_LIVE_SEND:"false",
    PROSPECT_LIVE_DISCOVERY:"false",
    SENDGRID_WEBHOOK_ENABLED:"false",
    PRODUCT_EVENT_WEBHOOK_ENABLED:"false",
    PRODUCT_WEBHOOK_ENABLED:"false",
    ALLOW_LOCAL_IMAGE_FALLBACK:productFlags.social === true ? "true" : "false",
    COMMAND_CENTER_TEST_SOCIAL_PUBLISH_ADAPTER:productFlags.social === true ? "inert" : "",
    COMMAND_CENTER_TEST_SOCIAL_MANUAL_ADAPTER:productFlags.social === true ? "inert" : "",
    COMMAND_CENTER_TEST_SOCIAL_PUBLISH_FAILURE_CHANNELS:productFlags.social === true ? "instagram" : ""
  };
}

function browserFixtureState(seed, { includeActions = false } = {}) {
  const fixtureNow = new Date();
  const futureDate = (days) => new Date(fixtureNow.getTime() + (days * 24 * 60 * 60 * 1_000)).toISOString().slice(0, 10);
  const post = Object.freeze({
    id:"browser-post-search-001",
    title:"Café launch update",
    hook:"A founder-ready résumé of the launch",
    body:"Draft-only search fixture.",
    channel:"linkedin",
    status:"draft",
    updatedAt:"2026-07-16T12:00:00.000Z"
  });
  const hiddenPost = Object.freeze({
    id:"browser-post-owner-only-001",
    title:"Owner-only launch plan",
    status:"draft",
    visibility:"owner_only",
    updatedAt:"2026-07-16T13:00:00.000Z"
  });
  const campaign = Object.freeze({
    id:"browser-campaign-001",
    name:"Example outreach campaign",
    title:"Example outreach campaign",
    campaignType:"announcement",
    goal:"Share the browser launch update.",
    status:"draft",
    channel:"email",
    createdAt:"2026-07-15T12:00:00.000Z",
    updatedAt:"2026-07-15T12:00:00.000Z"
  });
  const partner = Object.freeze({
    id:"browser-partner-001",
    name:"Example community partner",
    organization:"Example community partner",
    primaryContactName:"Example Partner",
    geography:"Québec",
    nextAction:"Review the launch plan.",
    status:"qualified",
    createdAt:"2026-07-15T12:00:00.000Z",
    updatedAt:"2026-07-15T12:00:00.000Z"
  });
  const file = Object.freeze({
    id:"browser-file-search-001",
    name:"Launch readiness brief",
    section:"Company overview",
    notes:"Browser fixture file record.",
    status:"current",
    updatedAt:"2026-07-14T12:00:00.000Z"
  });
  const task = Object.freeze({
    id:"browser-task-search-001",
    title:"Finish launch checklist",
    description:"Confirm the browser search experience.",
    nextAction:"Open the exact Task.",
    status:"open",
    priority:"high",
    updatedAt:"2026-07-13T12:00:00.000Z"
  });
  const report = Object.freeze({
    id:"browser-report-search-001",
    reportTitle:"Launch results report",
    summary:"Representative browser Search report.",
    reportingPeriod:"Q3 2026",
    status:"current",
    generatedAt:"2026-07-12T12:00:00.000Z"
  });
  const inboxPost = Object.freeze({
    id:"browser-inbox-post-001",
    title:"Fulton County post needs two fixes",
    status:"needs_review",
    approvalStatus:"needs_review",
    priority:"high",
    owner:"Roger",
    updatedAt:"2026-07-15T14:00:00.000Z"
  });
  const inboxCampaign = Object.freeze({
    id:"browser-inbox-campaign-001",
    name:"July Partner outreach campaign",
    title:"July Partner outreach campaign",
    status:"ready_to_approve",
    priority:"high",
    owner:"Roger",
    launchDate:"2026-07-18",
    updatedAt:"2026-07-15T13:00:00.000Z"
  });
  const inboxPartner = Object.freeze({
    id:"browser-inbox-partner-001",
    name:"Philadelphia Reentry Coalition",
    organization:"Philadelphia Reentry Coalition",
    owner:"Roger",
    nextAction:"Confirm the next Partner conversation.",
    nextActionDueDate:"2026-07-15",
    status:"qualified",
    priority:"normal",
    updatedAt:"2026-07-15T12:00:00.000Z"
  });
  const waitingPartner = Object.freeze({
    id:"browser-inbox-partner-waiting-001",
    name:"Example Future Partner",
    owner:"Roger",
    nextAction:"Follow up after the scheduled response date.",
    nextActionDueDate:"2026-07-25",
    status:"qualified",
    priority:"normal",
    updatedAt:"2026-07-15T11:00:00.000Z"
  });
  const inboxFile = Object.freeze({
    id:"browser-inbox-file-001",
    title:"Investor Room operating plan",
    name:"Investor Room operating plan",
    status:"needs_update",
    owner:"Roger",
    priority:"high",
    nextReviewDate:"2026-07-15",
    updatedAt:"2026-07-15T10:00:00.000Z"
  });
  const inboxTask = Object.freeze({
    id:"browser-inbox-task-001",
    title:"Finish the Partner launch checklist",
    description:"The launch checklist is assigned and ready for attention.",
    status:"open",
    owner:"Roger",
    priority:"urgent",
    important:true,
    dueDate:"2026-07-16",
    updatedAt:"2026-07-15T15:00:00.000Z"
  });
  const inboxApproval = Object.freeze({
    id:"browser-inbox-approval-001",
    action_type:"review_social_post",
    queue_item_id:"browser-inbox-queue-001",
    preview:"Review the Fulton County post",
    risk_level:"caution",
    state:"requested",
    requested_at:"2026-07-15T15:30:00.000Z"
  });
  const inboxQueueItem = Object.freeze({
    id:"browser-inbox-queue-001",
    sourceRef:{ collection:"posts", itemId:inboxPost.id },
    type:"approval",
    status:"needs_roger",
    title:inboxPost.title,
    summary:"The post needs copy and safety review before it can move forward.",
    priority:20,
    requiresApproval:true,
    approvalId:inboxApproval.id,
    metadata:{ decisionType:"review_social_post" },
    updatedAt:"2026-07-15T15:30:00.000Z"
  });
  const mobileApprovalPost = Object.freeze({
    id:"browser-action-mobile-post-001",
    title:"Mobile approval review",
    status:"needs_review",
    approvalStatus:"needs_review",
    priority:"high",
    owner:"Roger",
    updatedAt:"2026-07-17T14:20:00.000Z"
  });
  const mobileApproval = Object.freeze({
    id:"browser-action-mobile-approval-001",
    action_type:"review_social_post",
    queue_item_id:"browser-action-mobile-queue-001",
    preview:"Review the mobile approval post",
    risk_level:"caution",
    state:"requested",
    requested_at:"2026-07-17T14:30:00.000Z"
  });
  const actionQueueItems = Object.freeze([
    Object.freeze({
      id:"browser-action-mobile-queue-001",
      sourceRef:{ collection:"posts", itemId:mobileApprovalPost.id },
      type:"approval",
      status:"needs_roger",
      title:mobileApprovalPost.title,
      summary:"This post needs a recorded approval before it can move forward.",
      priority:15,
      owner:"Roger",
      requiresApproval:true,
      approvalId:mobileApproval.id,
      metadata:{ decisionType:"review_social_post" },
      updatedAt:"2026-07-17T14:30:00.000Z"
    }),
    Object.freeze({
      id:"browser-action-queue-complete-001",
      type:"support",
      status:"needs_roger",
      title:"Complete the reviewed support follow-up",
      summary:"The reviewed support follow-up is ready to be marked complete.",
      priority:26,
      owner:"Roger",
      requiresApproval:false,
      updatedAt:"2026-07-17T14:10:00.000Z"
    }),
    Object.freeze({
      id:"browser-action-queue-snooze-001",
      type:"meeting",
      status:"needs_roger",
      title:"Revisit the meeting brief",
      summary:"This meeting brief needs a decision or a real revisit date.",
      priority:27,
      owner:"Roger",
      requiresApproval:false,
      updatedAt:"2026-07-17T14:00:00.000Z"
    }),
    Object.freeze({
      id:"browser-action-queue-stale-001",
      type:"report",
      status:"needs_roger",
      title:"Resolve the two-tab report review",
      summary:"This report review is ready for one current decision.",
      priority:28,
      owner:"Roger",
      requiresApproval:false,
      updatedAt:"2026-07-17T13:50:00.000Z"
    }),
    Object.freeze({
      id:"browser-action-queue-failure-001",
      type:"support",
      status:"needs_roger",
      title:"Retry the temporary follow-up update",
      summary:"This follow-up remains unchanged until a safe request succeeds.",
      priority:29,
      owner:"Roger",
      requiresApproval:false,
      updatedAt:"2026-07-17T13:40:00.000Z"
    }),
    Object.freeze({
      id:"browser-action-queue-mobile-snooze-001",
      type:"meeting",
      status:"needs_roger",
      title:"Mobile snooze review",
      summary:"This mobile review can use an existing dated snooze.",
      priority:31,
      owner:"Roger",
      requiresApproval:false,
      updatedAt:"2026-07-17T13:30:00.000Z"
    }),
    Object.freeze({
      id:"browser-action-queue-hidden-001",
      type:"approval",
      status:"needs_roger",
      title:"Confidential owner action",
      summary:"This action is private to its owner.",
      priority:99,
      owner:"Roger",
      requiresApproval:true,
      visibility:"owner_only",
      updatedAt:"2026-07-17T15:00:00.000Z"
    })
  ]);
  const hiddenInboxPost = Object.freeze({
    id:"browser-inbox-hidden-001",
    title:"Confidential acquisition post",
    status:"needs_review",
    visibility:"owner_only",
    priority:includeActions ? "low" : "urgent",
    updatedAt:"2026-07-15T16:00:00.000Z"
  });
  const repeatInboxPost = Object.freeze({ ...inboxPost, id:"browser-inbox-post-002", title:`${inboxPost.title} (repeat fixture)`, priority:"low" });
  const repeatInboxApproval = Object.freeze({
    ...inboxApproval,
    id:"browser-inbox-approval-002",
    queue_item_id:"browser-inbox-queue-002",
    preview:"Review the repeat Fulton County post"
  });
  const repeatInboxQueueItem = Object.freeze({
    ...inboxQueueItem,
    id:"browser-inbox-queue-002",
    sourceRef:{ collection:"posts", itemId:repeatInboxPost.id },
    title:repeatInboxPost.title,
    approvalId:repeatInboxApproval.id,
    priority:99
  });
  const repeatMobileApprovalPost = Object.freeze({ ...mobileApprovalPost, id:"browser-action-mobile-post-002", title:`${mobileApprovalPost.title} (repeat fixture)`, priority:"low" });
  const repeatMobileApproval = Object.freeze({
    ...mobileApproval,
    id:"browser-action-mobile-approval-002",
    queue_item_id:"browser-action-mobile-queue-002",
    preview:"Review the repeat mobile approval post"
  });
  const repeatActionQueueItems = Object.freeze(actionQueueItems
    .filter((item) => item.id !== "browser-action-queue-hidden-001")
    .map((item) => Object.freeze({
      ...item,
      id:item.id.replace(/-001$/, "-002"),
      title:`${item.title} (repeat fixture)`,
      priority:99,
      ...(item.id === "browser-action-mobile-queue-001" ? {
        sourceRef:{ collection:"posts", itemId:repeatMobileApprovalPost.id },
        approvalId:repeatMobileApproval.id
      } : {})
    })));
  const repeatInboxTask = Object.freeze({ ...inboxTask, id:"browser-inbox-task-002", title:`${inboxTask.title} (repeat fixture)`, priority:"low", important:true });
  const recentUpdate = Object.freeze({
    id:"browser-inbox-update-001",
    title:"Partner milestone announcement",
    status:"posted",
    postedAt:"2026-07-16T14:00:00.000Z",
    updatedAt:"2026-07-16T14:00:00.000Z"
  });
  const paginationTasks = Object.freeze(Array.from({ length:45 }, (_, index) => Object.freeze({
    id:`browser-inbox-page-task-${String(index).padStart(2, "0")}`,
    title:`Synthetic important task ${String(index + 1).padStart(2, "0")}`,
    description:"This deterministic Task is assigned and ready for attention.",
    status:"open",
    owner:"Roger",
    priority:index % 7 === 0 ? "high" : "normal",
    important:true,
    dueDate:index % 4 === 0 ? "" : futureDate(2 + (index % 9)),
    updatedAt:`2026-07-15T${String(index % 24).padStart(2, "0")}:30:00.000Z`
  })));
  return {
    ...seed,
    approvals:[inboxApproval, ...(includeActions ? [repeatInboxApproval, mobileApproval, repeatMobileApproval] : []), ...(Array.isArray(seed.approvals) ? seed.approvals : []).filter((item) => ![inboxApproval.id, repeatInboxApproval.id, mobileApproval.id, repeatMobileApproval.id].includes(item?.id))],
    queueItems:[inboxQueueItem, ...(includeActions ? [repeatInboxQueueItem, ...actionQueueItems, ...repeatActionQueueItems] : []), ...(Array.isArray(seed.queueItems) ? seed.queueItems : []).filter((item) => ![inboxQueueItem.id, repeatInboxQueueItem.id, ...actionQueueItems.map((candidate) => candidate.id), ...repeatActionQueueItems.map((candidate) => candidate.id)].includes(item?.id))],
    posts:[post, hiddenPost, inboxPost, ...(includeActions ? [repeatInboxPost, mobileApprovalPost, repeatMobileApprovalPost] : []), hiddenInboxPost, recentUpdate, ...(Array.isArray(seed.posts) ? seed.posts : []).filter((item) => ![post.id, hiddenPost.id, inboxPost.id, repeatInboxPost.id, mobileApprovalPost.id, repeatMobileApprovalPost.id, hiddenInboxPost.id, recentUpdate.id].includes(item?.id))].map((item) => ({ ...item, _version:Number.isSafeInteger(item?._version) ? item._version : 1 })),
    campaigns:[campaign, inboxCampaign, ...(Array.isArray(seed.campaigns) ? seed.campaigns : []).filter((item) => ![campaign.id, inboxCampaign.id].includes(item?.id))],
    partners:[partner, inboxPartner, waitingPartner, ...(Array.isArray(seed.partners) ? seed.partners : []).filter((item) => ![partner.id, inboxPartner.id, waitingPartner.id].includes(item?.id))],
    dataRoomItems:[file, inboxFile, ...(Array.isArray(seed.dataRoomItems) ? seed.dataRoomItems : []).filter((item) => ![file.id, inboxFile.id].includes(item?.id))],
    tasks:[task, inboxTask, ...(includeActions ? [repeatInboxTask] : paginationTasks), ...(Array.isArray(seed.tasks) ? seed.tasks : []).filter((item) => ![task.id, inboxTask.id, repeatInboxTask.id, ...paginationTasks.map((candidate) => candidate.id)].includes(item?.id))],
    reports:[report, ...(Array.isArray(seed.reports) ? seed.reports : []).filter((item) => item?.id !== report.id)]
  };
}

function todayFixtureState(seed) {
  const base = browserFixtureState(seed);
  const fixtureNow = new Date();
  return {
    ...base,
    approvals:[],
    queueItems:[],
    approvalQueue:[],
    posts:[
      { id:"today-browser-social-next", title:"Review the access guide post", status:"needs_review", approvalStatus:"needs_review", priority:"critical", updatedAt:"2026-07-17T14:00:00.000Z" },
      { id:"today-browser-social-later-one", title:"Review the Partner resource post", status:"needs_review", priority:"normal", updatedAt:"2026-07-17T06:30:00.000Z" },
      { id:"today-browser-social-later-two", title:"Review the community workshop post", status:"needs_review", priority:"normal", updatedAt:"2026-07-17T06:00:00.000Z" },
      { id:"today-browser-social-progress", title:"Access guide published", status:"posted", postedAt:"2026-07-17T13:00:00.000Z", updatedAt:"2026-07-17T13:00:00.000Z" },
      { id:"today-browser-hidden", title:"Hidden acquisition post", status:"needs_review", priority:"critical", allowedRoles:["admin"], updatedAt:"2026-07-17T15:00:00.000Z" }
    ].map((item) => ({ ...item, _version:1 })),
    campaigns:[
      { id:"today-browser-campaign-next", campaignName:"July Partner outreach campaign", name:"July Partner outreach campaign", title:"July Partner outreach campaign", status:"ready", owner:"Roger", priority:"high", complianceStatus:"approved", partnerApprovalStatus:"approved", startDate:"2026-07-17", updatedAt:"2026-07-17T12:00:00.000Z" },
      { id:"today-browser-campaign-progress", campaignName:"Partner education outreach", name:"Partner education outreach", status:"completed", owner:"Roger", completedAt:"2026-07-17T11:00:00.000Z", updatedAt:"2026-07-17T11:00:00.000Z" }
    ],
    partners:[
      { id:"today-browser-partner-next", organizationName:"Philadelphia Reentry Coalition", name:"Philadelphia Reentry Coalition", organization:"Philadelphia Reentry Coalition", owner:"Roger", priority:"high", nextAction:"Confirm the next Partner conversation.", nextFollowUpDate:"2026-07-17", updatedAt:"2026-07-17T10:00:00.000Z" },
      { id:"today-browser-partner-progress", organizationName:"Synthetic Community Partner", name:"Synthetic Community Partner", owner:"Roger", responseReceivedAt:"2026-07-17T09:30:00.000Z", responseSummary:"The Partner confirmed the next milestone.", updatedAt:"2026-07-17T09:30:00.000Z" }
    ],
    tasks:[
      { id:"today-browser-now-task", title:"Prepare the current Partner brief", description:"Prepare the reviewed brief for the next Partner conversation.", status:"open", owner:"Roger", priority:"normal", important:true, dueDate:"2026-07-17", nextAction:"Prepare the short Partner brief.", updatedAt:"2026-07-17T08:00:00.000Z" },
      { id:"today-browser-progress-task", title:"Finish the Partner report", status:"done", owner:"Roger", completionNote:"The Partner report is complete.", completedAt:"2026-07-17T09:00:00.000Z", updatedAt:"2026-07-17T09:00:00.000Z" }
    ],
    automationSuggestions:[],
    inboxSignals:[],
    growthInbox:[],
    supportIssues:[],
    reports:[],
    dataRoomItems:[],
    evidencePackNotes:[],
    soc2Evidence:[],
    soc2Policies:[],
    dailyRunSessions:[{
      session_id:"today-browser-current-run",
      status:"active",
      started_at:new Date(fixtureNow.getTime() - (4 * 60 * 60 * 1_000)).toISOString(),
      last_active_at:fixtureNow.toISOString(),
      current_bucket_key:"due_today",
      bucket_snapshot:{ buckets:[{ key:"due_today", items:[{ id:"today-browser-now-task", type:"task", route:"tasks", source:"tasks" }] }] },
      completed_bucket_keys:[], completed_items:[], skipped_bucket_keys:[], parked_items:[]
    }],
    morningBriefs:[],
    auditHistory:[{ id:"today-browser-audit-noise", timestamp:"2026-07-17T15:45:00.000Z", action:"health ping" }],
    activityEvents:[{ id:"today-browser-provider-noise", createdAt:"2026-07-17T15:40:00.000Z", title:"Provider sync" }]
  };
}

function socialFixtureState(seed) {
  const base = browserFixtureState(seed);
  const socialPost = (id, status, extra = {}) => ({
    id,
    title:`Social home ${id.replaceAll("-", " ")}`,
    hook:`A truthful Social summary for ${id}.`,
    body:`Stored synthetic Post copy for ${id}.`,
    status,
    targetChannels:["linkedin"],
    channelVariants:{ linkedin:{ body:`LinkedIn copy for ${id}.` } },
    imageIntentionallyOmitted:true,
    guidelinesGate:{ passed:true, hardFails:[] },
    approvalRequired:false,
    scheduledFor:"",
    topic:"Access guide",
    owner:"Roger",
    createdAt:"2026-07-10T12:00:00.000Z",
    updatedAt:"2026-07-17T12:00:00.000Z",
    ...extra
  });
  const ideaPosts = Array.from({ length:28 }, (_, index) => socialPost(`idea-${String(index + 1).padStart(2, "0")}`, index % 4 === 0 ? "idea" : "draft", {
    title:index === 0 ? "A clear path through an access request" : `Social idea ${String(index + 1).padStart(2, "0")}`,
    body:index % 4 === 0 ? "" : `Draft copy ${index + 1}.`,
    topic:index % 3 === 0 ? "Community" : "Access guide",
    targetChannels:index % 2 === 0 ? ["linkedin"] : ["instagram"],
    channelVariants:index % 2 === 0 ? { linkedin:{ body:`LinkedIn draft ${index + 1}.` } } : { instagram:{ body:`Instagram draft ${index + 1}.` } },
    contentBankIdeaId:index === 0 ? "social-source-converted" : undefined,
    updatedAt:`2026-07-${String(17 - (index % 7)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`
  }));
  const reviewPosts = Array.from({ length:8 }, (_, index) => socialPost(`review-${String(index + 1).padStart(2, "0")}`, "needs_review", {
    title:`Needs review ${String(index + 1).padStart(2, "0")}`,
    approvalRequired:true,
    approvalStatus:"needs_review",
    updatedAt:`2026-07-16T${String(index + 8).padStart(2, "0")}:00:00.000Z`
  }));
  const scheduleTruth = [
    { scheduledFor:"2026-07-20T14:00:00.000Z", timezone:"America/New_York" },
    { scheduledFor:"2026-07-21T00:30:00.000Z", timezone:"America/New_York" },
    { scheduledFor:"2026-07-22T16:00:00.000Z" },
    { scheduledFor:"2026-07-23T16:00:00.000Z", timezone:"Not/A_Zone" },
    { scheduledFor:"2026-07-24T14:00:00", timezone:"America/New_York" },
    { scheduledFor:"2026-07-25", timezone:"America/New_York" },
    { scheduledFor:"2026-07-26T15:00:00.000Z", timezone:"America/New_York" },
    { scheduledFor:"2026-07-27T15:00:00-04:00" }
  ];
  const scheduledPosts = Array.from({ length:8 }, (_, index) => socialPost(`scheduled-${String(index + 1).padStart(2, "0")}`, "scheduled", {
    title:index === 0 ? "Community access checklist" : index === 1 ? "Midnight boundary Post" : `Scheduled Post ${String(index + 1).padStart(2, "0")}`,
    ...scheduleTruth[index],
    updatedAt:`2026-07-15T${String(index + 8).padStart(2, "0")}:00:00.000Z`
  }));
  const publishedPosts = Array.from({ length:8 }, (_, index) => socialPost(`published-${String(index + 1).padStart(2, "0")}`, "published", {
    title:index === 0 ? "Published community guide" : index === 1 ? "Published guide awaiting metrics" : `Published Post ${String(index + 1).padStart(2, "0")}`,
    approvalStatus:"approved",
    approvalRevision:`published-${String(index + 1).padStart(2, "0")}-revision-1`,
    campaignId:index % 2 ? "results-campaign-community" : "results-campaign-education",
    selectedTemplateId:index % 2 ? "results-template-story" : "results-template-guide",
    theme:index % 2 ? "Community Stories" : "Know Your Options",
    topic:index === 2 ? "Partial publication" : "Access guide",
    disclaimerIds:["results-disclaimer"],
    ...(index === 0 ? { dataRoomItemId:"browser-file-search-001" } : {}),
    ...(index === 2 ? { targetChannels:["linkedin", "facebook"] } : {}),
    publishedAt:`2026-07-${String(16 - index).padStart(2, "0")}T15:00:00.000Z`,
    publishedUrl:`https://example.com/social/published-${index + 1}`,
    ...(index === 1 ? {} : { performance:{ impressions:1200 + index * 100, likes:44 + index, comments:7 + index, clicks:15 + index } }),
    updatedAt:`2026-07-${String(16 - index).padStart(2, "0")}T15:00:00.000Z`
  }));
  const publishEvents = publishedPosts.flatMap((post, index) => [
    {
      id:`results-published-${index + 1}-linkedin`, postId:post.id, approvalRevision:post.approvalRevision,
      channel:"linkedin", eventType:"published", publishedAt:post.publishedAt, publishedUrl:post.publishedUrl
    },
    ...(index === 2 ? [{
      id:"results-published-3-facebook-failed", postId:post.id, approvalRevision:post.approvalRevision,
      channel:"facebook", eventType:"publish_failed", status:"failed_terminal", publishedAt:post.publishedAt
    }] : [])
  ]);
  const hidden = socialPost("hidden-owner-work", "draft", { title:"Hidden Social plan", allowedRoles:["admin"], visibility:"owner_only" });
  return {
    ...base,
    posts:[...ideaPosts, ...reviewPosts, ...scheduledPosts, ...publishedPosts, hidden].map((item) => ({ ...item, _version:1 })),
    contentBank:[
      { id:"social-source-converted", title:"Converted source should appear once", status:"idea", updatedAt:"2026-07-17T10:00:00.000Z" },
      { id:"social-source-community", title:"Community workshop questions", summary:"An unconverted Content Bank idea.", topic:"Community", owner:"Roger", updatedAt:"2026-07-17T11:00:00.000Z" },
      { id:"social-source-rights", title:"Know your next step", summary:"A second unconverted Content Bank idea.", topic:"Access guide", owner:"Roger", updatedAt:"2026-07-17T09:00:00.000Z" },
      { id:"social-source-hidden", title:"Hidden source", allowedRoles:["admin"], visibility:"owner_only" }
    ],
    campaigns:[
      { id:"results-campaign-education", name:"Education campaign" },
      { id:"results-campaign-community", name:"Community campaign" },
      ...(Array.isArray(base.campaigns) ? base.campaigns : []).filter((item) => !["results-campaign-education", "results-campaign-community"].includes(item?.id))
    ],
    generationProfiles:[
      { id:"results-template-guide", profileName:"Guide", category:"Education", supportedChannels:["linkedin", "facebook"], defaultDisclaimerId:"results-disclaimer", active:true, approved:true },
      { id:"results-template-story", profileName:"Community story", category:"Community", supportedChannels:["linkedin"], defaultDisclaimerId:"results-disclaimer", active:true, approved:true },
      ...(Array.isArray(base.generationProfiles) ? base.generationProfiles : []).filter((item) => !["results-template-guide", "results-template-story"].includes(item?.id))
    ],
    library:[
      { id:"results-disclaimer", category:"disclaimer", title:"Synthetic information disclaimer", body:"Synthetic information only.", status:"approved" },
      ...(Array.isArray(base.library) ? base.library : []).filter((item) => item?.id !== "results-disclaimer")
    ],
    postImages:[], brandAssets:[], postingKits:[], approvals:[], approvalQueue:[], queueItems:[], publishEvents, activityEvents:[], auditHistory:[], generationBatches:[],
    socialAccounts:[
      { id:"social-account-linkedin", platform:"linkedin", channel:"linkedin", connected:true, status:"connected", connectedAt:"2026-07-01T00:00:00.000Z", accountName:"Synthetic LinkedIn" },
      { id:"social-account-instagram", platform:"instagram", channel:"instagram", connected:true, status:"connected", connectedAt:"2026-07-01T00:00:00.000Z", accountName:"Synthetic Instagram" },
      { id:"social-account-x", platform:"x", channel:"x", connected:false, status:"not_connected" },
      { id:"social-account-facebook", platform:"facebook", channel:"facebook", connected:false, status:"not_connected" },
      { id:"social-account-threads", platform:"threads", channel:"threads", connected:false, status:"not_connected" }
    ],
    runtime:{ ...(base.runtime || {}), livePostingGates:{ linkedin:false, instagram:false } },
    settings:{ ...(base.settings || {}), sourceItems:[] }
  };
}

function socialProductionFixtureState(seed) {
  const state = socialFixtureState(seed);
  const reviewedPost = {
    id:"production-post",
    _version:1,
    title:"Synthetic production Post",
    headline:"A clear route through an access request",
    body:"Reviewed synthetic information for a founder-controlled Social workflow.",
    hook:"Start with the exact reviewed facts.",
    cta:"Review the next step.",
    hashtags:["#LegalEase"],
    status:"draft",
    approvalRequired:true,
    approvalStatus:"not_requested",
    copyReviewed:true,
    imageIntentionallyOmitted:true,
    finalPreviewConfirmed:true,
    guidelinesGate:{ passed:true, hardFails:[] },
    creativeSurfaceTone:"dark",
    targetChannels:["linkedin", "instagram"],
    channelVariants:[],
    createdAt:"2026-07-19T10:00:00.000Z",
    updatedAt:"2026-07-19T10:00:00.000Z"
  };
  const blockedPost = {
    ...reviewedPost,
    id:"production-blocked",
    title:"Blocked production Post",
    headline:"Blocked claim",
    guidelinesGate:{ passed:false, hardFails:[{ key:"outcome_claim", detail:"Revise the unsupported outcome claim." }] }
  };
  const manualPost = {
    ...reviewedPost,
    id:"production-manual",
    title:"Manual fallback Post",
    headline:"Manual fallback is explicit",
    status:"approved",
    approvalStatus:"approved",
    approvedAt:"2026-07-19T11:00:00.000Z",
    approvalRevision:"production-manual-revision",
    targetChannels:["x"],
    manualPublishingAvailable:true
  };
  const publishPost = {
    ...reviewedPost,
    id:"production-publish",
    title:"Controlled publication Post",
    headline:"Controlled publication remains channel-specific",
    status:"approved",
    approvalStatus:"approved",
    approvedAt:"2026-07-19T11:30:00.000Z",
    approvalRevision:"production-publish-revision",
    targetChannels:["linkedin", "instagram"],
    channelVariants:[
      { id:"production-publish:linkedin", channel:"linkedin", body:"Controlled LinkedIn publication copy." },
      { id:"production-publish:instagram", channel:"instagram", body:"Controlled Instagram publication copy." }
    ]
  };
  return {
    ...state,
    posts:[reviewedPost, blockedPost, manualPost, publishPost, ...state.posts.filter((post) => ![reviewedPost.id, blockedPost.id, manualPost.id, publishPost.id].includes(post?.id))],
    generationProfiles:[
      { id:"production-template", displayName:"Reviewed education template", templateCategory:"education", active:true, approved:true, surfaceTone:"dark", requiredAssetRoles:["logo", "wilma_pose", "background"], assetIds:["brand-contract-white-wordmark", "production-wilma", "production-background"], defaultDisclaimerId:"production-disclaimer" },
      ...state.generationProfiles.filter((profile) => profile?.id !== "production-template")
    ],
    brandAssets:[
      { id:"production-wilma", name:"Reviewed Wilma guide pose", assetType:"wilma_pose", approved:true },
      { id:"production-background", name:"Reviewed navy background", assetType:"background", approved:true },
      ...state.brandAssets.filter((asset) => !["production-wilma", "production-background"].includes(asset?.id))
    ],
    library:[
      { id:"production-disclaimer", title:"Reviewed information disclaimer", category:"disclaimer", status:"approved", body:"Synthetic information only." },
      ...state.library.filter((item) => item?.id !== "production-disclaimer")
    ],
    socialAccounts:[
      { id:"production-linkedin", platform:"linkedin", connected:true, status:"connected" },
      { id:"production-instagram", platform:"instagram", connected:true, status:"connected" },
      { id:"production-x", platform:"x", connected:false, status:"not_connected" }
    ],
    runtime:{ ...(state.runtime || {}), livePostingGates:{ linkedin:true, instagram:true, x:false } },
    publishEvents:[],
    publishClaims:[],
    activityEvents:[],
    auditHistory:[]
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child, timeoutMs = 3_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), timeoutMs);
    const finish = (exited) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (!await waitForExit(child)) {
    child.kill("SIGKILL");
    await waitForExit(child);
  }
  activeChildren.delete(child);
}

async function startServer({ name, dataPath, vnext, restricted = false, restrictedCredential = "", restrictedCredentials = {}, sessionSecret = "", productFlags = {} }) {
  const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
    cwd:projectRoot,
    env:serverEnvironment({ dataPath, vnext, restricted, restrictedCredential, restrictedCredentials, sessionSecret, productFlags }),
    stdio:["ignore", "pipe", "pipe"]
  });
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  const startedAt = Date.now();
  let port = 0;
  while (Date.now() - startedAt < 20_000) {
    const match = logs.match(/LegalEase preview server ready at http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) {
      port = Number(match[1]);
      break;
    }
    if (child.exitCode !== null) throw new Error(`${name} server exited before readiness:\n${sanitizedLog(logs).slice(-4_000)}`);
    await wait(50);
  }
  if (!port) {
    await stopChild(child);
    throw new Error(`${name} server did not announce readiness:\n${sanitizedLog(logs).slice(-4_000)}`);
  }

  const baseURL = `http://127.0.0.1:${port}`;
  const healthStartedAt = Date.now();
  while (Date.now() - healthStartedAt < 10_000) {
    try {
      const response = await fetch(`${baseURL}/api/health`, { signal:AbortSignal.timeout(1_000) });
      if (response.ok && (await response.json()).status === "ok") {
        return { name, baseURL, child, logs:() => sanitizedLog(logs) };
      }
    } catch {
      // Readiness is bounded below; transient connection failures are expected during startup.
    }
    await wait(50);
  }
  await stopChild(child);
  throw new Error(`${name} server failed its health check:\n${sanitizedLog(logs).slice(-4_000)}`);
}

async function writeServerLogs(servers) {
  await mkdir(artifactDir, { recursive:true });
  await Promise.all(servers.map((server) => writeFile(
    path.join(artifactDir, `browser-server-${server.name}.log`),
    `${server.logs()}\n`,
    { mode:0o600 }
  )));
}

async function shutdown(servers, tempRoot) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await writeServerLogs(servers).catch(() => {});
    await Promise.all([...activeChildren].map((child) => stopChild(child)));
    if (tempRoot) await rm(tempRoot, { recursive:true, force:true });
  })();
  return shutdownPromise;
}

function runPlaywright(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "test", ...args], {
      cwd:projectRoot,
      env,
      stdio:"inherit"
    });
    activeChildren.add(child);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChildren.delete(child);
      if (signal) resolve(1);
      else resolve(Number(code) || 0);
    });
  });
}

const seedState = JSON.parse(await readFile(seedPath, "utf8"));
const fixtureState = browserFixtureState(seedState);
const actionFixtureState = browserFixtureState(seedState, { includeActions:true });
const todayState = todayFixtureState(seedState);
const socialState = socialFixtureState(seedState);
const socialProductionState = socialProductionFixtureState(seedState);
const composerRestrictedState = structuredClone(socialState);
const partnersState = structuredClone(buildPartnersTrainScenario().state);
partnersState.connectorStatus = [{ connector:"gmail", status:"connected", connected:true, updatedAt:"2026-07-21T14:00:00.000Z" }];
partnersState.inboxConfig = { lastScanAt:"2026-07-21T14:00:00.000Z", lastScanStatus:"complete", lastScanCount:2, backfillCompletedAt:"2026-07-21T14:00:00.000Z" };
partnersState.inboxSignals = [{
  id:"browser-lee-needs-reply",
  kind:"needs_reply",
  status:"suggested",
  counterpartName:"Taylor Example",
  counterpartEmail:"taylor@example.com",
  organization:"Community Justice Network",
  summary:"Taylor asked which pilot milestone Roger wants to confirm next.",
  suggestedNextAction:"Confirm the pilot decision date.",
  whoOwesNextMove:"Roger",
  confidence:0.92,
  dueAt:"2026-07-22T17:00:00.000Z",
  threadId:"synthetic-browser-thread-1",
  pipelineMatch:{ collection:"partners", itemId:"partner-community", matchedBy:"address" },
  ownerOnly:true,
  internalOnly:true,
  updatedAt:"2026-07-21T14:00:00.000Z"
}, {
  id:"browser-lee-went-quiet",
  kind:"went_quiet",
  status:"suggested",
  counterpartName:"Morgan Example",
  counterpartEmail:"morgan@example.com",
  organization:"Example Community Network",
  summary:"The Partner conversation has been quiet for eight days.",
  suggestedNextAction:"Send a short check-in with one useful next step.",
  confidence:0.81,
  ageDays:8,
  threadId:"synthetic-browser-thread-2",
  ownerOnly:true,
  internalOnly:true,
  updatedAt:"2026-07-21T13:00:00.000Z"
}];
const filesState = structuredClone(fixtureState);
filesState.dataRoomItems = [{
  id:"company-overview",
  title:"Synthetic company overview",
  status:"approved",
  owner:"Founder",
  collection:"investor-room",
  mimeType:"text/markdown",
  storageRef:"files/synthetic/company-overview.md",
  verifiedAt:"2026-07-18T12:00:00.000Z",
  updatedAt:"2026-07-18T12:00:00.000Z",
  allowedRoles:["owner", "admin", "operator", "viewer"]
}];
const founderOperationsState = structuredClone(fixtureState);
const founderOperationsNow = new Date();
const founderOperationsMeetingStart = new Date(founderOperationsNow.getTime() + 24 * 60 * 60 * 1_000);
const founderOperationsMeetingEnd = new Date(founderOperationsMeetingStart.getTime() + 45 * 60 * 1_000);
founderOperationsState.supportIssues = [{
  id:"founder-browser-support-001",
  title:"Customer needs an intake status update",
  summary:"A synthetic customer is waiting for a clear next step.",
  status:"open",
  urgency:"normal",
  owner:"Roger",
  partnerId:"browser-partner-001",
  requesterName:"Jamie Example",
  created_at:new Date(founderOperationsNow.getTime() - 2 * 24 * 60 * 60 * 1_000).toISOString(),
  updated_at:founderOperationsNow.toISOString(),
  history:[]
}];
founderOperationsState.calendarSignals = [{
  id:"founder-browser-calendar-001",
  eventId:"founder-browser-calendar-001",
  title:"Partner workflow review",
  summary:"Review the synthetic Partner workflow and agree on the next action.",
  organization:"Example Community Network",
  partnerId:"browser-partner-001",
  startTime:founderOperationsMeetingStart.toISOString(),
  endTime:founderOperationsMeetingEnd.toISOString(),
  htmlLink:"https://calendar.google.com/calendar/event?eid=synthetic-founder-operations",
  updatedAt:founderOperationsNow.toISOString()
}];
const composerTemplate = composerRestrictedState.posts.find((post) => post.id === "idea-01");
composerRestrictedState.posts.push(
  { ...structuredClone(composerTemplate), id:"composer-hidden", title:"Nondisclosed composer Post", visibility:"owner_only", allowedRoles:["owner"], _version:3 },
  { ...structuredClone(composerTemplate), id:"composer-duplicate", title:"Duplicate composer Post A", _version:4 },
  { ...structuredClone(composerTemplate), id:"composer-duplicate", title:"Duplicate composer Post B", _version:9 }
);
await rm(path.join(projectRoot, "playwright-report"), { recursive:true, force:true, maxRetries:5, retryDelay:100 });
await rm(artifactDir, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "legalease-browser-tests-"));
const legacyDataPath = path.join(tempRoot, "legacy-state.json");
const vnextDataPath = path.join(tempRoot, "vnext-state.json");
const createDataPath = path.join(tempRoot, "create-state.json");
const actionDataPath = path.join(tempRoot, "action-state.json");
const restrictedDataPath = path.join(tempRoot, "restricted-state.json");
const todayDataPath = path.join(tempRoot, "today-state.json");
const phase2DataPath = path.join(tempRoot, "phase2-state.json");
const phase2RestrictedDataPath = path.join(tempRoot, "phase2-restricted-state.json");
const socialDataPath = path.join(tempRoot, "social-state.json");
const socialProductionDataPath = path.join(tempRoot, "social-production-state.json");
const socialRestrictedDataPath = path.join(tempRoot, "social-restricted-state.json");
const composerRestrictedDataPath = path.join(tempRoot, "composer-restricted-state.json");
const composerRestrictedReadonlyDataPath = path.join(tempRoot, "composer-restricted-readonly-state.json");
const partnersDataPath = path.join(tempRoot, "partners-state.json");
const outreachDataPath = path.join(tempRoot, "outreach-state.json");
const filesDataPath = path.join(tempRoot, "files-state.json");
const discoveryDataPath = path.join(tempRoot, "discovery-state.json");
await Promise.all([
  writeFile(legacyDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(vnextDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(createDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(actionDataPath, `${JSON.stringify(actionFixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(restrictedDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(todayDataPath, `${JSON.stringify(todayState, null, 2)}\n`, { mode:0o600 }),
  writeFile(phase2DataPath, `${JSON.stringify(actionFixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(phase2RestrictedDataPath, `${JSON.stringify(actionFixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(socialDataPath, `${JSON.stringify(socialState, null, 2)}\n`, { mode:0o600 }),
  writeFile(socialProductionDataPath, `${JSON.stringify(socialProductionState, null, 2)}\n`, { mode:0o600 }),
  writeFile(socialRestrictedDataPath, `${JSON.stringify(socialState, null, 2)}\n`, { mode:0o600 }),
  writeFile(composerRestrictedDataPath, `${JSON.stringify(composerRestrictedState, null, 2)}\n`, { mode:0o600 }),
  writeFile(composerRestrictedReadonlyDataPath, `${JSON.stringify(composerRestrictedState, null, 2)}\n`, { mode:0o600 }),
  writeFile(partnersDataPath, `${JSON.stringify(partnersState, null, 2)}\n`, { mode:0o600 }),
  writeFile(outreachDataPath, `${JSON.stringify(fixtureState, null, 2)}\n`, { mode:0o600 }),
  writeFile(filesDataPath, `${JSON.stringify(filesState, null, 2)}\n`, { mode:0o600 }),
  writeFile(discoveryDataPath, `${JSON.stringify(founderOperationsState, null, 2)}\n`, { mode:0o600 })
]);
const restrictedCredential = crypto.randomBytes(32).toString("base64url");
const restrictedSessionSecret = crypto.randomBytes(32).toString("base64url");
const composerRestrictedCredentials = Object.fromEntries(["owner", "admin", "operator", "viewer"].map((role) => [role, crypto.randomBytes(32).toString("base64url")]));
const servers = [];

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await shutdown(servers, tempRoot);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

let exitCode = 1;
try {
  servers.push(await startServer({
    name:"legacy",
    dataPath:legacyDataPath,
    vnext:false
  }));
  servers.push(await startServer({
    name:"vnext",
    dataPath:vnextDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"create",
    dataPath:createDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"actions",
    dataPath:actionDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"restricted",
    dataPath:restrictedDataPath,
    vnext:true,
    restricted:true,
    restrictedCredential,
    sessionSecret:restrictedSessionSecret
  }));
  servers.push(await startServer({
    name:"today",
    dataPath:todayDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"phase2",
    dataPath:phase2DataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"phase2-restricted",
    dataPath:phase2RestrictedDataPath,
    vnext:true,
    restricted:true,
    restrictedCredential,
    sessionSecret:restrictedSessionSecret
  }));
  servers.push(await startServer({
    name:"social",
    dataPath:socialDataPath,
    vnext:true
  }));
  servers.push(await startServer({
    name:"social-restricted",
    dataPath:socialRestrictedDataPath,
    vnext:true,
    restricted:true,
    restrictedCredential,
    sessionSecret:restrictedSessionSecret
  }));
  servers.push(await startServer({
    name:"composer-restricted",
    dataPath:composerRestrictedDataPath,
    vnext:true,
    restricted:true,
    restrictedCredentials:composerRestrictedCredentials,
    sessionSecret:crypto.randomBytes(32).toString("base64url")
  }));
  servers.push(await startServer({
    name:"composer-restricted-readonly",
    dataPath:composerRestrictedReadonlyDataPath,
    vnext:true,
    restricted:true,
    restrictedCredentials:composerRestrictedCredentials,
    sessionSecret:crypto.randomBytes(32).toString("base64url")
  }));
  servers.push(await startServer({
    name:"partners",
    dataPath:partnersDataPath,
    vnext:true,
    productFlags:{ outreach:true }
  }));
  servers.push(await startServer({
    name:"outreach",
    dataPath:outreachDataPath,
    vnext:true,
    productFlags:{ outreach:true }
  }));
  servers.push(await startServer({
    name:"files",
    dataPath:filesDataPath,
    vnext:true,
    productFlags:{ files:true }
  }));
  servers.push(await startServer({
    name:"social-production",
    dataPath:socialProductionDataPath,
    vnext:true,
    productFlags:{ social:true }
  }));
  servers.push(await startServer({
    name:"discovery",
    dataPath:discoveryDataPath,
    vnext:true,
    productFlags:{ discovery:true }
  }));
  const runnerEnv = {
    ...inheritedEnvironment(),
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    CI:process.env.CI || "",
    BROWSER_TEST_BASE_URL:servers[0].baseURL,
    BROWSER_TEST_VNEXT_BASE_URL:servers[1].baseURL,
    BROWSER_TEST_CREATE_BASE_URL:servers[2].baseURL,
    BROWSER_TEST_ACTIONS_BASE_URL:servers[3].baseURL,
    BROWSER_TEST_RESTRICTED_BASE_URL:servers[4].baseURL,
    BROWSER_TEST_RESTRICTED_CREDENTIAL:restrictedCredential,
    BROWSER_TEST_TODAY_BASE_URL:servers[5].baseURL,
    BROWSER_TEST_PHASE2_BASE_URL:servers[6].baseURL,
    BROWSER_TEST_PHASE2_RESTRICTED_BASE_URL:servers[7].baseURL,
    BROWSER_TEST_SOCIAL_BASE_URL:servers[8].baseURL,
    BROWSER_TEST_COMPOSER_BASE_URL:servers[8].baseURL,
    BROWSER_TEST_SOCIAL_RESTRICTED_BASE_URL:servers[9].baseURL,
    BROWSER_TEST_COMPOSER_RESTRICTED_BASE_URL:servers[10].baseURL,
    BROWSER_TEST_COMPOSER_RESTRICTED_READONLY_BASE_URL:servers[11].baseURL,
    BROWSER_TEST_PARTNERS_BASE_URL:servers[12].baseURL,
    BROWSER_TEST_OUTREACH_BASE_URL:servers[13].baseURL,
    BROWSER_TEST_FILES_BASE_URL:servers[14].baseURL,
    BROWSER_TEST_SOCIAL_PRODUCTION_BASE_URL:servers[15].baseURL,
    BROWSER_TEST_DISCOVERY_BASE_URL:servers[16].baseURL,
    BROWSER_TEST_COMPOSER_RESTRICTED_CREDENTIALS:JSON.stringify(composerRestrictedCredentials)
  };
  exitCode = await runPlaywright(runnerEnv, process.argv.slice(2));
} finally {
  await shutdown(servers, tempRoot);
}

process.exitCode = exitCode;
