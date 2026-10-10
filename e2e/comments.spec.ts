import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openChange, openPatch, revealNode, startReview } from "./canvas.ts";

async function openCodeReview(page: Page, request: APIRequestContext, place: "patch" | "change" = "change"): Promise<string> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  const sessionId = await startReview(page, fixture.worktree, "HEAD~1..HEAD");
  if (place === "change") await openChange(page);
  else await openPatch(page, 0);
  return sessionId;
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

  await revealNode(page, page.getByTestId("user-comment").getByRole("button", { name: "Edit" }));
  await page.getByTestId("user-comment").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit comment").fill("Updated review comment.");
  await revealNode(page, page.getByTestId("user-comment").getByRole("button", { name: "Save" }));
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

test("review panel saves its general comment and opens a confirmation dialog", async ({ page, request }) => {
  const sessionId = await openCodeReview(page, request, "patch");
  const panel = page.getByTestId("review-panel-D1");
  await expect(panel.getByLabel("General comment")).toHaveCount(0);
  await panel.getByRole("button", { name: "Expand review D1" }).click();
  const general = panel.getByLabel("General comment");
  await general.fill("Please include the API rationale.");
  await general.blur();
  await expect.poll(async () => {
    const state = await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json();
    return JSON.stringify(state.artifacts).includes("Please include the API rationale.");
  }).toBe(true);
  await panel.getByRole("button", { name: "Submit to D1…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Please include the API rationale.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
});
