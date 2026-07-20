import { expect, test } from "@playwright/test";

import { createSocialAcceptanceFixture } from "../../scripts/social-acceptance-fixture.mjs";

const fixtureHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CCX-310 Social acceptance</title>
<style>body{font:16px/1.45 system-ui;margin:0;color:#172044;background:#f5f7fb}main{max-width:920px;margin:auto;padding:32px}section{background:white;border:1px solid #cbd4e6;border-radius:12px;padding:20px;margin:16px 0}label{display:block;font-weight:700;margin:8px 0}input,select,textarea,button{font:inherit}input,select,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #66728b;border-radius:6px}button{margin:6px;padding:10px 14px;border:2px solid #20277f;border-radius:7px;background:#fff;color:#20277f;font-weight:800}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #ed672f;outline-offset:2px}output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}</style></head>
<body><main><h1>Social acceptance fixture</h1><p>Test-only, synthetic, and provider-free by default.</p>
<section aria-labelledby="idea-title"><h2 id="idea-title">Idea and template</h2><label>Idea title<input id="idea" value="A clearer path through confusing rules"></label><button data-action="add-idea">Add idea</button><button data-action="turn-post">Turn idea into Post</button><label>Template<select id="template"><option value="template-wilma-faq">Wilma FAQ</option></select></label><button data-action="create-template">Create Post from template</button></section>
<section aria-labelledby="creative-title"><h2 id="creative-title">Creative and review</h2><button data-action="select-assets">Select exact Wilma and brand asset</button><button data-action="fail-guideline">Trigger guideline failure</button><button data-action="resolve-guideline">Resolve guideline failure</button><button data-action="render-missing">Try missing asset</button><button data-action="render-exact">Render exact selected assets</button></section>
<section aria-labelledby="channels-title"><h2 id="channels-title">Channels and schedule</h2><label>LinkedIn copy<textarea id="linkedin">LinkedIn-specific safe copy.</textarea></label><label>Instagram copy<textarea id="instagram">Instagram-specific safe copy.</textarea></label><button data-action="variants">Add LinkedIn and Instagram variants</button><label>Schedule<input id="schedule" value="2026-07-21T14:00:00.000Z"></label><button data-action="schedule">Schedule Post</button><label>Move to<input id="move" value="2026-07-22T15:30:00.000Z"></label><button data-action="move">Move on calendar</button></section>
<section aria-labelledby="publish-title"><h2 id="publish-title">Publishing safety</h2><button data-action="manual">Publish manually without credentials</button><button data-action="live">Run gated injected publish</button><button data-action="live">Repeat gated injected publish</button></section>
<section aria-labelledby="result-title"><h2 id="result-title">Fixture result</h2><output id="result" aria-live="polite" data-last-action="ready">Ready</output></section>
</main><script>
const output=document.querySelector('#result');
async function run(action){
  const payload=action==='add-idea'?{title:document.querySelector('#idea').value}:
    action==='create-template'?{templateId:document.querySelector('#template').value}:
    action==='variants'?{linkedin:document.querySelector('#linkedin').value,instagram:document.querySelector('#instagram').value}:
    action==='schedule'?{scheduledFor:document.querySelector('#schedule').value,timezone:'America/New_York'}:
    action==='move'?{scheduledFor:document.querySelector('#move').value}:{};
  const state=await window.ccx310Action(action,payload); output.dataset.lastAction=state.lastAction; output.textContent=JSON.stringify(state,null,2);
}
document.addEventListener('click',(event)=>{const button=event.target.closest('[data-action]');if(button)run(button.dataset.action);});
</script></body></html>`;

test("CCX-310 completes the ten Social workflows without provider access or duplicate publication", async ({ page }) => {
  const injectedCalls = [];
  const fixture = createSocialAcceptanceFixture({
    publishAdapter:async ({ post, channel, idempotencyKey }) => {
      injectedCalls.push({ postId:post.id, channel, idempotencyKey });
      return { externalId:`browser-${channel}-${post.id}` };
    }
  });
  const networkRequests = [];
  page.on("request", (request) => { if (/^https?:/.test(request.url())) networkRequests.push(request.url()); });
  await page.exposeFunction("ccx310Action", async (action, payload) => {
    if (action === "add-idea") return fixture.addIdea(payload.title);
    if (action === "turn-post") return fixture.turnIdeaIntoPost();
    if (action === "create-template") return fixture.createFromTemplate(payload.templateId);
    if (action === "select-assets") return fixture.selectAssets({ wilmaId:"wilma-pose-01", brandId:"logo-primary" });
    if (action === "fail-guideline") return fixture.triggerGuidelineFailure();
    if (action === "resolve-guideline") return fixture.resolveGuidelineFailure();
    if (action === "render-missing") return fixture.renderImage(["missing-approved-asset"]);
    if (action === "render-exact") return fixture.renderImage(["wilma-pose-01", "logo-primary"]);
    if (action === "variants") return fixture.addChannelVariants(payload);
    if (action === "schedule") return fixture.schedulePost(payload);
    if (action === "move") return fixture.moveOnCalendar(payload.scheduledFor);
    if (action === "manual") return fixture.publishManuallyWithoutCredentials();
    if (action === "live") return fixture.publishWithInjectedAdapter("ccx310-browser-publish-01");
    throw new Error(`Unknown CCX-310 action: ${action}`);
  });
  await page.setViewportSize({ width:1280, height:900 });
  await page.setContent(fixtureHtml);
  const result = page.locator("#result");
  const click = async (name, action) => {
    await page.getByRole("button", { name, exact:true }).click();
    await expect(result).toHaveAttribute("data-last-action", action);
    return JSON.parse(await result.textContent());
  };

  let state = await click("Add idea", "idea_added");
  const ideaId = state.activePostId;
  expect(state.post.status).toBe("idea");
  state = await click("Turn idea into Post", "idea_turned_into_post");
  expect(state.activePostId).toBe(ideaId);
  expect(state.post.status).toBe("draft");

  state = await click("Create Post from template", "post_created_from_template");
  expect(state.post.selectedTemplateId).toBe("template-wilma-faq");
  state = await click("Select exact Wilma and brand asset", "assets_selected");
  expect(state.post.wilmaPoseReferenceId).toBe("wilma-pose-01");
  expect(state.post.brandAssetIds).toEqual(["logo-primary"]);

  state = await click("Trigger guideline failure", "guideline_failure_triggered");
  expect(state.post.guidelinesGate.passed).toBe(false);
  expect(state.readiness.blocking.length).toBeGreaterThan(0);
  state = await click("Resolve guideline failure", "guideline_failure_resolved");
  expect(state.post.guidelinesGate.passed).toBe(true);

  state = await click("Try missing asset", "render_blocked");
  expect(state.render).toEqual({ ok:false, missing:["missing-approved-asset"], substituted:false });
  state = await click("Render exact selected assets", "image_rendered");
  expect(state.render).toEqual({ ok:true, exactAssetIds:["wilma-pose-01", "logo-primary"], substituted:false });

  state = await click("Add LinkedIn and Instagram variants", "channel_variants_added");
  expect(state.variants.map((item) => item.channel)).toEqual(["linkedin", "instagram"]);
  expect(state.variants.map((item) => item.body)).toEqual(["LinkedIn-specific safe copy.", "Instagram-specific safe copy."]);
  state = await click("Schedule Post", "post_scheduled");
  expect(state.post.status).toBe("scheduled");
  state = await click("Move on calendar", "post_moved_on_calendar");
  expect(state.post.scheduledFor).toBe("2026-07-22T15:30:00.000Z");
  expect(state.auditEvents).toHaveLength(1);

  state = await click("Publish manually without credentials", "manual_package_created");
  expect(state.post.status).toBe("scheduled");
  expect(state.metrics.providerCalls).toBe(0);
  state = await click("Run gated injected publish", "gated_publish_checked");
  expect(state.publishResults.every((item) => item.reused === false)).toBe(true);
  state = await click("Repeat gated injected publish", "gated_publish_checked");
  expect(state.publishResults.every((item) => item.reused === true)).toBe(true);
  expect(injectedCalls).toHaveLength(2);
  expect(state.metrics.providerCalls).toBe(2);
  expect(state.claims).toHaveLength(2);
  expect(state.metrics.externalNetworkCalls).toBe(0);
  expect(networkRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
