import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext) {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; repo: string }[];
  const fixture = sessions.find((s) => s.title === "fixture")!;
  const title = `chat-${crypto.randomUUID()}`;
  await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: fixture.repo, title } });
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
}

async function zoomTo(page: Page, level: string) {
  for (let i = 0; i < 20 && (await page.getByTestId("change-c1").getAttribute("data-level")) !== level; i++) {
    const current = await page.getByTestId("change-c1").getAttribute("data-level");
    const zoomOut = current === "code" || (current === "concept" && level === "patch");
    await page.getByRole("button", { name: zoomOut ? "zoom out" : "zoom in" }).click();
    await page.waitForTimeout(150);
  }
}

test("ask about a change: draft, send, stub answer appears and persists", async ({ page, request }) => {
  await openNarrated(page, request);
  await zoomTo(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.locator('[data-testid^="chat-draft-"]');
  await expect(chat).toBeVisible();
  await chat.getByLabel("message").fill("Why this change?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const assistant = page.locator(".msg.assistant");
  await expect(assistant.locator("li strong", { hasText: "THIRTY" })).toBeVisible();
  await expect(assistant.locator("pre code", { hasText: "int x = 1;" })).toBeVisible();
  await expect(assistant.locator("button.code-link", { hasText: "THIRTY" })).toBeVisible();
  const userMessage = page.locator(".msg.user", { hasText: "Why this change?" });
  await expect(userMessage).toBeVisible();
  await expect(userMessage.locator("p")).toHaveCount(0);
  await page.reload();
  await zoomTo(page, "concept");
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible();
  await answer.locator("p").first().click({ clickCount: 3 });
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Stub");
});

test("a failed first turn shows its error in the chat", async ({ page, request }) => {
  await openNarrated(page, request);
  await zoomTo(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("FAIL-THIS-TURN");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-node .msg.failed")).toContainText("stub failure", { timeout: 10_000 });
});

test("ask about a hunk anchors the chat to its change", async ({ page, request }) => {
  await openNarrated(page, request);
  await zoomTo(page, "code");
  await page.getByRole("button", { name: "Ask about f0h0" }).click();
  const chat = page.locator('[data-testid^="chat-draft-"]');
  await expect(chat).toBeVisible();
  const chatBox = (await chat.boundingBox())!;
  const c1 = (await page.getByTestId("change-c1").boundingBox())!;
  expect(chatBox.x).toBeGreaterThan(c1.x + c1.width);
});
