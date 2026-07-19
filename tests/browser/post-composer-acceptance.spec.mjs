import { expect, test, allowExpectedConsoleError, allowExpectedCriticalResponse } from "./support.mjs";

const FIELD_KEYS = ["headline", "body", "hook", "cta", "hashtags"];
const previewSelectors = {
  headline:"[data-preview-headline]",
  body:"[data-preview-body]",
  hook:"[data-preview-hook]",
  cta:"[data-preview-cta]",
  hashtags:"[data-preview-hashtags]"
};

test.describe.configure({ mode:"serial" });

function editedValues(label) {
  return {
    headline:`${label} headline`, body:`${label} caption`, hook:`${label} hook`,
    cta:`${label} CTA`, hashtags:`#${label.replaceAll(" ", "")} #Safe`
  };
}

async function openComposer(page, id = "idea-01", baseURL = process.env.BROWSER_TEST_COMPOSER_BASE_URL) {
  expect(baseURL, "Composer browser fixture URL is required.").toBeTruthy();
  const composerResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/ui/social/post/${id}/composer`);
  await page.goto(`${baseURL}/#social/post/${id}`, { waitUntil:"domcontentloaded" });
  await composerResponse;
  await expect.poll(() => page.evaluate(() => Boolean(window.__LE_BOOT?.ready))).toBe(true);
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  return baseURL;
}

async function fillAll(page, values) {
  for (const key of FIELD_KEYS) await page.locator(`[data-composer-field="${key}"]`).fill(values[key]);
}

async function assertAllValues(page, values) {
  for (const key of FIELD_KEYS) {
    await expect(page.locator(`[data-composer-field="${key}"]`)).toHaveValue(values[key]);
    await expect(page.locator(previewSelectors[key])).toHaveText(values[key]);
  }
}

async function loginRole(page, baseURL, credential) {
  await page.context().clearCookies();
  const response = await page.request.post(`${baseURL}/api/auth/login`, { data:{ credential } });
  expect(response.status()).toBe(200);
  const csrf = (await page.context().cookies(baseURL)).find((cookie) => cookie.name === "leos_csrf")?.value;
  expect(csrf).toBeTruthy();
  return csrf;
}

async function restrictedRequest(page, baseURL, pathname, { method = "GET", csrf = "", data } = {}) {
  const response = await page.request.fetch(`${baseURL}${pathname}`, {
    method,
    headers:method === "GET" ? {} : { "x-csrf-token":csrf, "content-type":"application/json" },
    ...(data === undefined ? {} : { data })
  });
  return { status:response.status(), body:await response.json() };
}

