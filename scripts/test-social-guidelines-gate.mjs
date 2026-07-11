#!/usr/bin/env node
// Guard for the social media guidelines hard-fail gate
// (docs/legalease-social-media-guidelines.md §2 voice, §3 dignity, §6 imagery).
// Loads the pure GUIDELINES_GATE block from preview-server.mjs in a vm sandbox and
// exercises every rule class, then asserts the gate is wired into the transitions
// that let a post advance (approve, batch approve, direct approve, schedule, render).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

function markedBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert(start >= 0, `${startMarker} should exist`);
  assert(end > start, `${endMarker} should exist after ${startMarker}`);
  return source.slice(start, end);
}

const gateBlock = markedBlock("// GUIDELINES_GATE_BLOCK_START", "// GUIDELINES_GATE_BLOCK_END");
const context = {};
vm.createContext(context);
vm.runInContext(gateBlock, context);
const { socialGuidelinesGate, guidelinesImagePromptFindings } = context;
assert.equal(typeof socialGuidelinesGate, "function", "socialGuidelinesGate should load");
assert.equal(typeof guidelinesImagePromptFindings, "function", "guidelinesImagePromptFindings should load");

function rules(post) {
  return socialGuidelinesGate(post).hardFails.map((item) => item.rule);
}

// A clean post passes.
const cleanPost = {
  title: "How record clearing works in Illinois",
  hook: "Most people do not need a lecture. They need a next step.",
  body: "Illinois lets many people petition after their sentence is complete. Rules vary by state and case. This is general information, not legal advice. Check your eligibility.",
  cta: "Check your eligibility",
  hashtags: ["#LegalEase"]
};
assert.equal(socialGuidelinesGate(cleanPost).passed, true, "clean post should pass");

// §2 voice: em-dash anywhere is a hard fail, including overlay text.
assert(rules({ ...cleanPost, body: "Old records can be confusing—especially during a job search." }).includes("voice_em_dash"));
assert(rules({ ...cleanPost, wilmaImageWorkflow: { overlayText: "Clarity—finally" } }).includes("voice_em_dash"));

// §2 voice: AI-sounding constructions.
assert(rules({ ...cleanPost, body: "Excited to announce our new product." }).includes("voice_ai_phrase"));
assert(rules({ ...cleanPost, hook: "This is a game-changer for reentry." }).includes("voice_ai_phrase"));
assert(rules({ ...cleanPost, body: "We unlock potential and empower communities." }).includes("voice_ai_phrase"));
assert(rules({ ...cleanPost, body: "Join us on this journey." }).includes("voice_ai_phrase"));

// §2 voice: outcome promises, with negated guarantee language allowed.
assert(rules({ ...cleanPost, body: "Guaranteed expungement for everyone." }).includes("voice_outcome_promise"));
assert(rules({ ...cleanPost, body: "We will clear your record fast." }).includes("voice_outcome_promise"));
assert(rules({ ...cleanPost, body: "You qualify for sealing." }).includes("voice_outcome_promise"));
assert.equal(
  rules({ ...cleanPost, body: "There are no guarantees. A court makes the final decision." }).includes("voice_outcome_promise"),
  false,
  "negated guarantee language is a disclaimer, not a promise"
);
assert.equal(
  rules({ ...cleanPost, body: "It can’t guarantee what an employer will decide." }).includes("voice_outcome_promise"),
  false,
  "curly-apostrophe negations (can’t guarantee) are disclaimers too"
);

// §2 voice: untraced numbers hard-fail; $50, plain years, and traced numbers pass.
assert(rules({ ...cleanPost, body: "We generated 4,200 packets across 12 states." }).includes("voice_untraced_number"));
assert.equal(rules({ ...cleanPost, body: "Expungement.ai costs $50 flat. Launched in 2026." }).includes("voice_untraced_number"), false);
assert.equal(
  rules({
    ...cleanPost,
    body: "We generated 4,200 packets across 12 states.",
    verifiedNumberSources: ["Command Center scoreboard packets metric 2026-07-10"]
  }).includes("voice_untraced_number"),
  false,
  "numbers with verifiedNumberSources pass"
);

