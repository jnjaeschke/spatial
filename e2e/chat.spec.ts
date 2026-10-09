import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { revealNode, setLevel, startReview } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext): Promise<string> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((s) => s.title === "fixture")!;
  return await startReview(page, fixture.worktree, "HEAD~1..HEAD");
}

test("ask about a change: draft, send, stub answer appears and persists", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.locator('[data-testid^="chat-draft-"]');
  await expect(chat).toBeVisible();
  await chat.getByLabel("message").fill("Why this change?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const assistant = page.locator(".msg.assistant");
  await expect(assistant.locator("li strong", { hasText: "THIRTY" })).toBeVisible();
  await expect(assistant.locator(".chat-questions li")).toContainText("Should c2 really depend on c1?");
  await expect(assistant.locator("pre code", { hasText: "int x = 1;" })).toBeVisible();
  const codeLink = assistant.locator("button.code-link", { hasText: "THIRTY" });
  await expect(codeLink).toBeVisible();
  await revealNode(page, codeLink);
  await codeLink.click();
  const focused = page.getByTestId("change-c1").locator('tr.focus[data-new="30"]');
  await expect(focused).toBeInViewport();
  await expect(focused).toContainText("THIRTY");
  await expect(page.getByTestId("file-panel")).toHaveCount(0);
  await setLevel(page, "concept");
  const userMessage = page.locator(".msg.user", { hasText: "Why this change?" });
  await expect(userMessage).toBeVisible();
  await expect(userMessage.locator("p")).toHaveCount(0);
  await page.reload();
  await setLevel(page, "concept");
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible();
  await answer.locator("p").first().click({ clickCount: 3 });
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Stub");
});

test("chat boxes close with their top-right × or Escape; an empty draft is discarded, a draft with text reopens with it", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
  const drafts = page.locator('[data-testid^="chat-draft-"]');
  const change = page.getByTestId("change-c1");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  await expect(drafts).toHaveCount(1);
  const close = drafts.getByRole("button", { name: "Close" });
  const closeBox = (await close.boundingBox())!, draftBox = (await drafts.boundingBox())!;
  expect(draftBox.x + draftBox.width - (closeBox.x + closeBox.width)).toBeLessThan(20);
  expect(closeBox.y - draftBox.y).toBeLessThan(20);
  await close.click();
  await expect(drafts).toHaveCount(0);
  await expect(change.getByRole("button", { name: /Reopen/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Ask about c1" }).click();
  await drafts.getByLabel("message").fill("keep me");
  await drafts.getByLabel("message").press("Escape");
  await expect(drafts).toHaveCount(0);
  await change.getByRole("button", { name: "Reopen 1 closed chat" }).click();
  await expect(drafts.getByLabel("message")).toHaveValue("keep me");
  await drafts.getByLabel("message").fill("");
  await drafts.getByLabel("message").press("Escape");
  await expect(drafts).toHaveCount(0);
});

test("a closed chat stays closed after reload and reopens from its change", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("Why this change?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  const chat = page.locator(".chat-node").filter({ has: answer });
  await chat.getByRole("button", { name: "Close" }).click();
  await expect(answer).toHaveCount(0);
  await page.reload();
  await setLevel(page, "concept");
  const reopen = page.getByTestId("change-c1").getByRole("button", { name: "Reopen 1 closed chat" });
  await expect(reopen).toBeVisible();
  await expect(answer).toHaveCount(0);
  await reopen.click();
  await expect(answer).toBeVisible();
  await expect(reopen).toHaveCount(0);
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
  await note.locator(".title").click({ position: { x: 5, y: 5 } });
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
  await setLevel(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  const input = draft.getByLabel("message");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await input.fill("ab");
  await input.press("ArrowLeft");
  await input.press("Control+Enter");
  await expect(input).toHaveValue("a\nb");
  await input.press("Enter");
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".chat-node .msg.user")).toHaveText(/^a\nb$/);
});

test("saying an answer is wrong strikes it through", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.locator('[data-testid^="chat-draft-"]');
  await chat.getByLabel("message").fill("Why?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  const threadChat = page.locator(".chat-node").filter({ has: page.locator(".msg.assistant", { hasText: "Stub answer." }) });
  await threadChat.getByLabel("message").fill("THAT IS WRONG");
  await threadChat.getByRole("button", { name: "Send" }).click();
  const original = threadChat.locator(".msg.assistant").filter({ hasText: "Stub answer." }).first();
  await expect(original.locator("del")).toHaveText("Stub answer.", { timeout: 10_000 });
  await expect(original).toContainText("Corrected stub answer.");
  await page.reload();
  await setLevel(page, "concept");
  const persisted = page.locator(".msg.assistant").filter({ has: page.locator("del", { hasText: "Stub answer." }) });
  await expect(persisted).toContainText("Corrected stub answer.");
});

test("a failed first turn shows its error in the chat", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("FAIL-THIS-TURN");
  await draft.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-node .msg.failed")).toContainText("stub failure", { timeout: 10_000 });
});

