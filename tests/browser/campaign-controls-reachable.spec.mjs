// Clicking "Outreach" in the primary navigation must land on a page that shows the real
// reactivation controls — under both vNext flag states.
//
// The node-side matrix (scripts/test-campaign-controls-flag-matrix.mjs) proves the controls
// are SERVED in all four flag combinations. This proves the runtime behavior that markup
// alone cannot: with the Outreach flag ON, the vNext Outreach page mounts into the same
// section that carries the control card, and it must carry that card over rather than
// replace it. Before the repair it replaced the section's innerHTML outright, deleting the
// only working Run / Stop / Resume / Preview controls in the product.
import { expect, test } from "@playwright/test";

import { loginOwner, startPreviewServer } from "../../scripts/test-support/preview-server-harness.mjs";

const CASES = [
  { name:"vNext Outreach page on", outreach:"true", expectedVNextPage:true },
  { name:"vNext Outreach page off", outreach:"false", expectedVNextPage:false }
];

for (const scenario of CASES) {
  test(`reactivation controls are reachable from the nav — ${scenario.name}`, async ({ page, context }) => {
    const server = await startPreviewServer({ env:{
      COMMAND_CENTER_UX_VNEXT:"true",
      COMMAND_CENTER_UX_VNEXT_OUTREACH:scenario.outreach,
      COMMAND_CENTER_UX_VNEXT_SOCIAL:"true",
      COMMAND_CENTER_UX_VNEXT_FILES:"true",
      // Discovery onboarding renders a full-stage overlay that intercepts clicks; it is
      // unrelated to this behavior, so it stays off.
      COMMAND_CENTER_UX_VNEXT_DISCOVERY:"false"
    } });
    try {
      const auth = await loginOwner(server);
      await context.addCookies(auth.cookie.split("; ").map((pair) => {
        const separator = pair.indexOf("=");
        return { name:pair.slice(0, separator), value:pair.slice(separator + 1), url:server.baseUrl };
      }));

      await page.goto(server.baseUrl + "/");
      // Click the primary navigation item, whatever route the flags point it at.
      const navigation = page.locator('a[data-shell-destination="Outreach"]');
      await expect(navigation).toHaveCount(1);
      await expect(navigation).toHaveAttribute("href", scenario.outreach === "true" ? "#outreach" : "#campaigns");
      await navigation.click();

      // The vNext Outreach list appears only when its flag is on…
      if (scenario.expectedVNextPage) {
        await expect(page.locator("[data-outreach-page]")).toHaveCount(1);
      }

      // …but the control surface survives either way, and fills itself without any extra
      // click. Run or Stop (whichever the current live-mode state calls for), Preview next
      // sends, and the pause/resume control must all be on screen.
      const surface = page.locator("[data-reactivation-control-surface]");
      await expect(surface).toHaveCount(1);
      await expect(surface.locator("[data-reactivation-controls]")).toHaveCount(1, { timeout:15_000 });

      const runOrStop = surface.getByRole("button", { name:/^(Run|Stop) Reactivation Campaign$/ });
      await expect(runOrStop).toHaveCount(1);
      await expect(surface.getByRole("button", { name:"Preview next sends" }).first()).toBeVisible();
      await expect(surface.getByRole("button", { name:/Pause campaign now|Propose resume/ })).toHaveCount(1);

      // And Preview next sends actually answers who is due — read-only, no release, no send.
      await surface.getByRole("button", { name:"Preview next sends" }).first().click();
      await expect(page.locator("#campaign-command-action")).toContainText(/due|Sending window/i, { timeout:15_000 });
    } finally {
      await server.stop();
    }
  });
}
