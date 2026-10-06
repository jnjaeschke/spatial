import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function openStartBox(page: Page, request: APIRequestContext): Promise<void> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(fixture.worktree)}`);
}

test("typing / shows commands; filter, keyboard completion and Escape", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/");
  const list = page.getByRole("listbox", { name: "commands" });
  await expect(list.getByRole("option")).toHaveCount(2);
  await expect(list.getByRole("option").nth(0)).toContainText("/review");
  await expect(list.getByRole("option").nth(0)).toContainText("[D-number | base..head]");
  await expect(list.getByRole("option").nth(1)).toContainText("/chat");
  await expect(list.getByRole("option").nth(1)).toContainText("<message>");

  await box.fill("/c");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toContainText("/chat");
  await box.press("Tab");
  await expect(box).toHaveValue("/chat ");
  await expect(list).toHaveCount(0);

  await box.fill("/");
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(box).toHaveValue("/chat ");
  await expect(page).toHaveURL(/\?path=/);

  await box.fill("/");
  await box.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(box).toHaveValue("/");
  await box.fill("/r");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toContainText("/review");
});

test("/chat starts a conversation session", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/chat Hello from the start box");
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  const conversation = page.getByTestId("conversation");
  await expect(conversation).toContainText("Hello from the start box", { timeout: 10_000 });
  await expect(conversation).toContainText("Stub answer.", { timeout: 10_000 });
  await expect(page.locator(".session-title")).toHaveText("/chat Hello from the start box");
  await expect(page.getByRole("button", { name: "Narrate" })).toHaveCount(0);

  await conversation.getByLabel("message").fill("And more?");
  await conversation.getByRole("button", { name: "Send" }).click();
  await expect(conversation.locator(".msg.assistant", { hasText: "Stub answer." })).toHaveCount(2, { timeout: 10_000 });
});

test("bad commands show an inline error and create nothing", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  const error = page.getByTestId("start-error");
  for (const [input, message] of [
    ["/nope x", "Unknown command /nope"],
    ["/review D292469", "not available yet"],
    ["/chat", "Usage: /chat"],
  ]) {
    await box.fill(input);
    await box.press("Enter");
    await expect(error).toContainText(message);
    await expect(page).toHaveURL(/\?path=/);
  }
});

test("plain text goes to the selector: chat", async ({ page, request }) => {
  await openStartBox(page, request);
  const prompt = "SELECT-ROUTE-CHAT what does this repository do?";
  const box = page.getByLabel("start");
  await box.fill(prompt);
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  await expect(page.locator(".session-title")).toHaveText("Chat via selector", { timeout: 10_000 });
  const conversation = page.getByTestId("conversation");
  await expect(conversation).toContainText(prompt, { timeout: 10_000 });
  await expect(conversation).toContainText("Stub answer.", { timeout: 10_000 });
  await expect(page.getByTestId("task-selectWorkflow")).toHaveAttribute("data-status", "succeeded");
});

test("plain text goes to the selector: review", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("SELECT-ROUTE-REVIEW please look at my last commit");
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  await expect(page.locator(".session-title")).toHaveText("Review via selector", { timeout: 10_000 });
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
});

test("/review with a range runs the review chain", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/review HEAD~1..HEAD");
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Epoch 1")).toBeVisible();
});
