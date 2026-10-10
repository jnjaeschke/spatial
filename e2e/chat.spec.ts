import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openChange, openPatch, revealNode, startReview } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext): Promise<string> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((s) => s.title === "fixture")!;
  return await startReview(page, fixture.worktree, "HEAD~1..HEAD");
}

test("ask about a change: draft, send, stub answer appears and persists", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.getByTestId("chat-panel");
  await expect(chat).toBeVisible();
  await chat.getByLabel("message").fill("Why this change?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const assistant = chat.locator(".msg.assistant");
  await expect(assistant.locator("li strong", { hasText: "THIRTY" })).toBeVisible();
  await expect(assistant.locator(".chat-questions li")).toContainText("Should c2 really depend on c1?");
  await expect(assistant.locator("pre code", { hasText: "int x = 1;" })).toBeVisible();
  const codeLink = assistant.locator("button.code-link", { hasText: "THIRTY" });
  await expect(codeLink).toBeVisible();
  await codeLink.click();
  const focused = page.locator('tr.focus[data-new="30"]');
  await expect(focused).toBeInViewport();
  await expect(focused).toContainText("THIRTY");
  await expect(page.getByTestId("file-panel")).toHaveCount(0);
  await openPatch(page, 0);
  const userMessage = page.locator(".msg.user", { hasText: "Why this change?" });
  await expect(userMessage).toBeVisible();
  await expect(userMessage.locator("p")).toHaveCount(0);
  await page.reload();
  await openPatch(page, 0);
  await expect(page.getByTestId("change-c1").locator("> .title")).toContainText("💬 1");
  await expect(page.getByTestId("chat-panel")).toHaveCount(0);
  await openChange(page);
  await page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ }).click();
  const answer = page.getByTestId("chat-panel").locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible();
  await answer.locator("p").first().click({ clickCount: 3 });
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Stub");
});

test("the chat panel closes with × or Escape; an empty draft is discarded, a draft with text reopens from its chip", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  const panel = page.getByTestId("chat-panel");
  const change = page.getByTestId("change-c1");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  await expect(panel).toBeVisible();
  await expect(change.locator("> .title")).toContainText("💬 1");
  await panel.getByRole("button", { name: "Close chat panel" }).click();
  await expect(panel).toHaveCount(0);
  await expect(change.locator("> .title")).not.toContainText("💬");
  await expect(change.getByRole("button", { name: /Reopen/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Ask about c1" }).click();
  await panel.getByLabel("message").fill("keep me");
  await panel.getByLabel("message").press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(change.locator("> .title")).toContainText("💬 1");
  await openChange(page);
  await page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ }).click();
  await expect(panel.getByLabel("message")).toHaveValue("keep me");
  await panel.getByRole("button", { name: "Close chat", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ })).toHaveCount(0);
  await page.getByTestId("change-c1").getByRole("button", { name: "Reopen 1 closed chat" }).click();
  await page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ }).click();
  await expect(panel.getByLabel("message")).toHaveValue("keep me");
  await panel.getByLabel("message").fill("");
  await panel.getByLabel("message").press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ })).toHaveCount(0);
});

test("a closed chat stays closed after reload and reopens from its change", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const panel = page.getByTestId("chat-panel");
  await panel.getByLabel("message").fill("Why this change?");
  await panel.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await panel.getByRole("button", { name: "Close chat", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await openPatch(page, 0);
  const reopen = page.getByTestId("change-c1").getByRole("button", { name: "Reopen 1 closed chat" });
  await expect(reopen).toBeVisible();
  await expect(page.getByTestId("change-c1").locator("> .title")).not.toContainText("💬");
  await reopen.click();
  await expect(reopen).toHaveCount(0);
  await openChange(page);
  await page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ }).click();
  await expect(answer).toBeVisible();
});

