import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { revealNode, setLevel, startReview } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext): Promise<void> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD~1..HEAD");
  await setLevel(page, "concept");
}

test("accept a finding, edit comment, post to Phabricator", async ({ page, request }) => {
  await openNarrated(page, request);
  const finding = page.locator(".finding-node");
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await expect(finding).toContainText("No test for c");
  await finding.getByLabel("Accept finding").click();
  await expect(finding.getByLabel("Dismiss finding")).toBeVisible();
  await expect(finding.getByLabel("Accept finding")).toHaveCount(0);
  await expect(finding.getByLabel("Comment")).toHaveValue("No test was added for the c.txt change.", { timeout: 10_000 });
  const summary = page.getByTestId("summary");
  await expect(summary.getByText(/Submit.*inline comment/)).toHaveCount(0);
  await finding.getByLabel("Comment").fill("Edited comment text.");
  await revealNode(page, finding.getByRole("button", { name: "Save" }));
  await finding.getByRole("button", { name: "Save" }).click();
  const post = summary.getByText(/Submit 1 inline comment to D1/);
  await expect(post).toBeVisible({ timeout: 5_000 });
  await revealNode(page, post);
  page.once("dialog", (dialog) => void dialog.accept());
  await post.click();
  await expect(summary.getByText(/Submitted 1 inline comment to D1/)).toBeVisible({ timeout: 10_000 });
  await expect(finding.getByText("Posted to D1")).toBeVisible();
  await expect(summary.getByText(/Submit 1 inline comment to D1/)).toHaveCount(0);
});

test("dismiss a finding makes it dimmed", async ({ page, request }) => {
  await openNarrated(page, request);
  const finding = page.locator(".finding-node");
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.getByLabel("Dismiss finding").click();
  await expect(finding).toHaveClass(/dismissed/);
  await finding.getByLabel("Accept finding").click();
  await expect(finding).not.toHaveClass(/dismissed/);
});