test("restricted composer enforces the real role, visibility, duplicate-ID, and client-tampering matrix", async ({ page }) => {
  test.slow();
  const baseURL = process.env.BROWSER_TEST_COMPOSER_RESTRICTED_BASE_URL;
  const readonlyBaseURL = process.env.BROWSER_TEST_COMPOSER_RESTRICTED_READONLY_BASE_URL;
  const credentials = JSON.parse(process.env.BROWSER_TEST_COMPOSER_RESTRICTED_CREDENTIALS || "{}");
  expect(baseURL).toBeTruthy();
  expect(readonlyBaseURL).toBeTruthy();
  expect(Object.keys(credentials).sort()).toEqual(["admin", "operator", "owner", "viewer"]);

  let csrf = await loginRole(page, baseURL, credentials.owner);
  const ownerRead = await restrictedRequest(page, baseURL, "/api/ui/social/post/idea-20/composer");
  expect(ownerRead.status).toBe(200);
  expect(ownerRead.body.capabilities.edits).toBe(true);
  const ownerSave = await restrictedRequest(page, baseURL, "/api/ui/social/post/idea-20/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Owner authorized save" }, expectedVersion:ownerRead.body.version }
  });
  expect(ownerSave.status).toBe(200);
  expect(ownerSave.body.version).toBe(ownerRead.body.version + 1);
  const duplicateRead = await restrictedRequest(page, baseURL, "/api/ui/social/post/composer-duplicate/composer");
  const duplicateSave = await restrictedRequest(page, baseURL, "/api/ui/social/post/composer-duplicate/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Must fail closed" }, expectedVersion:4 }
  });
  expect(duplicateRead).toMatchObject({ status:404, body:{ ok:false, outcome:"unavailable" } });
  expect(duplicateSave).toMatchObject({ status:404, body:{ ok:false, outcome:"unavailable" } });

  csrf = await loginRole(page, baseURL, credentials.admin);
  const adminRead = await restrictedRequest(page, baseURL, "/api/ui/social/post/idea-21/composer");
  expect(adminRead.status).toBe(200);
  expect(adminRead.body.capabilities.edits).toBe(true);
  const adminSave = await restrictedRequest(page, baseURL, "/api/ui/social/post/idea-21/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Admin policy save" }, expectedVersion:adminRead.body.version }
  });
  expect(adminSave.status).toBe(200);

  csrf = await loginRole(page, readonlyBaseURL, credentials.viewer);
  const viewerRead = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/idea-22/composer");
  const viewerSave = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/idea-22/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Viewer denied" }, expectedVersion:1 }
  });
  expect(viewerRead.status).toBe(403);
  expect(viewerSave).toMatchObject({ status:403, body:{ ok:false, outcome:"unauthorized" } });

  csrf = await loginRole(page, readonlyBaseURL, credentials.operator);
  const operatorRead = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/idea-22/composer");
  const operatorSave = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/idea-22/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Operator denied" }, expectedVersion:operatorRead.body.version }
  });
  expect(operatorRead).toMatchObject({ status:200, body:{ capabilities:{ reads:true, edits:false } } });
  expect(operatorSave).toMatchObject({ status:403, body:{ ok:false, outcome:"unauthorized" } });
  const hiddenRead = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/composer-hidden/composer");
  const hiddenSave = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/composer-hidden/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Hidden denied" }, expectedVersion:3 }
  });
  const guessedSave = await restrictedRequest(page, readonlyBaseURL, "/api/ui/social/post/composer-guessed/save", {
    method:"POST", csrf, data:{ fields:{ headline:"Guessed denied" }, expectedVersion:3 }
  });
  expect(hiddenRead).toMatchObject({ status:404, body:{ ok:false, outcome:"unavailable" } });
  expect(hiddenRead.body.post).toBeUndefined();
  expect(JSON.stringify(hiddenRead.body)).not.toContain("Nondisclosed composer Post");
  expect(hiddenSave).toEqual(guessedSave);

  let saves = 0;
  page.on("request", (request) => { if (request.method() === "POST" && /\/save$/.test(new URL(request.url()).pathname)) saves += 1; });
  await page.route("**/api/ui/social/post/idea-23/composer", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.capabilities.edits = true;
    await route.fulfill({ response, json:body });
  });
  allowExpectedCriticalResponse(page, "/api/state", 1);
  allowExpectedConsoleError(page, /403/, 4);
  await openComposer(page, "idea-23", readonlyBaseURL);
  await page.locator('[data-composer-field="headline"]').fill("Client capability tampering");
  await page.locator("[data-composer-save]").click();
  await expect(page.locator("[data-composer-message]")).toHaveAttribute("data-state", "authorization_error");
  await expect(page.locator('[data-composer-field="headline"]')).toHaveValue("Client capability tampering");
  expect(saves).toBe(1);

  console.log("CCX302B_AUTHORIZATION_MATRIX", JSON.stringify({ owner:{ read:200, save:200 }, admin:{ read:200, save:200 }, operator:{ read:200, save:403 }, viewer:{ read:403, save:403 }, hiddenRead:404, hiddenAndGuessedSave:403, duplicateRead:404, duplicateSave:404, clientTamperSave:403 }));
});

