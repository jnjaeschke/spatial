import { test, expect } from "@playwright/test";
import { openChange, startReview } from "./canvas.ts";

test("chat can request a denylisted repo server and enable it for that thread", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD~1..HEAD");
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await openChange(page, "change-c2");
  const chip = page.getByTestId(/finding-chip/).first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
  const finding = page.getByTestId("finding-panel");
  await finding.getByLabel("message").fill("ENABLE-DEVTOOLS-PLEASE");
  await finding.getByRole("button", { name: "Send" }).click();

  const enable = finding.getByRole("button", { name: "Enable" });
  await expect(enable).toBeVisible({ timeout: 10_000 });
  await enable.click();
  await expect(enable).not.toBeVisible({ timeout: 5_000 });
});
