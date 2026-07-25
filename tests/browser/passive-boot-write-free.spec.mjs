// Passive boot must be write-free (2026-07-25 mutation-convoy hotfix).
//
// Objective 4 of the hotfix: a passive application load must not persist business-state
// mutations. This is the production-like proof — a real Chromium browser, the real
// preview-server process running on the REAL Supabase storage backend, and a fake
// PostgREST endpoint standing in for the database so every request the server makes is
// observed from outside the process under test.
//
// Covered flows (all without any user action):
//   GET /                              — the shell
//   the initial Today route
//   GET /api/version
//   GET /api/ui/route-access?target=%23today
//   GET /api/ui/today
//   GET /api/ui/inbox?group=needs-me&limit=1
//   30 seconds of idle time after Today renders
//
// The strict assertion is ZERO rpc/leos_apply_core_mutations calls. The broader
// assertion — zero durable writes of ANY kind — is what caught the automatic
// destination_opened analytics POST, which persisted a row into leos_core_records on
// every passive load and every route click.

import { expect, test } from "@playwright/test";

import { startFakeSupabase } from "../../scripts/test-support/fake-supabase-server.mjs";
import { jsonRequest, loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

const IDLE_MS = 30_000;

test.describe("passive boot performs no database writes", () => {
  let supabase;
  let server;

  test.beforeAll(async () => {
    supabase = await startFakeSupabase({ rows:[
      { collection:"roleAssignments", item_id:"role-owner", payload:{ id:"role-owner", actor_id:"owner", role:"owner", status:"active" } },
      { collection:"tasks", item_id:"task-1", payload:{ id:"task-1", title:"Existing task", status:"open" } },
      { collection:"settings", item_id:"singleton", payload:{ alertsEnabled:false } }
    ] });
    server = await startPreviewServer({ env:{
      // The real Supabase code path, pointed at the fake endpoint.
      LOCAL_DEMO_MODE:"false",
      STORAGE_BACKEND:"supabase",
      COMMAND_CENTER_ALLOW_JSON:"false",
      SUPABASE_URL:supabase.url,
      SUPABASE_SERVICE_ROLE_KEY:"fake-service-role-key-for-passive-boot-test",
      STATE_CACHE_TTL_MS:"3000",
      COMMAND_CENTER_UX_VNEXT:"true",
      COMMAND_CENTER_UX_VNEXT_DISCOVERY:"true"
    } });
  });

  test.afterAll(async () => {
    await server?.stop();
    await supabase?.stop();
  });

  test("loading Today and idling for 30s produces zero core-mutation RPCs", async ({ page, context }) => {
    test.setTimeout(IDLE_MS + 90_000);

    const auth = await loginOwner(server);
    await context.addCookies(auth.cookie.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return { name:pair.slice(0, separator), value:pair.slice(separator + 1), url:server.baseUrl };
    }));

    // Everything before this line (login, session creation) is setup, not passive boot.
    supabase.reset();

    // The listed API flows, exactly as the shell issues them.
    for (const pathname of [
      "/api/version",
      "/api/ui/route-access?target=%23today",
      "/api/ui/today",
      "/api/ui/inbox?group=needs-me&limit=1"
    ]) {
      const result = await jsonRequest(server.baseUrl, pathname, { headers:{ cookie:auth.cookie } });
      expect(result.response.status, `${pathname} must answer`).toBeLessThan(500);
    }

    // The real browser shell on the initial Today route.
    await page.goto(`${server.baseUrl}/#today`, { waitUntil:"load" });
    await expect(page.locator("body")).toBeVisible();

    // Idle. No clicks, no keyboard, no navigation.
    await page.waitForTimeout(IDLE_MS);

    const coreMutations = supabase.coreMutationRequests();
    expect(
      coreMutations.map((entry) => entry.path),
      "A passive load must never call rpc/leos_apply_core_mutations."
    ).toEqual([]);

    // Stronger: no durable write of any kind. This is what the removed automatic
    // destination_opened analytics persistence used to violate on every page load.
    const writes = supabase.writeRequests();
    expect(
      writes.map((entry) => `${entry.method} ${entry.path}`),
      "A passive load must perform no durable database write at all."
    ).toEqual([]);
  });
});
