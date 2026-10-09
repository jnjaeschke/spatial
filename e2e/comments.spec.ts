import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { revealNode, setLevel, startReview } from "./canvas.ts";

async function openCodeReview(page: Page, request: APIRequestContext): Promise<void> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD~1..HEAD");
  await setLevel(page, "code");
}

async function selectDiffText(page: Page): Promise<void> {
  const text = page.locator("tr[data-anchor] .code").first();
  await text.waitFor();
  await text.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

test.describe.configure({ mode: "serial" });

test("comment on selected diff lines, edit and delete it", async ({ page, request }) => {
  await openCodeReview(page, request);
  await selectDiffText(page);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const draft = page.getByLabel("Comment for Phabricator");
  await draft.fill("Please keep this behavior.");
  await draft.press("Enter");
  const comment = page.getByTestId("user-comment");
  await expect(comment).toContainText("Please keep this behavior.");
  await page.reload();
  await expect(page.getByTestId("user-comment")).toContainText("Please keep this behavior.");

  await page.getByTestId("user-comment").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit comment").fill("Updated review comment.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("user-comment")).toContainText("Updated review comment.");
  await page.getByTestId("user-comment").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("user-comment")).toHaveCount(0);
});

test("Escape closes an empty comment draft", async ({ page, request }) => {
  await openCodeReview(page, request);
  await selectDiffText(page);
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const draft = page.getByLabel("Comment for Phabricator");
  await expect(draft).toBeVisible();
  await draft.press("Escape");
  await expect(page.getByLabel("Comment for Phabricator")).toHaveCount(0);
});