// §2 voice: UPL-sensitive content requires Lawrence's sign-off.
assert(rules({ ...cleanPost, body: "Under 20 ILCS 2630/5.2 you should file a petition.", verifiedNumberSources: ["statute citation"] }).includes("voice_upl_signoff"));
assert.equal(
  rules({ ...cleanPost, body: "The statute of limitations varies.", lawrenceSignoffAt: "2026-07-10T00:00:00Z" }).includes("voice_upl_signoff"),
  false,
  "Lawrence sign-off clears the UPL hard fail"
);

// §3 dignity: person-first language.
assert(rules({ ...cleanPost, body: "We help felons find work." }).includes("dignity_language"));
assert(rules({ ...cleanPost, body: "Ex-cons deserve a second chance." }).includes("dignity_language"));
assert(rules({ ...cleanPost, hook: "Offenders can rebuild." }).includes("dignity_language"));
assert.equal(rules({ ...cleanPost, body: "A criminal record should not define anyone." }).includes("dignity_language"), false, "criminal record/history is legitimate usage");

// §3 dignity: before/after framing and banned imagery references in copy.
assert(rules({ ...cleanPost, body: "See the before and after of our customer's life." }).includes("dignity_framing"));
assert(rules({ ...cleanPost, body: "From handcuffs to a paycheck." }).includes("dignity_imagery"));

// §3/§6 image prompts: positively-requested banned imagery fails; negated safety language passes.
assert(guidelinesImagePromptFindings("A dramatic mugshot on a courtroom wall, gavel in the foreground").length >= 2);
assert.equal(
  guidelinesImagePromptFindings("Avoid: no gavels, no jail bars, no handcuffs, no mugshots.\nDo not imply a criminal record.").length,
  0,
  "negated safety language in prompts is not a violation"
);

// Wiring: the gate is enforced at every transition that lets a post advance.
for (const [wiring, description] of [
  ["const guidelinesGate = socialGuidelinesGate(currentPost);", "single approval gate"],
  ["guidelinesBlocked.push(", "batch approval gate"],
  ["const guidelinesGate = socialGuidelinesGate({ ...post, ...patch });", "direct /api/posts/update approve gate"],
  ["Guidelines hard fail - cannot schedule:", "schedule gate"],
  ["guidelinesImagePromptFindings(promptUsed)", "image prompt pre-generation gate"],
  ["draft.guidelinesGate = socialGuidelinesGate(draft);", "draft factory stamp"],
  ["next.guidelinesGate = socialGuidelinesGate(next);", "AI draft re-stamp"],
  ['rule: "legibility"', "render QA item 4: thumbnail legibility proxy"],
  ['rule: "palette"', "render QA item 5: brand-palette prompt lock"],
  ['rule: "overlay_verbatim"', "render QA item 1: character-for-character overlay verification"]
]) {
  assert(source.includes(wiring), `${description} should be wired (${wiring})`);
}

// The guidelines document itself is the adopted ruleset and must exist at the cited path.
const guidelines = readFileSync(join(process.cwd(), "docs", "legalease-social-media-guidelines.md"), "utf8");
for (const required of ["HARD FAIL", "No em-dashes", "person-first", "character for character"]) {
  assert(guidelines.toLowerCase().includes(required.toLowerCase()), `guidelines doc should contain "${required}"`);
}

console.log("  ✓ clean post passes; every §2/§3 rule class hard-fails");
console.log("  ✓ negated guarantees and criminal-record usage do not false-positive");
console.log("  ✓ image prompt scan flags positive requests, ignores negated safety language");
console.log("  ✓ gate wired at approve, batch approve, direct update, schedule, render, and draft factories");
console.log("\ntest-social-guidelines-gate: all checks passed");
