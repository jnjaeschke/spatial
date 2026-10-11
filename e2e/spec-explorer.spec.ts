import { test, expect, type Page } from "@playwright/test";
import { makeRepo } from "../test/helpers/git-fixture.ts";
import { openPatch, startReview, waitForCanvasSettled } from "./canvas.ts";

export async function exploreNavigate(page: Page) {
  const repo = makeRepo();
  repo.commit({ "a.txt": "a\n" }, "base");
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(repo.dir)}`);
  const box = page.getByLabel("start");
  await box.fill("/explore HTML#navigate");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const navigate = page.getByTestId("spec-box-HTML#navigate");
  await expect(navigate).toBeVisible({ timeout: 15_000 });
  await expect(navigate.getByTestId("spec-summary")).toBeVisible({ timeout: 15_000 });
  await waitForCanvasSettled(page);
  return navigate;
}

test("explore HTML#navigate from the start screen: a link opens a box with an edge, closing removes it", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  await expect(navigate.locator('li[data-step="24.9.1"]')).toBeAttached();
  await navigate.locator('li[data-step="2"]').getByTestId("spec-link").first().click();
  const target = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params");
  await expect(target).toBeVisible();
  await expect(page.locator(".react-flow__edge-text", { hasText: "step 2" })).toHaveCount(1);
  await target.getByRole("button", { name: "Close HTML#snapshotting-source-snapshot-params" }).click();
  await expect(target).toHaveCount(0);
  await expect(page.locator(".react-flow__edge-text", { hasText: "step 2" })).toHaveCount(0);
  await navigate.getByRole("button", { name: "Reopen 1 closed box" }).click();
  await expect(target).toBeVisible();
});

test("steps go into a trace, export as markdown, and show as a sequence diagram", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  const add = async (box: ReturnType<Page["getByTestId"]>, step: string, count: number) => {
    await box.locator(`li[data-step="${step}"]`).first().hover();
    await box.getByRole("button", { name: `Add step ${step} to trace` }).click();
    await expect(page.getByTestId("traces-toggle")).toHaveText(`Traces · ${count}`);
  };
  await add(navigate, "2", 1);
  await navigate.locator('li[data-step="2"]').getByTestId("spec-link").first().click();
  const target = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params");
  await expect(target).toBeVisible();
  await add(target, "1", 2);
  await page.getByRole("button", { name: "Fit view" }).click();
  await add(navigate, "3", 3);
  await expect(page.locator(".react-flow__edge.trace-hop")).toHaveCount(2);
  await page.getByTestId("traces-toggle").click();
  const panel = page.getByTestId("trace-panel");
  await expect(panel.getByTestId(/^trace-entry-/)).toHaveCount(3);
  await panel.getByRole("button", { name: "Export" }).click();
  await expect(page.getByTestId("trace-export").getByLabel("Trace markdown")).toHaveValue("[navigate step 2](https://html.spec.whatwg.org/#navigate)\n→ [snapshotting-source-snapshot-params step 1](https://html.spec.whatwg.org/#snapshotting-source-snapshot-params)\n→ [navigate step 3](https://html.spec.whatwg.org/#navigate)");
  await page.getByTestId("trace-export").getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Trace sequence" }).click();
  const sequence = page.getByTestId("trace-sequence");
  await expect(sequence.locator('.sequence-step[data-kind="call"]')).toHaveCount(1);
  await expect(sequence.locator('.sequence-step[data-kind="return"]')).toHaveCount(1);
  await sequence.locator('.sequence-step[data-kind="return"]').click();
  await expect(page.getByTestId("spec-box-HTML#navigate").locator('li[data-step="3"]')).toHaveClass(/step-focus/);
});

test("a review chat proposes an exploration; Explore opens the explorer and Back returns to the review place", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  await startReview(page, sessions.find((s) => s.title === "fixture")!.worktree, "HEAD~1..HEAD");
  await openPatch(page, 0);
  const place = await page.locator(".canvas").getAttribute("data-place");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.getByTestId("change-c1").locator(".inline-item.kind-chat");
  await chat.getByLabel("message").fill("SPEC-EXPLORE-PLEASE");
  await chat.getByRole("button", { name: "Send" }).click();
  const explore = chat.getByTestId("spec-explore");
  await expect(explore).toHaveText("Explore HTML#navigate", { timeout: 15_000 });
  await explore.click();
  await expect(page).toHaveURL(/[?&]view=spec/);
  await expect(page.getByTestId("spec-box-HTML#navigate")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Spec explorer" })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page).not.toHaveURL(/view=spec/);
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", place!);
  await expect(page.getByTestId("change-c1").locator(".inline-item.kind-chat")).toBeVisible();
});