test("double-clicking empty canvas opens a persistent chat at that spot", async ({ page, request }) => {
  await openNarrated(page, request);
  const paneBox = (await page.locator(".react-flow__pane").boundingBox())!;
  const point = await page.evaluate(({ x, y, width, height }) => {
    for (let fy = 0.2; fy < 0.8; fy += 0.05) for (let fx = 0.2; fx < 0.8; fx += 0.05) {
      const p = { x: x + width * fx, y: y + height * fy };
      if (document.elementFromPoint(p.x, p.y)?.classList.contains("react-flow__pane")) return p;
    }
    throw new Error("no empty canvas point");
  }, paneBox);
  await page.mouse.dblclick(point.x, point.y);
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await expect(draft).toBeVisible();
  await expect(draft.getByLabel("message")).toBeFocused();
  const draftBox = (await draft.boundingBox())!;
  expect(point.x).toBeGreaterThanOrEqual(draftBox.x);
  expect(point.x).toBeLessThanOrEqual(draftBox.x + draftBox.width);
  expect(point.y).toBeGreaterThanOrEqual(draftBox.y);
  expect(point.y).toBeLessThanOrEqual(draftBox.y + draftBox.height);
  await draft.getByLabel("message").fill("A session-level question");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible();
  const persisted = page.locator(".chat-node").filter({ has: page.locator(".msg.assistant", { hasText: "Stub answer." }) });
  const persistedBox = (await persisted.boundingBox())!;
  expect(point.x).toBeGreaterThanOrEqual(persistedBox.x);
  expect(point.x).toBeLessThanOrEqual(persistedBox.x + persistedBox.width);
  expect(point.y).toBeGreaterThanOrEqual(persistedBox.y);
  expect(point.y).toBeLessThanOrEqual(persistedBox.y + persistedBox.height);

  await openChange(page);
  const before = await page.evaluate(() => document.querySelector(".react-flow__viewport")!.getAttribute("style"));
  await page.getByTestId("change-c1").locator(".rationale b").dblclick();
  await expect(page.locator('[data-testid^="chat-draft-"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector(".react-flow__viewport")!.getAttribute("style"))).toBe(before);
});

test("/note from an aside draft creates a positioned draft note without a chat turn", async ({ page, request }) => {
  const sessionId = await openNarrated(page, request);
  const pane = page.locator(".react-flow__pane");
  const box = (await pane.boundingBox())!;
  const point = await page.evaluate(({ x, y, width, height }) => {
    for (let fy = 0.2; fy < 0.8; fy += 0.05) for (let fx = 0.2; fx < 0.8; fx += 0.05) {
      const p = { x: x + width * fx, y: y + height * fy };
      if (document.elementFromPoint(p.x, p.y)?.classList.contains("react-flow__pane")) return p;
    }
    throw new Error("no empty canvas point");
  }, box);
  await page.mouse.dblclick(point.x, point.y);
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await expect(draft).toBeVisible();
  await draft.getByLabel("message").fill("/note check the lifetime here");
  await draft.getByRole("button", { name: "Send" }).click();
  const note = page.locator(".note-node");
  await expect(note).toContainText("check the lifetime here");
  await expect(note).toContainText("Draft");
  const noteBox = (await note.boundingBox())!;
  expect(point.x).toBeGreaterThanOrEqual(noteBox.x);
  expect(point.x).toBeLessThanOrEqual(noteBox.x + noteBox.width);
  expect(point.y).toBeGreaterThanOrEqual(noteBox.y);
  expect(point.y).toBeLessThanOrEqual(noteBox.y + noteBox.height);
  const snapshot = await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json() as { artifacts: { type: string }[]; tasks: { kind: string }[] };
  expect(snapshot.artifacts.some((artifact) => artifact.type === "Note")).toBe(true);
  expect(snapshot.tasks.some((task) => task.kind === "chatTurn")).toBe(false);
  await page.reload();
  await expect(page.locator(".note-node")).toContainText("check the lifetime here");
  await note.getByRole("button", { name: "Close" }).click();
  await expect(note).toHaveCount(0);
  const reopen = page.getByTestId("conversation").getByRole("button", { name: "Reopen 1 closed note" });
  await revealNode(page, reopen);
  await reopen.click();
  await expect(note).toContainText("check the lifetime here");
  await note.locator(".title").click({ position: { x: 30, y: 14 } });
  await note.getByRole("button", { name: "Ask about note" }).click();
  const noteDraft = page.locator('[data-testid^="chat-draft-"]');
  await noteDraft.getByLabel("message").fill("Is this lifetime right?");
  await noteDraft.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-node .msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const threads = (await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json() as { artifacts: { type: string; data: { anchor?: string } }[] }).artifacts.filter((artifact) => artifact.type === "ChatThread");
  const noteId = snapshot.artifacts.find((artifact) => artifact.type === "Note") as unknown as { id: string };
  expect(threads.some((thread) => thread.data.anchor === noteId.id)).toBe(true);
});

test("Enter sends a chat message; Ctrl+Enter inserts a newline at the caret", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const panel = page.getByTestId("chat-panel");
  const input = panel.getByLabel("message");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await input.fill("ab");
  await input.press("ArrowLeft");
  await input.press("Control+Enter");
  await expect(input).toHaveValue("a\nb");
  await input.press("Enter");
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator(".msg.user")).toHaveText(/^a\nb$/);
});