test("ask about a hunk anchors the chat to its change", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "code");
  await page.getByRole("button", { name: "Ask about f0h0" }).click();
  const chat = page.locator('[data-testid^="chat-draft-"]');
  await expect(chat).toBeVisible();
  const chatBox = (await chat.boundingBox())!;
  const c1 = (await page.getByTestId("change-c1").boundingBox())!;
  expect(chatBox.x).toBeGreaterThanOrEqual(c1.x);
  expect(chatBox.x + chatBox.width).toBeLessThanOrEqual(c1.x + c1.width);
});

test("selecting text in a chat opens a chat anchored to the original chat", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
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
  await expect(page.getByTestId("change-c1").locator(".hosted-chat")).toHaveCount(2);
});

test("selecting text on a change opens a quoted chat; cross-card selection is ignored", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
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
  await expect(draft.getByLabel("message")).toBeFocused();
  await expect(page.locator('[data-testid="change-c1"] .hosted-chat')).toContainText("Chat");
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
  const sessionId = await openNarrated(page, request);
  await setLevel(page, "code");
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

test("a quoted diff chat sits next to the quote and highlights it", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "code");
  const row = page.locator('[data-testid="hunk-f0h0"] tr[data-anchor]').last();
  const code = row.locator("td.code");
  const selected = await code.innerText();
  await code.dblclick();
  const word = await page.evaluate(() => getSelection()!.toString().trim());
  const ask = page.locator("button.ask-selection");
  await expect(ask).toBeVisible();
  await ask.click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await expect(draft).toBeVisible();
  await expect(draft.getByLabel("message")).toBeFocused();
  await expect(page.getByTestId("change-c1").locator(".hosted-chat")).toHaveCount(1);
  expect(selected).toContain(word);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])]
    .map((r) => `${r.startContainer.parentElement?.closest("td")?.className}:${(r as Range).toString()}`))).toContain(`code:${word}`);
  await expect.poll(async () => {
    const threadBox = await page.locator(".thread-row").boundingBox();
    const rowBox = await row.boundingBox();
    return threadBox && rowBox ? Math.abs(threadBox.y - (rowBox.y + rowBox.height)) : Infinity;
  }).toBeLessThan(6);
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  const thread = page.locator(".chat-node").filter({ has: answer });
  await expect.poll(async () => {
    const threadBox = await page.locator(".thread-row").boundingBox();
    const rowBox = await row.boundingBox();
    return threadBox && rowBox ? Math.abs(threadBox.y - (rowBox.y + rowBox.height)) : Infinity;
  }).toBeLessThan(6);

  await thread.getByLabel("message").focus();
  await expect.poll(() => page.evaluate(() => CSS.highlights.get("chat-quote-active")?.size ?? 0)).toBe(1);
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await page.mouse.move(5, 5);
  await expect.poll(() => page.evaluate(() => CSS.highlights.get("chat-quote-active")?.size ?? 0)).toBe(0);

  await setLevel(page, "concept");
  await setLevel(page, "code");
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])].map((r) => (r as Range).toString()))).toContain(word);
});

test("collapse a change and expand it after reload", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "concept");
  const change = page.getByTestId("change-c1");
  await change.getByRole("button", { name: "Collapse" }).click();
  await expect(change.locator(".explanation")).toBeHidden();
  await expect(change.getByRole("button", { name: "Expand" })).toBeVisible();
  await page.reload();
  await setLevel(page, "concept");
  const reloaded = page.getByTestId("change-c1");
  await expect(reloaded.locator(".explanation")).toBeHidden();
  await reloaded.getByRole("button", { name: "Expand" }).click();
  await expect(reloaded.locator(".explanation")).toBeVisible();
});

test("a collapsed quoted chat reopens from its highlight", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "code");
  const code = page.locator('[data-testid="hunk-f0h0"] tr:not(.expand) td.code').last();
  await code.dblclick();
  const word = await page.evaluate(() => getSelection()!.toString().trim());
  await page.locator("button.ask-selection").click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await page.locator(".chat-node").filter({ has: answer }).getByRole("button", { name: "Collapse" }).click();
  await expect(answer).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])].map((r) => (r as Range).toString()))).toContain(word);
  const strong = () => page.evaluate(() => CSS.highlights.get("chat-quote-active")?.size ?? 0);
  await expect.poll(strong).toBe(0);

  const quoteCenter = () => page.evaluate(() => {
    const box = ([...CSS.highlights.get("chat-quote")!][0] as Range).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  for (let point = await quoteCenter(); point.x < 100; point = await quoteCenter()) {
    const dx = Math.min(600, 700 - point.x);
    const grab = await page.evaluate((dx) => {
      for (let x = 20; x + dx < innerWidth - 20; x += 20) {
        if (document.elementFromPoint(x, innerHeight / 2)?.classList.contains("react-flow__pane")) return { x, y: innerHeight / 2 };
      }
      throw new Error("no empty pane");
    }, dx);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + dx, grab.y, { steps: 8 });
    await page.mouse.up();
  }
  const point = await quoteCenter();
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".canvas")).toHaveClass(/over-collapsed-quote/);
  await expect.poll(strong).toBe(1);
  await page.mouse.click(point.x, point.y);
  await expect(answer).toBeVisible();

  await page.locator(".chat-node").filter({ has: answer }).getByRole("button", { name: "Collapse" }).click();
  await expect(answer).toHaveCount(0);
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(answer).toBeVisible();
});

