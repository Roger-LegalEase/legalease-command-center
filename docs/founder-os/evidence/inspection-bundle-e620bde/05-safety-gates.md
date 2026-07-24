# Safety-gate enforcement evidence

Collected 2026-07-23 (branch `hotfix/founder-targeted-reads`, HEAD `e620bde`). All code below is
pasted verbatim from the repo, with file paths and line numbers as of this commit. Line numbers
refer to the files at this HEAD.

---

## (a) No message is ever sent to a human without one-click approval

**VERDICT: enforced in code as a blocking condition** — at three independent layers:
(1) the send loop only iterates queue items a human has set to `approved`;
(2) a fail-closed send-decision function that returns dry-run unless an env/owner flag (default OFF) AND a SendGrid key are both present;
(3) the actual SendGrid dispatcher early-returns before any network call unless the decision status is exactly `"live"`;
plus a durable claims ledger that prevents any (contact, step) from ever being sent twice.

There are two send engines (cold outreach and consumer reactivation); both follow the same pattern.

### a.1 Approval filter in the only send path — `scripts/outreach-os.mjs`, function `actOutreach`, line 656

Only queue items with human-set status `approved` are ever iterated; `planOutreach` (the proposer)
only writes items with status `queued_for_approval` and never sends.

```js
// scripts/outreach-os.mjs:656 (inside actOutreach, lines 640-823 — the only send path)
const approved = next.approvalQueue.filter((q) => q.type === OUTREACH_QUEUE_TYPE && lower(q.status) === "approved");
```

### a.2 Fail-closed send decision — `scripts/outreach-os.mjs`, `resolveOutreachSendDecision`, lines 434-451

```js
// scripts/outreach-os.mjs:104-107 — the flag reader; default OFF
export function outreachLiveSendEnabled(env = process.env) {
  return ["true", "1", "yes", "on"].includes(String((env || {}).OUTREACH_LIVE_SEND || "").toLowerCase());
}

// scripts/outreach-os.mjs:434-451
export function resolveOutreachSendDecision(message = {}, { env = process.env } = {}) {
  const classification = clean(message.classification);
  const seq = resolveSequenceForClassification(classification);
  if (!seq.ok) return { status: "not_sent", reason: seq.reason, classification };
  const compliance = validateCompliance(message);
  if (!compliance.ok) return { status: "not_sent", reason: `compliance:${compliance.errors.join(",")}`, classification };
  const base = {
    sequence: seq.sequenceId,
    touch: message.touch || message.step_number || 1,
    classification,
    to: clean(message.to),
    subject: clean(message.subject)
  };
  if (!outreachLiveSendEnabled(env) || !clean((env || {}).SENDGRID_API_KEY)) {
    return { status: "dry_run", ...base, liveSend: false };
  }
  return { status: "live", ...base, liveSend: true };
}
```

### a.3 The SendGrid dispatcher blocks unless the decision is "live" — `scripts/preview-server.mjs`, `runOutreachSend`, lines 5436-5469

```js
// scripts/preview-server.mjs:5436-5469
async function runOutreachSend(message, { env = process.env } = {}) {
  const decision = resolveOutreachSendDecision(message, { env });
  // dry_run (gate off) or not_sent (failed closed) — return WITHOUT any network send.
  if (decision.status !== "live") return decision;

  // Live path: assemble the SendGrid v3 payload from the already-compliant message.
  const apiKey = env.SENDGRID_API_KEY;
  const payload = {
    personalizations: [{ to: [{ email: message.to }] }],
    from: message.fromName ? { email: message.from, name: message.fromName } : { email: message.from },
    ...(message.replyTo ? { reply_to: { email: message.replyTo } } : {}),
    subject: message.subject,
    content: [
      { type: "text/plain", value: message.text },
      ...(message.html ? [{ type: "text/html", value: message.html }] : [])
    ],
    ...(message.headers && Object.keys(message.headers).length ? { headers: message.headers } : {})
  };
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", { ... });
  ...
}
```