test("saying an answer is wrong strikes it through", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const threadChat = page.getByTestId("chat-panel");
  await threadChat.getByLabel("message").fill("Why?");
  await threadChat.getByRole("button", { name: "Send" }).click();
  await expect(threadChat.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  await threadChat.getByLabel("message").fill("THAT IS WRONG");
  await threadChat.getByRole("button", { name: "Send" }).click();
  const original = threadChat.locator(".msg.assistant").filter({ hasText: "Stub answer." }).first();
  await expect(original.locator("del")).toHaveText("Stub answer.", { timeout: 10_000 });
  await expect(original).toContainText("Corrected stub answer.");
  await page.reload();
  await openPatch(page, 0);
  await openChange(page);
  await page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ }).click();
  const persisted = page.getByTestId("chat-panel").locator(".msg.assistant").filter({ has: page.locator("del", { hasText: "Stub answer." }) });
  await expect(persisted).toContainText("Corrected stub answer.");
});

test("a failed first turn shows its error in the chat", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const draft = page.getByTestId("chat-panel");
  await draft.getByLabel("message").fill("FAIL-THIS-TURN");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(draft.locator(".msg.failed")).toContainText("stub failure", { timeout: 10_000 });
});

test("ask about a hunk anchors the chat to its change", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page);
  await revealNode(page, page.getByRole("button", { name: "Ask about f0h0" }));
  await page.getByRole("button", { name: "Ask about f0h0" }).click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  await expect(page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ })).toHaveCount(1);
});

test("selecting text in a chat opens a chat anchored to the original chat", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const panel = page.getByTestId("chat-panel");
  await panel.getByLabel("message").fill("Start a chat");
  await panel.getByRole("button", { name: "Send" }).click();
  const answer = panel.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  const box = (await answer.locator("p").first().boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel.locator(".msg")).toHaveCount(0);
  await expect(panel.getByLabel("message")).toBeFocused();
  await expect(page.getByTestId("change-c1").locator("> .title")).toContainText("💬 2");
  await openChange(page);
  await expect(page.getByTestId("change-c1").getByRole("button", { name: /^chat:/ })).toHaveCount(2);
});

test("selecting text on a change opens a quoted chat; cross-card selection is ignored", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  const explanation = page.locator('[data-testid="change-c1"] .explanation');
  const explanationBox = (await explanation.boundingBox())!;
  await page.mouse.move(explanationBox.x + 3, explanationBox.y + explanationBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(explanationBox.x + explanationBox.width - 3, explanationBox.y + explanationBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  const draft = page.getByTestId("chat-panel");
  await expect(draft.locator("blockquote.chat-quote")).toContainText("Replaces");
  await expect(draft.getByLabel("message")).toBeFocused();
  await expect(page.getByTestId("change-c1").locator("> .title")).toContainText("💬 1");
  await draft.getByLabel("message").fill("What does this mean?");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(draft.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });

  const c1 = page.locator('[data-testid="change-c1"] .explanation');
  const c2 = page.locator('[data-testid="change-c2"] .explanation');
  const a = (await c1.boundingBox())!;
  const b = (await c2.boundingBox())!;
  await page.mouse.move(a.x + a.width * 0.3, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true })).toHaveCount(0);
});

test("selecting diff rows stores the selected line range", async ({ page, request }) => {
  const sessionId = await openNarrated(page, request);
  await openChange(page);
  const rows = page.locator('[data-testid="hunk-f0h0"] tr:not(.expand)');
  const first = await rows.nth(0).boundingBox();
  const last = await rows.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  await page.mouse.move(first!.x + first!.width * 0.8, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(last!.x + last!.width * 0.8, last!.y + last!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  const draft = page.getByTestId("chat-panel");
  await draft.getByLabel("message").fill("Explain these lines");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(draft.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const state = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { id: string; title: string }[];
  const session = state.find((s) => s.id === sessionId)!;
  const snapshot = await (await request.get(`http://127.0.0.1:4178/api/sessions/${session.id}/state`)).json() as { artifacts: { type: string; data: { quote?: string; lines?: { start: number; end: number; path: string } } }[] };
  const thread = snapshot.artifacts.find((a) => a.type === "ChatThread")!;
  expect(thread.data.lines).toBeDefined();
  expect(thread.data.lines!.start).toBeLessThan(thread.data.lines!.end);
  expect(thread.data.lines!.path).toBe("a.txt");
  const quote = thread.data.quote!;
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])].map((range) => (range as Range).toString().replace(/\s+/g, ""))))
    .toEqual([quote.replace(/\s+/g, "")]);
});

