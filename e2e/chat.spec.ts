import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext): Promise<string> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; repo: string }[];
  const fixture = sessions.find((s) => s.title === "fixture")!;
  const title = `chat-${crypto.randomUUID()}`;
  await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: fixture.repo, title } });
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  return title;
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

test("selecting text in a chat opens a chat anchored to the original chat", async ({ page, request }) => {
  await openNarrated(page, request);
  await zoomTo(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const original = page.locator('[data-testid^="chat-draft-"]');
  await original.getByLabel("message").fill("Start a chat");
  await original.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  const box = (await answer.locator("p").first().boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("button.ask-selection")).toBeVisible();
  await page.locator("button.ask-selection").click();
  const nested = page.locator('[data-testid^="chat-draft-"]').filter({ has: page.getByLabel("message") });
  await expect(nested).toHaveCount(1);
  const nestedBox = (await nested.boundingBox())!;
  const originalBox = (await page.locator(".chat-node").first().boundingBox())!;
  expect(nestedBox.x).toBeGreaterThan(originalBox.x + originalBox.width);
});

test("selecting text on a change opens a quoted chat; cross-card selection is ignored", async ({ page, request }) => {
  await openNarrated(page, request);
  await zoomTo(page, "concept");
  const explanation = page.locator('[data-testid="change-c1"] .explanation');
  const explanationBox = (await explanation.boundingBox())!;
  await page.mouse.move(explanationBox.x + 3, explanationBox.y + explanationBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(explanationBox.x + explanationBox.width - 3, explanationBox.y + explanationBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("button.ask-selection")).toBeVisible();
  await page.locator("button.ask-selection").click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await expect(draft.locator("blockquote.chat-quote")).toContainText("Replaces");
  await draft.getByLabel("message").fill("What does this mean?");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });

  const c1 = page.locator('[data-testid="change-c1"] .explanation');
  const c2 = page.locator('[data-testid="change-c2"] .explanation');
  const a = (await c1.boundingBox())!;
  const b = (await c2.boundingBox())!;
  await page.mouse.move(a.x + a.width * 0.3, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("button.ask-selection")).toHaveCount(0);
});

test("selecting diff rows stores the selected line range", async ({ page, request }) => {
  const title = await openNarrated(page, request);
  await zoomTo(page, "code");
  const rows = page.locator('[data-testid="hunk-f0h0"] tr:not(.expand)');
  const first = await rows.nth(0).boundingBox();
  const last = await rows.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  await page.mouse.move(first!.x + first!.width * 0.8, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(last!.x + last!.width * 0.8, last!.y + last!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("button.ask-selection")).toBeVisible();
  await page.locator("button.ask-selection").click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("Explain these lines");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const state = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { id: string; title: string }[];
  const session = state.find((s) => s.title === title)!;
  const snapshot = await (await request.get(`http://127.0.0.1:4178/api/sessions/${session.id}/state`)).json() as { artifacts: { type: string; data: { lines?: { start: number; end: number; path: string } } }[] };
  const thread = snapshot.artifacts.find((a) => a.type === "ChatThread")!;
  expect(thread.data.lines).toBeDefined();
  expect(thread.data.lines!.start).toBeLessThan(thread.data.lines!.end);
  expect(thread.data.lines!.path).toBe("a.txt");
});