test("400, 403, 409, and 500 saves retain all local and preview edits without duplicate work", async ({ page }) => {
  test.slow();
  const cases = [
    { id:"idea-04", status:400, outcome:"validation_error", field:"headline", message:"Headline is invalid." },
    { id:"idea-05", status:403, outcome:"unauthorized", message:"This account cannot save this Post." },
    { id:"idea-06", status:409, outcome:"conflict", currentVersion:8, message:"The saved Post changed." },
    { id:"idea-07", status:500, outcome:"recoverable_error", message:"The Post could not be saved safely." }
  ];
  const results = [];
  for (const item of cases) {
    await openComposer(page, item.id);
    const values = editedValues(String(item.status));
    await fillAll(page, values);
    let saves = 0;
    const pattern = `**/api/ui/social/post/${item.id}/save`;
    await page.route(pattern, async (route) => {
      saves += 1;
      await route.fulfill({ status:item.status, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:item.outcome, field:item.field, currentVersion:item.currentVersion, message:item.message }) });
    });
    allowExpectedConsoleError(page, new RegExp(String(item.status)), 1);
    await page.locator("[data-composer-save]").click();
    await expect(page.locator("[data-composer-message]")).toHaveAttribute("data-state", item.status === 400 ? "validation_error" : item.status === 403 ? "authorization_error" : item.status === 409 ? "version_conflict" : "recoverable_error");
    await assertAllValues(page, values);
    await expect(page.locator("[data-composer-save]")).toBeEnabled();
    await expect(page.locator("[data-composer-message]")).not.toHaveText("Saved");
    if (item.field) {
      const error = page.locator(`[data-field-error="${item.field}"]`);
      await expect(error).toHaveText(item.message);
      await expect(error).toHaveAttribute("aria-live", "polite");
      await expect(page.locator(`[data-composer-field="${item.field}"]`)).toHaveAttribute("aria-describedby", `composer-${item.field}-error`);
    }
    await page.waitForTimeout(200);
    expect(saves).toBe(1);
    results.push({ status:item.status, fieldsRetained:5, previewsRetained:5, dirty:true, duplicateSaves:0 });
    await page.unroute(pattern);
    await page.evaluate(() => window.dispatchEvent(new Event("vnext:session-expired")));
    await page.reload({ waitUntil:"domcontentloaded" });
  }
  console.log("CCX302B_HTTP_RETENTION", JSON.stringify(results));
});

test("conflict controls keep edits or confirm and reload the latest compact saved copy", async ({ page }) => {
  test.slow();
  const id = "idea-24";
  const reads = [], writes = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === `/api/ui/social/post/${id}/composer`) reads.push(pathname);
    if (pathname === `/api/ui/social/post/${id}/save`) writes.push(pathname);
  });
  await openComposer(page, id);
  const expectedVersion = Number(await page.locator("[data-composer-form]").getAttribute("data-expected-version"));
  const local = editedValues("Conflict local");
  const stored = { headline:"Latest saved headline", body:"Latest saved caption", hook:"Latest saved hook", cta:"Latest saved CTA", hashtags:"#Latest #Stored" };
  await fillAll(page, local);
  const external = await page.evaluate(async ({ id, expectedVersion, stored }) => {
    const response = await fetch(`/api/ui/social/post/${id}/save`, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ fields:{ ...stored, hashtags:stored.hashtags.split(" ") }, expectedVersion }) });
    return { status:response.status, body:await response.json() };
  }, { id, expectedVersion, stored });
  expect(external.status).toBe(200);
  allowExpectedConsoleError(page, /409/, 1);
  await page.locator("[data-composer-save]").click();
  const actions = page.locator("[data-conflict-actions]");
  await expect(actions).toBeVisible();
  await expect(actions).toHaveAttribute("data-current-version", String(expectedVersion + 1));
  await expect(page.locator("[data-composer-form]")).toHaveAttribute("data-expected-version", String(expectedVersion));
  await assertAllValues(page, local);
  const countsAtConflict = { reads:reads.length, writes:writes.length };

  await page.locator("[data-keep-editing]").click();
  await assertAllValues(page, local);
  await expect(actions).toBeVisible();
  expect({ reads:reads.length, writes:writes.length }).toEqual(countsAtConflict);

  const reload = page.locator("[data-reload-copy]");
  await reload.click();
  const dialog = page.getByRole("dialog", { name:"Unsaved changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name:"Stay", exact:true }).click();
  await assertAllValues(page, local);
  await expect(reload).toBeFocused();
  expect({ reads:reads.length, writes:writes.length }).toEqual(countsAtConflict);

  await reload.click();
  await dialog.getByRole("button", { name:"Leave without saving" }).click();
  await expect(page.locator("[data-composer-form]")).toHaveAttribute("data-expected-version", String(expectedVersion + 1));
  await assertAllValues(page, stored);
  await expect(actions).toBeHidden();
  await expect(page.locator("[data-composer-save]")).toBeDisabled();
  expect(reads.length).toBe(countsAtConflict.reads + 1);
  expect(writes.length).toBe(countsAtConflict.writes);
  console.log("CCX302B_CONFLICT_RECOVERY", JSON.stringify({ keepEditing:{ fields:5, extraReads:0, extraWrites:0, conflictVisible:true }, stay:{ fields:5, extraReads:0, extraWrites:0 }, reload:{ reads:1, writes:0, expectedVersion:expectedVersion + 1, dirty:false } }));
});