test("a quoted diff chat appears as a chip and opens in the details panel", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page);
  const row = page.locator('[data-testid="hunk-f0h0"] tr[data-anchor]').last();
  const code = row.locator("td.code");
  const selected = await code.innerText();
  await code.dblclick();
  const word = await page.evaluate(() => getSelection()!.toString().trim());
  const ask = page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true });
  await expect(ask).toBeVisible();
  await ask.click();
  const draft = page.getByTestId("chat-panel");
  await expect(draft).toBeVisible();
  await expect(draft.getByLabel("message")).toBeFocused();
  await expect(page.getByTestId("hunk-card-f0h0").getByRole("button", { name: /^chat:/ })).toHaveCount(1);
  expect(selected).toContain(word);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])]
    .map((r) => `${r.startContainer.parentElement?.closest("td")?.className}:${(r as Range).toString()}`))).toContain(`code:${word}`);
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("chat-panel").locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible();
  await openPatch(page, 0);
  await openChange(page);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])].map((r) => (r as Range).toString()))).toContain(word);
});

test("collapse a change and expand it after reload", async ({ page, request }) => {
  await openNarrated(page, request);
  await openPatch(page, 0);
  const change = page.getByTestId("change-c1");
  await change.getByRole("button", { name: "Collapse" }).click();
  await expect(change.locator(".explanation")).toBeHidden();
  await expect(change.getByRole("button", { name: "Expand" })).toBeVisible();
  await page.reload();
  await openPatch(page, 0);
  const reloaded = page.getByTestId("change-c1");
  await expect(reloaded.locator(".explanation")).toBeHidden();
  await reloaded.getByRole("button", { name: "Expand" }).click();
  await expect(reloaded.locator(".explanation")).toBeVisible();
});

test("a quoted chat chip opens its details panel", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page);
  const code = page.locator('[data-testid="hunk-f0h0"] tr:not(.expand) td.code').last();
  await code.dblclick();
  const word = await page.evaluate(() => getSelection()!.toString().trim());
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  const draft = page.getByTestId("chat-panel");
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await expect(draft.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])].map((r) => (r as Range).toString()))).toContain(word);
  await page.getByRole("button", { name: "Close chat panel" }).click();
  const point = await page.evaluate(() => {
    const box = ([...(CSS.highlights.get("chat-quote") ?? [])][0] as Range).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("chat-panel")).toBeVisible();
});

test("a review finding chip opens its detail panel with the thread", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page, "change-c2");
  const row = page.locator('[data-testid="hunk-f1h0"] tr:not(.expand)').filter({ has: page.locator("td.code", { hasText: /^c$/ }) });
  const finding = page.getByTestId(/finding-chip/);
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await expect(finding).toContainText("No test for c");
  await expect(finding).toHaveClass(/severity-medium/);
  await expect(finding.locator("xpath=ancestor::tr")).toHaveAttribute("class", /chip-row/);
  await finding.click();
  const panel = page.locator(".review-detail-panel");
  await expect(panel).toContainText("No test for c");
  await expect(panel.getByRole("button", { name: "Accept finding" })).toBeVisible();
  await expect(panel.getByLabel("message")).toBeVisible();
  await panel.getByLabel("message").fill("Why?");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator(".msg.user")).toHaveText("Why?");
  await expect(page.locator(".finding-node")).toHaveCount(0);
});

test("a finding quote stays highlighted under its row", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page, "change-c2");
  const row = page.locator('[data-testid="hunk-f1h0"] tr:not(.expand)').filter({ has: page.locator("td.code", { hasText: /^c$/ }) });
  await revealNode(page, row);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("finding-quote") ?? [])].map((r) => (r as Range).toString()))).toEqual(["c"]);
  await expect.poll(() => page.evaluate(() => {
    const range = [...CSS.highlights.get("finding-quote")!][0] as Range;
    return range.startContainer.parentElement?.closest("td")?.classList.contains("code") ?? false;
  })).toBe(true);
});

test("a chat on code lines appears as a chip after its last quoted row", async ({ page, request }) => {
  await openNarrated(page, request);
  await openChange(page);
  const row = page.locator('[data-testid="hunk-f0h0"] tr[data-anchor]').last();
  await row.locator("td.code").dblclick();
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  const draft = page.getByTestId("chat-panel");
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("hunk-card-f0h0").getByRole("button", { name: /^chat:/ })).toHaveCount(1);
  await expect.poll(async () => {
    const chipBox = await page.locator("tr.chip-row").boundingBox();
    const rowBox = await row.boundingBox();
    return chipBox && rowBox ? Math.abs(chipBox.y - (rowBox.y + rowBox.height)) : Infinity;
  }).toBeLessThan(6);
  await openPatch(page, 0);
  await expect(page.getByTestId("change-c1").locator("> .title")).toContainText("💬 1");
});
