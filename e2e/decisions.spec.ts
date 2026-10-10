import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openChange, openPatch, revealNode, startReview } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext): Promise<void> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD~1..HEAD");
  await openPatch(page, 0);
}

test("accept a finding, edit comment, and submit a confirmed review", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page, "change-c2");
  const finding = page.getByTestId(/finding-chip/);
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.click();
  const findingPanel = page.getByTestId("finding-panel");
  await expect(findingPanel).toContainText("No test for c");
  await findingPanel.getByLabel("Accept finding").click();
  await expect(findingPanel.getByLabel("Dismiss finding")).toBeVisible();
  await expect(findingPanel.getByLabel("Accept finding")).toHaveCount(0);
  await expect(findingPanel.getByLabel("Comment")).toHaveValue("No test was added for the c.txt change.", { timeout: 10_000 });
  await findingPanel.getByLabel("Comment").fill("Edited comment text.");
  await findingPanel.getByRole("button", { name: "Save" }).click();
  await openPatch(page, 0);
  const panel = page.getByTestId("review-panel-D1");
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await openChange(page);
  const code = page.locator("tr[data-anchor] .code").first();
  await code.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const inlineDraft = page.getByLabel("Comment for Phabricator");
  await inlineDraft.fill("Check this edge case.");
  await inlineDraft.press("Enter");
  await openPatch(page, 0);
  await expect(panel).toContainText("2 inline comments pending");
  await panel.getByLabel("General comment").fill("Please address both findings.");
  await panel.getByLabel("General comment").blur();
  await panel.getByLabel("review action").selectOption("request-changes");
  const beforeInlines = await (await request.get("http://127.0.0.1:4179/control/inlines?revision=1")).json() as unknown[];
  const beforeSubmissions = await (await request.get("http://127.0.0.1:4179/control/submissions?revision=1")).json() as unknown[];
  const submit = panel.getByRole("button", { name: "Submit to D1…" });
  await revealNode(page, submit);
  await submit.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Edited comment text.");
  await expect(dialog).toContainText("Check this edge case.");
  await expect(dialog).toContainText("and request changes");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await (await request.get("http://127.0.0.1:4179/control/inlines?revision=1")).json()).toEqual(beforeInlines);
  expect(await (await request.get("http://127.0.0.1:4179/control/submissions?revision=1")).json()).toEqual(beforeSubmissions);
  await submit.click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(panel.getByText(/Submitted to D1: 2 inline comments, requested changes/)).toBeVisible({ timeout: 10_000 });
  await openChange(page, "change-c2");
  await finding.click();
  await expect(findingPanel.getByText("Posted to D1")).toBeVisible();
  const submissions = await (await request.get("http://127.0.0.1:4179/control/submissions?revision=1")).json();
  expect(submissions.at(-1)).toMatchObject({ action: "reject", attach_inlines: true, message: "Please address both findings." });
});

test("dismiss a finding makes it dimmed", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page, "change-c2");
  const finding = page.getByTestId(/finding-chip/);
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.click();
  const panel = page.getByTestId("finding-panel");
  await panel.getByLabel("Dismiss finding").click();
  await expect(finding).toHaveClass(/dismissed/);
  await panel.getByLabel("Accept finding").click();
  await expect(finding).not.toHaveClass(/dismissed/);
});