`runReactivationSend` (preview-server.mjs:5475-5505) is identical in structure: line 5477
`if (decision.status !== "live") return decision;` precedes the SendGrid POST.

### a.4 Atomic claims ledger before any live send — `scripts/outreach-os.mjs`, lines 709-765 (inside `actOutreach`)

```js
// scripts/outreach-os.mjs:709-731 (excerpt; full block runs to line 765)
// ---- ATOMIC CLAIM BEFORE ANY LIVE SEND (the idempotency boundary, mirrors PR #40) -----
const decision = resolveOutreachSendDecision(item.message || {}, { env });
const claimId = outreachClaimId(item.campaign_id, item.contact_id, item.step_number);
const liveSendIntended = decision.liveSend === true && typeof ctx.runOutreachSend === "function";
let claimed = false;
if (liveSendIntended) {
  // An existing claim in ANY state (claimed / sent / failed) blocks the send.
  if (claimsById.has(claimId)) {
    markQueue(next, item.id, "rejected", { reject_reason: `already_claimed:${claimId}` });
    results.push({ contact_id: item.contact_id, status: "skipped", reason: "already_claimed", claim_id: claimId });
    continue;
  }
  if (typeof ctx.claimOutreachSends !== "function") {
    // Fail CLOSED: a live-send-capable invocation without a durable claim path must not
    // send. The item stays approved; a correctly wired tick can send it.
    results.push({ contact_id: item.contact_id, status: "not_sent", reason: "no_claim_path" });
    continue;
  }
  ...
```

Send-time re-checks in the same loop, all fail-closed (`continue` = no send): suppression
(lines 682-687), classification routing (689-694), CAN-SPAM compliance (696-701), caps/window
(703-707).

### a.5 Reactivation engine gate — `scripts/reactivation-os.mjs`, lines 62-99 and 137-165

```js
// scripts/reactivation-os.mjs:65-67 — env flag reader, default OFF
export function reactivationLiveSendEnabled(env = process.env) {
  return ["true", "1", "yes", "on"].includes(String((env || {}).REACTIVATION_LIVE_SEND || "").toLowerCase());
}

// scripts/reactivation-os.mjs:71-73 — master kill switch, overrides everything
export function reactivationSendKillSwitchOn(env = process.env) {
  return ["true", "1", "yes", "on"].includes(String((env || {}).REACTIVATION_SEND_DISABLED || "").toLowerCase());
}

// scripts/reactivation-os.mjs:96-99 — combined send authority
export function reactivationLiveSendAuthority(state = {}, env = process.env) {
  if (reactivationSendKillSwitchOn(env)) return false;
  return reactivationLiveModeEnabled(state) || reactivationLiveSendEnabled(env);
}

// scripts/reactivation-os.mjs:137-165 — the send-time gate
export function resolveReactivationSendDecision(message = {}, { env = process.env, state = null, now = new Date() } = {}) {
  const compliance = validateCompliance(message);
  if (!compliance.ok) return { status: "not_sent", reason: `compliance:${compliance.errors.join(",")}` };
  const base = {
    campaign: REACTIVATION_CAMPAIGN_ID,
    touch: message.touch || message.step_number || 1,
    to: clean(message.to),
    subject: clean(message.subject)
  };
  if (reactivationSendKillSwitchOn(env)) {
    return { status: "dry_run", ...base, liveSend: false, reason: "kill_switch" };
  }
  const authority = state ? reactivationLiveSendAuthority(state, env) : reactivationLiveSendEnabled(env);
  if (!authority || !clean((env || {}).SENDGRID_API_KEY)) {
    return { status: "dry_run", ...base, liveSend: false };
  }
  if (state) {
    const config = reactivationCampaignOf(state);
    if (lower(config.status) !== "active") {
      return { status: "not_sent", ...base, liveSend: false, reason: `campaign_${lower(config.status) || "inactive"}` };
    }
    const thr = evaluateThresholds(state, config, { now });
    if (thr.tripped) return { status: "not_sent", ...base, liveSend: false, reason: "threshold_tripped" };
    if (!withinSendingWindow({ ...config.caps }, etParts(now))) {
      return { status: "not_sent", ...base, liveSend: false, reason: "outside_window" };
    }
  }
  return { status: "live", ...base, liveSend: true };
}
```