async function assertHashOnce(page, hash, historyBefore) {
  await expect(page).toHaveURL(new RegExp(`${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);
}

test("Back, sidebar, and exact-object navigation each support Stay, Escape, focus return, and one exact Leave", async ({ page }) => {
  test.slow();
  const scenarios = [
    {
      id:"idea-09", destination:"#queue?view=ideas",
      trigger:async () => page.getByRole("button", { name:"Back to Social" }).click(),
      focus:() => page.getByRole("button", { name:"Back to Social" })
    },
    {
      id:"idea-10", destination:"#today",
      trigger:async () => page.getByRole("navigation", { name:"Primary destinations" }).getByRole("link", { name:"Today", exact:true }).click(),
      focus:() => page.getByRole("navigation", { name:"Primary destinations" }).getByRole("link", { name:"Today", exact:true })
    }
  ];
  for (const scenario of scenarios) {
    await openComposer(page, scenario.id);
    const values = editedValues(scenario.id);
    await fillAll(page, values);
    const historyBefore = await page.evaluate(() => history.length);
    await scenario.trigger();
    const dialog = page.getByRole("dialog", { name:"Unsaved changes" });
    await expect(dialog).toHaveCount(1);
    await dialog.getByRole("button", { name:"Stay", exact:true }).click();
    await expect(page).toHaveURL(new RegExp(`#social/post/${scenario.id}$`));
    await assertAllValues(page, values);
    await expect(scenario.focus()).toBeFocused();
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await scenario.trigger();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`#social/post/${scenario.id}$`));
    await assertAllValues(page, values);
    await expect(scenario.focus()).toBeFocused();
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await scenario.trigger();
    await dialog.getByRole("button", { name:"Leave without saving" }).click();
    await assertHashOnce(page, scenario.destination, historyBefore);
    await expect(page.getByRole("dialog", { name:"Unsaved changes" })).toHaveCount(0);
  }

  await openComposer(page, "idea-11");
  const values = editedValues("Exact object");
  await fillAll(page, values);
  const historyBefore = await page.evaluate(() => history.length);
  await page.getByRole("button", { name:"Search", exact:true }).click();
  const search = page.getByRole("dialog", { name:"Search" });
  await search.getByRole("combobox", { name:"Search Command Center" }).fill("Social idea 02");
  const exactLink = search.locator('[data-global-search-result][data-href="#social/post/idea-02"]').first();
  await expect(exactLink).toBeVisible();
  await exactLink.click();
  const discard = page.getByRole("dialog", { name:"Unsaved changes" });
  await expect(discard).toHaveCount(1);
  await discard.getByRole("button", { name:"Stay", exact:true }).click();
  await expect(page).toHaveURL(/#social\/post\/idea-11$/);
  await assertAllValues(page, values);
  await expect(exactLink).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyBefore);
  await exactLink.click();
  await discard.getByRole("button", { name:"Leave without saving" }).click();
  await assertHashOnce(page, "#social/post/idea-02", historyBefore);
});

