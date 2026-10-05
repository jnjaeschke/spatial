import { test, expect, type Page } from "@playwright/test";

const URL = "http://localhost:5174/?fixture=1";

async function zoomUntil(page: Page, button: "zoom in" | "zoom out", level: string) {
  for (let i = 0; i < 20; i++) {
    if ((await page.getByTestId("change-c1").getAttribute("data-level")) === level) return;
    await page.getByRole("button", { name: button }).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`never reached level ${level}`);
}

async function assertNoOverlap(page: Page) {
  await page.waitForTimeout(400);
  const boxes = await page.locator(".react-flow__node").evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute("data-id"), x: r.x, y: r.y, w: r.width, h: r.height }; }),
  );
  for (const a of boxes) for (const b of boxes) {
    if (a.id === b.id) continue;
    const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
    expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
  }
}

test("semantic zoom swaps representations and relayouts without overlap", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId("change-c1")).toBeVisible();

  await zoomUntil(page, "zoom out", "patch");
  await expect(page.getByText("Introduce pending-commit state")).toBeVisible();
  await expect(page.getByText("Adds mPendingCommit")).toHaveCount(0);
  await assertNoOverlap(page);

  await zoomUntil(page, "zoom in", "concept");
  await expect(page.getByText("Adds mPendingCommit")).toBeVisible();
  await expect(page.getByTestId("hunk-f0h0")).toHaveCount(0);
  await assertNoOverlap(page);

  await zoomUntil(page, "zoom in", "code");
  await expect(page.getByTestId("hunk-f1h0")).toBeAttached();
  await expect(page.getByTestId("hunk-f1h0").getByText("mPendingCommit = aPending;")).toBeAttached();
  await assertNoOverlap(page);
});

test("diff text is selectable without panning the canvas", async ({ page }) => {
  await page.goto(URL);
  await zoomUntil(page, "zoom in", "code");
  const hunk = page.getByTestId("hunk-f1h0");
  await hunk.scrollIntoViewIfNeeded();
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await hunk.locator("td.code").first().dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
});

test("explanation text is selectable without panning", async ({ page }) => {
  await page.goto(URL);
  await zoomUntil(page, "zoom out", "concept");
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.getByTestId("change-c1").locator(".explanation").dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
});

const flowX = (page: Page, id: string) =>
  page.getByTestId(`change-${id}`).locator("..").evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);

test("dragging a node by its title survives relayout until reset", async ({ page }) => {
  await page.goto(URL);
  await zoomUntil(page, "zoom out", "concept");
  const zoom = await page.locator(".react-flow__viewport").evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a);
  const title = page.getByTestId("change-c2").locator(".title");
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 230, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  await zoomUntil(page, "zoom in", "code");
  await page.waitForTimeout(400);
  const dragged = await flowX(page, "c2") - await flowX(page, "c1");
  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.waitForTimeout(400);
  const reset = await flowX(page, "c2") - await flowX(page, "c1");
  expect(Math.abs(dragged - reset - 200 / zoom)).toBeLessThan(5);
});