The reactivation send loop (reactivation-os.mjs:793-899) uses the same atomic-claim-before-send
pattern as a.4.

### a.6 Production config backstop — `render.yaml` lines 63-68

```yaml
      - key: REACTIVATION_LIVE_SEND
        value: "false"
      - key: OUTREACH_LIVE_SEND
        value: "false"
      - key: ALERT_EMAIL_LIVE_SEND
        value: "false"
```

**Flags/bypasses:** arming requires `OUTREACH_LIVE_SEND` / `REACTIVATION_LIVE_SEND` truthy (or the
owner's in-app reactivation live-mode switch) AND a SendGrid key — but even armed, the per-item
human-approval filter (a.1) and the claims ledger (a.4) still apply to every message.
`REACTIVATION_SEND_DISABLED` is a master kill switch that overrides all arming.

---

## (b) No production change deploys without manual approval

**VERDICT: enforced by config at the deploy platform, plus a blocking read-only preflight gate in
code.** The operative control is Render's `autoDeploy: false` — a git push never promotes to
production; a human must trigger "Manual Deploy" in Render. The in-repo commit gate
(`prod-commit-gate.mjs`) is a genuine blocking code condition (non-zero exit = STOP) but is an
operator preflight used by runbooks, not a hook wired into an automated pipeline — there is no
automated deploy pipeline in this repo to hook.

### b.1 Deploy gating config — `render.yaml` lines 1-9 and 77-83

```yaml
services:
  - type: web
    name: legalease-command-center
    env: node
    plan: starter
    buildCommand: npm ci
    startCommand: npm run start:production
    healthCheckPath: /api/health
    autoDeploy: false        # <-- pushes to main NEVER auto-deploy; manual promote required
...
  - type: cron
    name: legalease-heartbeat
    ...
    autoDeploy: false        # <-- same for the heartbeat cron
```

### b.2 Blocking preflight gate — `scripts/prod-commit-gate.mjs`, `evaluateCommitGate`, lines 28-60 (full file is 114 lines; core pasted)

```js
// scripts/prod-commit-gate.mjs:28-60
export function evaluateCommitGate({ prodCommit = "", requiredCommit = "", approvedCommits = [], isAncestor } = {}) {
  const prod = cleanSha(prodCommit);
  const required = cleanSha(requiredCommit);
  if (!prod || prod === "unknown") {
    return { ok: false, mode: "no_prod_commit", reason: "Production did not report a commit. STOP." };
  }
  if (!required) {
    return { ok: false, mode: "no_required_commit", reason: "No required safety commit was provided. STOP." };
  }
  if (prod === required) {
    return { ok: true, mode: "exact", reason: "Production runs the required safety commit exactly." };
  }
  const approved = (Array.isArray(approvedCommits) ? approvedCommits : []).map(cleanSha).filter(Boolean);
  if (approved.includes(prod)) {
    return { ok: true, mode: "approved", reason: "Production runs an explicitly approved commit." };
  }
  if (typeof isAncestor === "function") {
    let ahead = false;
    try { ahead = isAncestor(required, prod) === true; } catch { ahead = false; }
    if (ahead) {
      return {
        ok: true,
        mode: "ancestor",
        reason: `Production (${prod.slice(0, 7)}) is ahead of the required safety commit (${required.slice(0, 7)}) and contains it as an ancestor — every pinned safety fix is present.`
      };
    }
  }
  return {
    ok: false,
    mode: "unrelated_or_behind",
    reason: `Production commit ${prod.slice(0, 7)} is neither the required safety commit ${required.slice(0, 7)}, an approved commit, nor a descendant of it. STOP.`
  };
}
```

The CLI wrapper (same file, lines 79-109) GETs the public `/api/version`, additionally asserts
`authProtected === true` and `supabaseConnected === true`, and exits non-zero on any failure:

```js
// scripts/prod-commit-gate.mjs:104-108
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  console.log(`${gate.ok ? "PASS" : "FAIL"}: commit gate (${gate.mode}) — ${gate.reason}`);
  console.log(`prod commit: ${version.commit}`);
  const allOk = gate.ok && checks.every(([, ok]) => ok);
  process.exit(allOk ? 0 : 1);
```

**Flags/bypasses:** `--approved <sha>` whitelists a commit at the operator's explicit choice.
Anyone with Render dashboard access can Manual Deploy regardless of the gate — the gate is a
runbook preflight, not a Render deploy hook. Change flow to production is: PR → merge to main →
human Manual Deploy on Render (autoDeploy off) → `verify:production` / gate scripts.

---

## (c) Social media hard-fail gates

**VERDICT: enforced in code as blocking conditions.** Two pure gate functions live in
`scripts/preview-server.mjs` (marked blocks `GUIDELINES_GATE_BLOCK` lines 11073-11268 and
`RENDER_QA_BLOCK` lines 11270-11444). Callers **throw** or return HTTP 400 on failure — a
violating post cannot be approved, cannot be scheduled, and a QA-failed image cannot be marked
ready. The guidelines document (`docs/legalease-social-media-guidelines.md`) is the ruleset
reference only; enforcement is the code below. Tests: `scripts/test-social-guidelines-gate.mjs`.

### c.1 The gate function — `scripts/preview-server.mjs`, `socialGuidelinesGate`, lines 11217-11267

```js
// scripts/preview-server.mjs:11217-11267
function socialGuidelinesGate(post = {}) {
  const hardFails = [];
  const surfaces = guidelinesCopySurfaces(post);
  let uplHits = [];
  let untracedNumbers = [];
  for (const [field, text] of surfaces) {
    if (/—/.test(text)) {
      hardFails.push({ rule: "voice_em_dash", field, detail: `Em-dash in ${field} (guidelines §2: no em-dashes anywhere).` });
    }
    for (const { pattern, label } of GUIDELINES_AI_PHRASE_PATTERNS) {
      if (pattern.test(text)) hardFails.push({ rule: "voice_ai_phrase", field, detail: `AI-sounding construction ${label} in ${field} (guidelines §2).` });
    }
    for (const { pattern, label } of GUIDELINES_OUTCOME_PROMISE_PATTERNS) {
      if (pattern.test(text)) hardFails.push({ rule: "voice_outcome_promise", field, detail: `Outcome promise (${label}) in ${field} (guidelines §2: scope, never escalate).` });
    }
    for (const { pattern, label } of GUIDELINES_DIGNITY_LANGUAGE_PATTERNS) {
      if (pattern.test(text)) hardFails.push({ rule: "dignity_language", field, detail: `Person-first language violation in ${field}: ${label} (guidelines §3).` });
    }
    for (const { pattern, label } of GUIDELINES_BEFORE_AFTER_PATTERNS) {
      if (pattern.test(text)) hardFails.push({ rule: "dignity_framing", field, detail: `${label} in ${field} (guidelines §3).` });
    }
    for (const { pattern, label } of GUIDELINES_BANNED_IMAGERY_PATTERNS) {
      if (pattern.test(text)) hardFails.push({ rule: "dignity_imagery", field, detail: `Banned imagery reference in ${field}: ${label} (guidelines §3).` });
    }
    uplHits = uplHits.concat(
      GUIDELINES_UPL_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => `${label} in ${field}`)
    );
    untracedNumbers = untracedNumbers.concat(guidelinesUntracedNumbers(text).map((token) => `"${token}" in ${field}`));
  }
  if (uplHits.length && !(post.lawrenceSignoffAt || post.lawrenceSignoff === true)) {
    hardFails.push({
      rule: "voice_upl_signoff",
      field: "post",
      detail: `UPL-sensitive content (${[...new Set(uplHits)].join("; ")}) requires Lawrence Blackmon's sign-off before it advances (guidelines §2). Record it as lawrenceSignoffAt on the post.`
    });
  }
  const numbersTraced = Array.isArray(post.verifiedNumberSources) && post.verifiedNumberSources.length > 0;
  if (untracedNumbers.length && !numbersTraced) {
    hardFails.push({
      rule: "voice_untraced_number",
      field: "post",
      detail: `Numbers without a verified source: ${[...new Set(untracedNumbers)].join("; ")} (guidelines §2). Add verifiedNumberSources tracing every number, or remove them.`
    });
  }
  return {
    passed: hardFails.length === 0,
    hardFails,
    ruleSource: "docs/legalease-social-media-guidelines.md §2-§3",
    checkedAt: new Date().toISOString()
  };
}
```

The specific checks the audit asked about:
- **Em-dash check** — line 11223-11224 above: `if (/—/.test(text))` → hard fail `voice_em_dash`.
- **AI-phrase check** — lines 11226-11228, patterns at 11108-11121:

```js
// scripts/preview-server.mjs:11108-11121
const GUIDELINES_AI_PHRASE_PATTERNS = [
  { pattern: /excited to announce/i, label: '"excited to announce"' },
  { pattern: /thrilled to share/i, label: '"thrilled to share"' },
  { pattern: /\bgame.chang/i, label: '"game-changer"' },
  { pattern: /\brevolutioni[sz]/i, label: '"revolutionize"' },
  { pattern: /\bunlock/i, label: '"unlock"' },
  { pattern: /\bempower/i, label: '"empower"' },
  { pattern: /\bdelv(e|es|ed|ing)\b/i, label: '"delve"' },
  { pattern: /\blandscapes?\b/i, label: '"landscape"' },
  // "journey" is banned as metaphor. A mechanical check cannot read intent, so every use
  // fails; a literal use gets rewritten or Roger overrides by editing the copy.
  { pattern: /\bjourneys?\b/i, label: '"journey" (banned as metaphor)' },
  { pattern: /we('| a)re just getting started/i, label: '"we\'re just getting started"' }
];
```

- **Dignity check** — lines 11232-11240, patterns at 11145-11172:

```js
// scripts/preview-server.mjs:11145-11153
const GUIDELINES_DIGNITY_LANGUAGE_PATTERNS = [
  { pattern: /\bex[- ]?cons?\b/i, label: '"ex-con" — use "people with records"' },
  { pattern: /\bex[- ]?offenders?\b/i, label: '"ex-offender" — use "people with records"' },
  { pattern: /\bfelons?\b/i, label: '"felon" — use "someone with a felony record"' },
  { pattern: /\boffenders?\b/i, label: '"offender" — use person-first language' },
  { pattern: /\bconvicts\b|\ba convict\b/i, label: '"convict" (as a noun) — use person-first language' },
  { pattern: /\bcriminals\b/i, label: '"criminals" — use person-first language' },
  { pattern: /\ba criminal\b(?! (records?|history|background|charges?|case|conviction|justice|law|defense))/i, label: '"a criminal" as a label for a person' }
];
```

(plus before/after framing patterns 11155-11158 and banned-imagery patterns 11161-11172).

### c.2 Asset-integrity check — `scripts/preview-server.mjs`, `renderQaForGeneratedImage`, lines 11341-11443 (asset-integrity core pasted)

```js
// scripts/preview-server.mjs:11391-11436 (asset integrity portion of renderQaForGeneratedImage)
  const promptText = String(promptUsed || "").toLowerCase();
  const isGeneratedMode = /^openai_(image|background)/.test(String(generationMode || ""));
  if (isGeneratedMode) {
    if (!/text-free|no readable text|zero readable text/.test(promptText)) {
      hardFails.push({ rule: "asset_integrity", detail: "Generation prompt is missing the text-free lock." });
    }
    if (!/no logos|no .*logos|zero .*logos|do not render.*logo|no wordmarks/.test(promptText)) {
      hardFails.push({ rule: "asset_integrity", detail: "Generation prompt is missing the no-logo/no-wordmark lock." });
    }
    if (context.usesWilma && !/do not draw wilma/.test(promptText)) {
      hardFails.push({ rule: "asset_integrity", detail: "Wilma post generated without the do-not-draw-Wilma prompt lock." });
    }
    for (const finding of guidelinesImagePromptFindings(promptUsed)) {
      hardFails.push(finding);
    }
    if (!/deep navy|legalease palette|brand palette/.test(promptText)) {
      hardFails.push({ rule: "palette", detail: "Generation prompt is missing the brand-palette lock (restrained LegalEase palette). Colors cannot be trusted to stay in palette." });
    }
  }
  const brandMarksSent = (referenceAssetsSent || []).filter((asset) => isBrandMarkReferenceAsset(asset));
  if (brandMarksSent.length) {
    hardFails.push({
      rule: "asset_integrity",
      detail: `Brand-mark assets were sent to the image model as generation references: ${brandMarksSent.map((asset) => asset.name || asset.assetType).join(", ")}`
    });
  }
  if (context.usesWilma && openAIResult.imageUrl && isGeneratedMode && !openAIResult.compositedWilma) {
    hardFails.push({
      rule: "asset_integrity",
      detail: "Wilma post rendered without compositing the canonical Wilma asset. Guidelines: if the real asset cannot be composited, the image does not ship."
    });
  }
  if (String(context.visualBucket || "") === "Quote card" && openAIResult.imageUrl && isGeneratedMode) {
    hardFails.push({
      rule: "asset_integrity",
      detail: "Quote cards must be typographic composites (typography + palette + real logo), never AI-generated images."
    });
  }
  if (String(generationMode || "").startsWith("typographic_quote_card") && quoteCard && !quoteCard.logoIncluded) {
    hardFails.push({ rule: "asset_integrity", detail: "Quote card rendered without the real logo asset file." });
  }
  return {
    passed: hardFails.length === 0,
    hardFails,
    ruleSource: "docs/legalease-social-media-guidelines.md §6",
    checkedAt: new Date().toISOString()
  };
```

It also enforces overlay-verbatim match to approved copy (11365-11379) and thumbnail legibility
limits (11380-11389).

### c.3 Blocking call sites (proof the gates block, not just report)

**Approve (Review Desk single approval) — preview-server.mjs:2866-2875, throws:**

```js
if (approval.type === "post") {
  const currentPost = (state.posts || []).find((post) => post.id === approval.sourceId) || {};
  if (action === "approve") {
    // Guidelines hard-fail gate (§2 voice, §3 dignity): a violating post can be edited
    // or culled, but it can never be approved.
    const guidelinesGate = socialGuidelinesGate(currentPost);
    if (!guidelinesGate.passed) {
      throw new Error(`Guidelines hard fail - cannot approve "${currentPost.title || approval.sourceId}": ${guidelinesGate.hardFails.map((item) => item.detail).join(" | ")}`);
    }
  }
```

**Schedule (last transition before publish) — preview-server.mjs:5377-5382, throws:**

```js
// Guidelines hard-fail gate (§2 voice, §3 dignity): scheduling is the last transition
// before publishing, so a violating post can never reach the publisher.
const guidelinesGate = socialGuidelinesGate(candidate);
if (!guidelinesGate.passed) {
  throw new Error(`Guidelines hard fail - cannot schedule: ${guidelinesGate.hardFails.map((item) => item.detail).join(" | ")}`);
}
```

**Direct approve via /api/posts/update — preview-server.mjs:41425-41440, HTTP 400:**

```js
const guidelinesGate = socialGuidelinesGate({ ...post, ...patch });
if (!guidelinesGate.passed) {
  sendJson(response, {
    error: `Guidelines hard fail - cannot approve: ${guidelinesGate.hardFails.map((item) => item.detail).join(" | ")}`,
    guidelinesHardFails: guidelinesGate.hardFails
  }, 400);
  return;
}
// Guidelines §6 at approve time: a post whose LATEST render failed QA (or failed to
// render) cannot be approved past the failure — fix and re-render first.
const latestImage = imageForPostFromState(currentState, id);
if (latestImage && (latestImage.generationStatus === "qa_failed" || latestImage.generationStatus === "failed" || latestImage.renderQa?.passed === false)) {
  sendJson(response, { error: "The latest image failed its quality check. Fix or regenerate the image before approving." }, 400);
  return;
}
```

**Image "ready" promotion blocked on QA failure — preview-server.mjs:41452-41459, HTTP 400:**

```js
if (patch?.imageStatus === "ready") {
  // Guidelines §6: render QA is enforced before "image ready". A QA-failed render can
  // never be promoted to ready; it has to be fixed and re-rendered.
  const currentState = await store.readState();
  const latestImage = imageForPostFromState(currentState, id);
  if (latestImage && (latestImage.generationStatus === "qa_failed" || latestImage.renderQa?.passed === false)) {
    sendJson(response, { error: "Render QA failed for the latest image. Fix the QA failures and re-render before marking the image ready." }, 400);
    return;
```

Render QA is also computed in the generation pipeline itself (preview-server.mjs:12096-12107 —
a failing render is stamped `qa_failed` with `generationError`), and batch approval
(2918-2988) excludes guidelines-blocked items from the approved set.

**Flags/bypasses:** no env flag disables either gate. Two data-level clearances exist by design:
UPL hard fails clear when a human records `post.lawrenceSignoffAt` (attorney sign-off), and
untraced-number hard fails clear when `post.verifiedNumberSources` names a source for every
number. The "journey" pattern deliberately fails all uses; the documented override is editing
the copy.

### c.4 Cross-cutting: live social publishing is separately env-gated

```js
// scripts/preview-server.mjs:694-704
const livePostingEnvKeys = {
  linkedin: ["LINKEDIN_LIVE_POSTING_ENABLED", "ENABLE_LIVE_LINKEDIN_POSTING"],
  x: ["ENABLE_LIVE_X_POSTING", "ENABLE_LIVE_TWITTER_POSTING"],
  facebook: ["ENABLE_LIVE_FACEBOOK_POSTING"],
  instagram: ["ENABLE_LIVE_INSTAGRAM_POSTING"],
  threads: ["ENABLE_LIVE_THREADS_POSTING"]
};

function livePostingEnabledForChannel(channel) {
  return (livePostingEnvKeys[channel] || []).some((key) => process.env[key] === "true");
}
```

The scheduled publisher blocks on this flag (preview-server.mjs:5625-5634: status `blocked`,
`errorCode: "live_gate_disabled"`, no publish). All `ENABLE_LIVE_*_POSTING` flags are `"false"`
in render.yaml (lines 51-62).

**Auditor's note (gap observed, not fixed):** the manual "Publish Now" path
(`publishPostNow`, preview-server.mjs:5801-5910) calls `publishReadiness()` with
`requireLiveGate:false` and does not re-check `livePostingEnabledForChannel` before
`publishToChannel()`. So the env live-posting flag is a blocking condition on the scheduled
publish path but is not re-enforced on the manual one-click path (that path still requires post
approval status and a connected channel OAuth). Flagged for reviewer attention.

---

## Summary table

| Rule | Enforced as blocking code? | Core enforcement | Bypass surface |
|---|---|---|---|
| (a) No unapproved sends | YES — code, three layers, fail-closed | outreach-os.mjs:656, 434-451, 709-765; reactivation-os.mjs:137-165; preview-server.mjs:5439/5477 | env flags arm sending but never skip per-item approval; kill switch overrides all |
| (b) No unapproved deploys | YES — platform config (`autoDeploy: false`) + blocking preflight script | render.yaml:9,83; prod-commit-gate.mjs:28-60 (exit 1 = STOP) | Render dashboard access; `--approved` whitelist; gate is a runbook step, not a deploy hook |
| (c) Social hard-fail gates | YES — code; approve/schedule throw, HTTP 400 on direct paths | preview-server.mjs:11217-11267 (gate), 11341-11443 (render QA), call sites 2871, 5379, 41425, 41453 | no disable flag; UPL/number fails clear only via recorded human sign-off/source; manual Publish Now skips the live-posting env flag re-check (noted above) |