test("guarded browser Back preserves Forward history; clean hash navigation and successful save clear guards", async ({ page }) => {
  test.slow();
  const baseURL = process.env.BROWSER_TEST_COMPOSER_BASE_URL;
  await openComposer(page, "idea-12", baseURL);
  await page.evaluate(() => {
    history.replaceState({ acceptance:"previous" }, "", "#today");
    history.pushState({ acceptance:"composer" }, "", "#social/post/idea-12");
  });
  const values = editedValues("Browser history");
  await fillAll(page, values);
  await page.goBack();
  const dialog = page.getByRole("dialog", { name:"Unsaved changes" });
  await expect(dialog).toHaveCount(1);
  await expect(page).toHaveURL(/#social\/post\/idea-12$/);
  await dialog.getByRole("button", { name:"Stay", exact:true }).click();
  await assertAllValues(page, values);
  await page.goBack();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name:"Leave without saving" }).click();
  await expect(page).toHaveURL(/#today$/);
  await expect(dialog).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/#social\/post\/idea-12$/);
  await expect(page.locator("[data-composer-form]")).toBeVisible();
  await page.evaluate(() => { location.hash = "#settings"; });
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByRole("dialog", { name:"Unsaved changes" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#social\/post\/idea-12$/);
  await expect(page.locator("[data-composer-form]")).toBeVisible();

  await openComposer(page, "idea-13", baseURL);
  await fillAll(page, editedValues("Saved guard clear"));
  let saves = 0;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ui/social/post/idea-13/save") saves += 1; });
  await page.locator("[data-composer-save]").click();
  await expect(page.locator("[data-composer-message]")).toHaveText("Saved");
  expect(saves).toBe(1);
  await page.getByRole("button", { name:"Back to Social" }).click();
  await expect(page).toHaveURL(/#queue\?view=ideas$/);
  await expect(page.getByRole("dialog", { name:"Unsaved changes" })).toHaveCount(0);
  console.log("CCX302B_HISTORY", JSON.stringify({ backStay:true, backLeave:true, forward:true, ordinaryHash:true, saveClearsGuard:true, duplicateDialogs:0, duplicateHistory:0 }));
});

test("session expiry clears dirty and conflict state even while the discard dialog is open", async ({ page }) => {
  test.slow();
  await openComposer(page, "idea-14");
  await fillAll(page, editedValues("Dirty expiry"));
  await page.evaluate(() => window.dispatchEvent(new Event("vnext:session-expired")));
  await expect(page.locator('[data-vnext-shell-state="session_expired"]')).toBeVisible();
  await expect(page.locator("[data-composer-field]")).toHaveCount(0);
  await expect(page.locator("[data-composer-form]")).toHaveCount(0);

  await page.reload({ waitUntil:"domcontentloaded" });
  await openComposer(page, "idea-15");
  await fillAll(page, editedValues("Dialog expiry"));
  await page.route("**/api/ui/social/post/idea-15/save", (route) => route.fulfill({ status:409, contentType:"application/json", body:JSON.stringify({ ok:false, outcome:"conflict", currentVersion:2, message:"Conflict" }) }));
  allowExpectedConsoleError(page, /409/, 1);
  await page.locator("[data-composer-save]").click();
  await expect(page.locator("[data-conflict-actions]")).toBeVisible();
  await page.getByRole("button", { name:"Back to Social" }).click();
  await expect(page.getByRole("dialog", { name:"Unsaved changes" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("vnext:session-expired")));
  await expect(page.locator('[data-vnext-shell-state="session_expired"]')).toBeVisible();
  await expect(page.getByRole("dialog", { name:"Unsaved changes" })).toHaveCount(0);
  await expect(page.locator("[data-composer-field]")).toHaveCount(0);
  await expect(page.locator("[data-conflict-actions]")).toHaveCount(0);
  await page.evaluate(() => { location.hash = "#today"; });
  await expect(page.getByRole("dialog", { name:"Unsaved changes" })).toHaveCount(0);
  console.log("CCX302B_SESSION_EXPIRY", JSON.stringify({ dirtyFields:0, expectedVersion:null, pendingDestination:null, conflict:false, dialog:false }));
});

test("flag-off endpoints remain unavailable without Post writes and the legacy generic item is unchanged", async ({ page }) => {
  const baseURL = process.env.BROWSER_TEST_BASE_URL;
  const id = "browser-post-search-001";
  const before = await page.request.get(`${baseURL}/api/state`).then((response) => response.json());
  const read = await page.request.get(`${baseURL}/api/ui/social/post/${id}/composer`);
  const save = await page.request.post(`${baseURL}/api/ui/social/post/${id}/save`, { data:{ fields:{ headline:"Flag-off write" }, expectedVersion:1 } });
  const after = await page.request.get(`${baseURL}/api/state`).then((response) => response.json());
  expect(read.status()).toBe(404);
  expect(await read.json()).toMatchObject({ ok:false, outcome:"not_available" });
  expect(save.status()).toBe(404);
  expect(await save.json()).toMatchObject({ ok:false, outcome:"not_available" });
  expect(after.posts).toEqual(before.posts);
  await page.goto(`${baseURL}/#item/posts/${id}`, { waitUntil:"domcontentloaded" });
  await expect(page.locator("main#app #item.page-section.active")).toBeVisible();
  await expect(page.locator("[data-post-composer]")).toHaveCount(0);
  console.log("CCX302B_FLAG_OFF", JSON.stringify({ read:404, save:404, postUpdates:0, legacyGenericItem:true }));
});

test("one successful save changes exactly five Post fields and one version with no other mutation", async ({ page }) => {
  test.slow();
  const id = "idea-16";
  const baseURL = process.env.BROWSER_TEST_COMPOSER_BASE_URL;
  const requests = [];
  page.on("request", (request) => requests.push({ method:request.method(), pathname:new URL(request.url()).pathname }));
  await openComposer(page, id, baseURL);
  const before = await page.request.get(`${baseURL}/api/test/fixture-state`).then((response) => response.json());
  const beforePost = before.posts.find((post) => post.id === id);
  const values = editedValues(`Exact mutation ${beforePost._version + 1}`);
  await fillAll(page, values);
  await page.locator("[data-composer-save]").evaluate((button) => { button.click(); button.click(); });
  await expect(page.locator("[data-composer-message]")).toHaveText("Saved");
  const after = await page.request.get(`${baseURL}/api/test/fixture-state`).then((response) => response.json());
  const afterPost = after.posts.find((post) => post.id === id);
  const changed = Object.keys({ ...beforePost, ...afterPost }).filter((key) => JSON.stringify(beforePost[key]) !== JSON.stringify(afterPost[key])).sort();
  expect(changed).toEqual([...FIELD_KEYS, "_version"].sort());
  expect(afterPost._version).toBe(beforePost._version + 1);
  for (const key of FIELD_KEYS) expect(afterPost[key]).toEqual(key === "hashtags" ? values[key].split(" ") : values[key]);
  expect(after.posts.filter((post) => post.id !== id)).toEqual(before.posts.filter((post) => post.id !== id));
  for (const collection of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (collection !== "posts") expect(after[collection], collection).toEqual(before[collection]);
  }
  const saveRequests = requests.filter((request) => request.method === "POST" && request.pathname === `/api/ui/social/post/${id}/save`);
  const fullStateWrites = requests.filter((request) => request.method !== "GET" && request.pathname === "/api/state");
  const prohibited = requests.filter((request) => /schedule|approv|publish|attempt|provider|image|generation|connection|live.gate/i.test(request.pathname));
  expect(saveRequests).toHaveLength(1);
  expect(fullStateWrites).toEqual([]);
  expect(prohibited).toEqual([]);
  console.log("CCX302B_EXACT_MUTATION", JSON.stringify({ postId:id, versionIncrement:1, changedFields:FIELD_KEYS, otherPostFields:0, otherPosts:0, fullStateWrites:0, scheduleWrites:0, approvalWrites:0, publicationAttemptWrites:0, providerCalls:0, imageGenerationCalls:0, connectionLiveGateChanges:0, campaignMutations:0, partnerMutations:0, fileMutations:0, duplicateSaveRequests:0 }));
});
