import { test, expect, type Page } from "@playwright/test";
import { setLevel } from "./canvas.ts";

const URL = "http://localhost:5174/?fixture=1";

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

  await setLevel(page, "patch");
  await expect(page.getByText("Introduce pending-commit state")).toBeVisible();
  await expect(page.getByText("Adds mPendingCommit")).toHaveCount(0);
  await assertNoOverlap(page);

  await setLevel(page, "concept");
  await expect(page.getByText("Adds mPendingCommit")).toBeVisible();
  await expect(page.getByTestId("hunk-f0h0")).toHaveCount(0);
  await assertNoOverlap(page);

  await setLevel(page, "code");
  await expect(page.getByTestId("hunk-f1h0")).toBeAttached();
  await expect(page.getByTestId("hunk-f1h0").getByText("mPendingCommit = aPending;")).toBeAttached();
  await assertNoOverlap(page);
});

test("diff text is selectable without panning the canvas", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "code");
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
  await setLevel(page, "concept");
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.getByTestId("change-c1").locator(".explanation").dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
});

test("spec text is selectable without panning", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.getByTestId("spec-R").locator(".spec-text").dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
});

const flowX =(page: Page, id: string) =>
  page.getByTestId(`change-${id}`).locator("..").evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);

test("dragging a node by its title survives relayout until reset", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  const relX = async () => await flowX(page, "c2") - await flowX(page, "c1");
  const computed = await relX();
  const title = page.getByTestId("change-c2").locator(".title");
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 230, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  const offset = await relX() - computed;
  expect(offset).toBeGreaterThan(50);

  await setLevel(page, "code");
  await page.waitForTimeout(400);
  const dragged = await relX();
  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.waitForTimeout(400);
  expect(Math.abs(dragged - await relX() - offset)).toBeLessThan(1);
});

test("spec node sits right of the story and diff lines link to Searchfox", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId("summary").locator(".spec-status")).toContainText("Specs: 1 cited in code");
  const spec = page.getByTestId("spec-R");
  await expect(spec).toBeVisible();
  await expect(spec.getByText("unverified")).toHaveCount(0);
  await expect(spec.getByText("cited in code")).toBeVisible();
  const specBox = (await spec.boundingBox())!;
  for (const id of ["change-c1", "change-c2", "change-c3"]) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(specBox.x).toBeGreaterThan(b.x + b.width);
  }
  await setLevel(page, "code");
  await expect(page.getByTestId("hunk-f1h0").locator("td.ln a").first())
    .toHaveAttribute("href", "https://searchfox.org/firefox-main/rev/5555555555555555555555555555555555555555/dom/navigation/Navigation.cpp#200");
  await expect(page.getByTestId("hunk-f1h0").locator(".sf-link"))
    .toHaveAttribute("href", "https://searchfox.org/firefox-main/rev/5555555555555555555555555555555555555555/dom/navigation/Navigation.cpp#200");
  await expect(page.getByTestId("hunk-f1h0").locator(".sf-link"))
    .toHaveAttribute("title", "Searchfox at the patch's base");
  for (let i = 0; i < 10 && !(await spec.count()); i++) {
    const x = await page.evaluate(() => [...Array(60).keys()].map((i) => 1200 - i * 20).find((x) => document.elementFromPoint(x, innerHeight / 2)?.classList.contains("react-flow__pane")));
    expect(x).toBeDefined();
    await page.mouse.move(x!, 400);
    await page.mouse.down();
    await page.mouse.move(x! - 500, 400, { steps: 8 });
    await page.mouse.up();
  }
  await expect(spec.getByRole("link", { name: /Code: dom\/navigation\/Navigation.cpp:120/ })).toBeAttached();
  await expect(page.getByTestId("change-c1").locator(".explanation a.code-link").first())
    .toHaveAttribute("href", /^https:\/\/searchfox\.org\/firefox-main\/search\?q=/);
});

test("wheel and arrow keys pan, ctrl+wheel zooms", async ({ page }) => {
  await page.goto(URL);
  const hunk = page.getByTestId("change-c1");
  await expect(hunk).toBeVisible();
  const viewport = () => page.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
  const box = (await hunk.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.waitForTimeout(400);
  const start = await viewport();

  await page.mouse.wheel(0, 200);
  await expect.poll(async () => (await viewport()).y).toBeLessThan(start.y);
  expect((await viewport()).zoom).toBe(start.zoom);

  await page.mouse.wheel(200, 0);
  await expect.poll(async () => (await viewport()).x).toBeLessThan(start.x);
  expect((await viewport()).zoom).toBe(start.zoom);

  await hunk.click({ position: { x: 20, y: 10 } });
  const before = await viewport();
  const nodeBefore = await hunk.evaluate((el) => el.closest(".react-flow__node")!.getAttribute("style"));
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await viewport()).y).toBeLessThan(before.y);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await viewport()).x).toBeLessThan(before.x);
  expect((await viewport()).zoom).toBe(before.zoom);
  expect(await hunk.evaluate((el) => el.closest(".react-flow__node")!.getAttribute("style"))).toBe(nodeBefore);

  const x = await page.evaluate(() => [...Array(60).keys()].map((i) => 10 + i * 20).find((x) => document.elementFromPoint(x, 650)?.classList.contains("react-flow__pane")));
  await page.mouse.click(x!, 650);
  const afterPaneClick = await viewport();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await viewport()).y).toBeGreaterThan(afterPaneClick.y);

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await viewport()).zoom).toBeGreaterThan(before.zoom);
});

test("minimap shows every node, also those culled from the viewport", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId("change-c1")).toBeVisible();
  const minimap = page.locator(".react-flow__minimap");
  const pane = page.locator(".react-flow__pane");
  await expect(minimap).toBeVisible();
  const minimapBox = (await minimap.boundingBox())!;
  const paneBox = (await pane.boundingBox())!;
  const svg = minimap.locator("svg");
  const viewBox = await svg.getAttribute("viewBox");
  expect(viewBox).not.toBeNull();
  const viewBoxValues = viewBox!.split(/[\s,]+/).map(Number);
  expect(viewBoxValues).toHaveLength(4);
  expect(viewBoxValues.every(Number.isFinite)).toBe(true);
  const svgBox = (await svg.boundingBox())!;
  expect(Math.abs(svgBox.height - paneBox.height)).toBeLessThanOrEqual(3);
  expect(minimapBox.x).toBeGreaterThanOrEqual(paneBox.x + paneBox.width - 1);
  expect(Math.abs(minimapBox.y - paneBox.y)).toBeLessThanOrEqual(3);
  expect(Math.abs(minimapBox.height - paneBox.height)).toBeLessThanOrEqual(3);
  const maskFill = await page.locator(".react-flow__minimap-mask").evaluate((el) => getComputedStyle(el).fill);
  expect(maskFill).not.toBe("rgb(0, 0, 0)");
  const minimapBg = await minimap.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(minimapBg).toBe("rgb(255, 255, 255)");
  await setLevel(page, "patch");
  await page.waitForTimeout(400);
  const all = await page.locator(".react-flow__node").count();
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(all);
  await setLevel(page, "code");
  await expect.poll(() => page.locator(".react-flow__node").count()).toBeLessThan(all);
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(all);
});