test("a review finding sits next to its quote and is a chat", async ({ page, request }) => {
  await openNarrated(page, request);
  const finding = page.locator(".finding-node");
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await expect(finding).toContainText("No test for c");
  await expect(finding.locator(".badge")).toHaveText("medium");
  await setLevel(page, "code");
  const row = page.locator('[data-testid="hunk-f1h0"] tr:not(.expand)').filter({ has: page.locator("td.code", { hasText: /^c$/ }) });
  await revealNode(page, row);
  await revealNode(page, finding);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("finding-quote") ?? [])].map((r) => (r as Range).toString()))).toEqual(["c"]);
  await expect.poll(() => page.evaluate(() => {
    const range = [...CSS.highlights.get("finding-quote")!][0] as Range;
    return range.startContainer.parentElement?.closest("td")?.classList.contains("code") ?? false;
  })).toBe(true);
  await expect.poll(async () => {
    const box = await finding.boundingBox(), rowBox = await row.boundingBox();
    return box && rowBox ? Math.abs(box.y - rowBox.y) : Infinity;
  }).toBeLessThan(40);

  await revealNode(page, finding.getByRole("button", { name: "Collapse" }));
  await finding.getByRole("button", { name: "Collapse" }).click();
  await expect(finding).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => CSS.highlights.get("finding-quote")?.size ?? 0)).toBe(1);
  const quoteCenter = () => page.evaluate(() => {
    const box = ([...CSS.highlights.get("finding-quote")!][0] as Range).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  for (let point = await quoteCenter(); point.x < 100; point = await quoteCenter()) {
    const dx = Math.min(600, 700 - point.x);
    const grab = await page.evaluate((dx) => {
      for (let x = 20; x + dx < innerWidth - 20; x += 20) {
        if (document.elementFromPoint(x, innerHeight / 2)?.classList.contains("react-flow__pane")) return { x, y: innerHeight / 2 };
      }
      throw new Error("no empty pane");
    }, dx);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + dx, grab.y, { steps: 8 });
    await page.mouse.up();
  }
  // Measured nodes can still shift the layout after the pan, so re-measure until the hover lands.
  let point = await quoteCenter();
  await expect(async () => {
    point = await quoteCenter();
    await page.mouse.move(point.x, point.y);
    await expect(page.locator(".canvas")).toHaveClass(/over-collapsed-quote/, { timeout: 500 });
  }).toPass();
  await page.mouse.click(point.x, point.y);
  await expect(finding).toBeVisible();
  await expect(finding.getByRole("button", { name: "Ask about finding" })).toHaveCount(0);
  await finding.getByLabel("message").fill("Why?");
  await finding.getByRole("button", { name: "Send" }).click();
  await expect(finding.locator(".msg.assistant", { hasText: "Stub answer." })).toBeVisible({ timeout: 10_000 });
  await expect(finding.locator(".msg.user")).toHaveText("Why?");
  await expect(page.locator(".chat-node")).toHaveCount(0);
  await finding.getByLabel("message").fill("And?");
  await finding.getByRole("button", { name: "Send" }).click();
  await expect(finding.locator(".msg.assistant")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".chat-node")).toHaveCount(0);
});

test("a chat on code lines renders directly after its last quoted row", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "code");
  const row = page.locator('[data-testid="hunk-f0h0"] tr[data-anchor]').last();
  await row.locator("td.code").dblclick();
  await page.locator("button.ask-selection").click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  const thread = page.locator(".chat-node").filter({ has: answer });
  await expect.poll(async () => {
    const threadBox = await page.locator(".thread-row").boundingBox();
    const rowBox = await row.boundingBox();
    return threadBox && rowBox ? Math.abs(threadBox.y - (rowBox.y + rowBox.height)) : Infinity;
  }).toBeLessThan(6);
  await setLevel(page, "patch");
  await expect(page.getByTestId("change-c1").locator(".title")).toContainText("💬 1");
});
