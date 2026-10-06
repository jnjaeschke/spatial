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
  await expect(assistant.locator("button.code-link", { hasText: "THIRTY" })).toBeVisible();
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
  expect(chatBox.x).toBeGreaterThan(c1.x + c1.width);
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
  const nestedBox = (await nested.boundingBox())!;
  const originalBox = (await page.locator(".chat-node").first().boundingBox())!;
  expect(nestedBox.x).toBeGreaterThan(originalBox.x + originalBox.width);
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
  const row = page.locator('[data-testid="hunk-f0h0"] tr:not(.expand)').last();
  const code = row.locator("td.code");
  const selected = await code.innerText();
  await code.dblclick();
  const word = await page.evaluate(() => getSelection()!.toString().trim());
  const ask = page.locator("button.ask-selection");
  await expect(ask).toBeVisible();
  await ask.click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await expect(draft).toBeVisible();
  expect(selected).toContain(word);
  await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("chat-quote") ?? [])]
    .map((r) => `${r.startContainer.parentElement?.closest("td")?.className}:${(r as Range).toString()}`))).toContain(`code:${word}`);
  await expect.poll(async () => {
    const chatBox = await draft.boundingBox();
    const rowBox = await row.boundingBox();
    return chatBox && rowBox ? Math.abs(chatBox.y - rowBox.y) : Infinity;
  }).toBeLessThan(40);
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  const thread = page.locator(".chat-node").filter({ has: answer });
  await expect.poll(async () => {
    const chatBox = await thread.boundingBox();
    const rowBox = await row.boundingBox();
    return chatBox && rowBox ? Math.abs(chatBox.y - rowBox.y) : Infinity;
  }).toBeLessThan(40);

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

test("a quoted chat aligns to its quote once its unrendered anchor comes into view", async ({ page, request }) => {
  await openNarrated(page, request);
  await setLevel(page, "code");
  const row = page.locator('[data-testid="hunk-f0h0"] tr:not(.expand)').last();
  await row.locator("td.code").dblclick();
  await page.locator("button.ask-selection").click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("Why?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await setLevel(page, "concept");

  const panY = async (dy: number) => {
    const grab = await page.evaluate((dy) => {
      for (let y = dy < 0 ? innerHeight - 20 : 20; y > 0 && y < innerHeight; y += dy < 0 ? -20 : 20) {
        for (let x = 20; x < innerWidth; x += 40) {
          if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
        }
      }
      throw new Error("no empty pane");
    }, dy);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y + dy, { steps: 8 });
    await page.mouse.up();
  };
  for (let i = 0; i < 20 && await page.getByTestId("change-c1").count(); i++) await panY(-600);
  const scale = async () => Number(/scale\(([\d.]+)\)/.exec((await page.locator(".react-flow__viewport").getAttribute("style"))!)![1]);
  for (let i = 0; i < 10 && await scale() < 1.2; i++) {
    await page.getByRole("button", { name: "zoom in" }).click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  for (let i = 0; i < 40; i++) {
    const box = await row.count() ? await row.boundingBox() : null;
    if (box && box.y > 100 && box.y < 700) break;
    await panY(box && box.y >= 700 ? -300 : 300);
  }
  await expect(row).toBeInViewport();
  const thread = page.locator(".chat-node").filter({ has: answer });
  await expect.poll(async () => {
    const chatBox = await thread.boundingBox();
    const rowBox = await row.boundingBox();
    return chatBox && rowBox ? Math.abs(chatBox.y - rowBox.y) : Infinity;
  }).toBeLessThan(40);
});
