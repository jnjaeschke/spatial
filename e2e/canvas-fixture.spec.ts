import { test, expect, type Locator, type Page } from "@playwright/test";
import { setLevel, waitForCanvasSettled } from "./canvas.ts";

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
  await expect(page.getByTestId("change-c1").getByText("Introduce pending-commit state")).toBeVisible();
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

test("interacting with a node selects and raises it until selection moves or clears", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  const first = page.getByTestId("change-c1").locator("..");
  const second = page.getByTestId("change-c2").locator("..");

  await first.click();
  await expect(first).toHaveClass(/\bselected\b/);
  const firstZ = Number(await first.evaluate((el) => getComputedStyle(el).zIndex));
  const secondZ = Number(await second.evaluate((el) => getComputedStyle(el).zIndex));
  expect(firstZ).toBeGreaterThan(secondZ);

  await second.click();
  await expect(second).toHaveClass(/\bselected\b/);
  await expect(first).not.toHaveClass(/\bselected\b/);

  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
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
  await expect(page.getByTestId("change-c1").locator(".explanation a.code-link")).toHaveCount(0);
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

test("canvas and minimap hold every node, also off-screen ones", async ({ page }) => {
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
  // Every node stays mounted, also off-screen, so the layout can use its measured size.
  await expect(page.locator(".react-flow__node")).toHaveCount(all);
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(all);
});

const zoomOf = (page: Page) => page.locator(".react-flow__viewport").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

test("guide Next from a far-away view keeps the zoom level and centers the step", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "code");
  await page.locator(".canvas").focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
  await waitForCanvasSettled(page);
  const zoom = await zoomOf(page);
  await page.getByRole("button", { name: "Next step" }).click();
  await waitForCanvasSettled(page);
  const change = page.getByTestId("change-c1");
  await expect(change).toHaveAttribute("data-level", "code");
  expect(await zoomOf(page)).toBeCloseTo(zoom, 5);
  const box = (await change.boundingBox())!;
  const pane = (await page.locator(".react-flow").boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (pane.x + pane.width / 2))).toBeLessThan(5);
});

test("zooming out during a guide move still switches the zoom level", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "code");
  await page.locator(".canvas").focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
  await waitForCanvasSettled(page);
  await page.getByRole("button", { name: "Next step" }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "zoom out" }).click();
  await waitForCanvasSettled(page);
  await expect(page.locator("[data-level]").first()).not.toHaveAttribute("data-level", "code");
});

test("view, guide step, and collapse state persist across reloads", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  await page.locator(".canvas").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByTestId("change-c1").getByRole("button", { name: "Collapse" }).click();
  await expect(page.getByTestId("change-c1").locator(".body")).toHaveCount(0);
  await waitForCanvasSettled(page);
  const before = await page.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });

  await page.reload();
  await waitForCanvasSettled(page);
  const after = await page.locator(".react-flow__viewport").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.zoom - before.zoom)).toBeLessThanOrEqual(0.01);
  await expect(page.getByTestId("change-c1")).toHaveAttribute("data-level", "concept");
  await expect(page.getByTestId("guide")).toContainText("Step 2/");
  await expect(page.getByTestId("change-c1").locator(".body")).toHaveCount(0);
});

test("zooming with the control buttons from the keyboard stops the automatic fit", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await waitForCanvasSettled(page);
  await page.getByRole("button", { name: "zoom in" }).focus();
  await page.keyboard.press("Enter");
  await waitForCanvasSettled(page);
  const zoom = await zoomOf(page);
  await page.keyboard.press("Control+=");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-scale"))).toBe("1.15");
  await waitForCanvasSettled(page);
  expect(await zoomOf(page)).toBeCloseTo(zoom, 5);
});

test("resizing a node persists width per zoom level and reset restores defaults", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  const first = page.getByTestId("change-c1").locator("..");
  const second = page.getByTestId("change-c2").locator("..");
  await first.click();
  const beforeWidth = (await first.boundingBox())!.width;
  const handle = first.locator(".react-flow__resize-control.line.right");
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(beforeWidth + 100);
  await waitForCanvasSettled(page);
  const resized = (await first.boundingBox())!;
  const below = (await second.boundingBox())!;
  expect(below.y).toBeGreaterThanOrEqual(resized.y + resized.height);

  const resizedWidth = (await first.boundingBox())!.width;
  await page.reload();
  await setLevel(page, "concept");
  const reloadedFirst = page.getByTestId("change-c1").locator("..");
  await expect.poll(async () => (await reloadedFirst.boundingBox())!.width).toBeCloseTo(resizedWidth, -1);
  await setLevel(page, "code");
  await expect(reloadedFirst).toHaveCSS("width", /\d+px/);
  const codeWidth = (await reloadedFirst.boundingBox())!.width;
  expect(codeWidth).toBeGreaterThan(resizedWidth);
  await setLevel(page, "concept");
  await page.getByRole("button", { name: "Reset layout" }).click();
  await expect.poll(async () => (await reloadedFirst.boundingBox())!.width).toBeLessThan(resizedWidth - 100);
});

async function dragBy(page: Page, target: Locator, dx: number, dy: number) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
}

test("a node resizes from every edge and corner like a window and keeps a height of its own", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  const node = page.getByTestId("change-c1").locator("..");
  await expect(node.locator(".react-flow__resize-control.line.left")).toHaveCSS("cursor", "ew-resize");
  await expect(node.locator(".react-flow__resize-control.line.bottom")).toHaveCSS("cursor", "ns-resize");
  await expect(node.locator(".react-flow__resize-control.handle.bottom.right")).toHaveCSS("cursor", "nwse-resize");
  await expect(node.locator(".react-flow__resize-control.handle.top.right")).toHaveCSS("cursor", "nesw-resize");

  const before = (await node.boundingBox())!;
  await dragBy(page, node.locator(".react-flow__resize-control.line.left"), -120, 0);
  await waitForCanvasSettled(page);
  const widened = (await node.boundingBox())!;
  expect(widened.width).toBeGreaterThan(before.width + 80);
  expect(Math.abs(widened.x + widened.width - (before.x + before.width))).toBeLessThan(4);

  await dragBy(page, node.locator(".react-flow__resize-control.handle.bottom.right"), 0, -(before.height / 2));
  await waitForCanvasSettled(page);
  await expect(node).toHaveClass(/fixed-height/);
  const shortened = (await node.boundingBox())!;
  expect(shortened.height).toBeLessThan(before.height * 0.75);
  expect(await page.getByTestId("change-c1").evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  await page.reload();
  await setLevel(page, "concept");
  await expect.poll(async () => (await page.getByTestId("change-c1").locator("..").boundingBox())!.height).toBeCloseTo(shortened.height, -1);
});

test("a node drags from anywhere on its title bar, including the strip above the title text", async ({ page }) => {
  await page.goto(URL);
  await setLevel(page, "concept");
  const node = page.getByTestId("change-c1").locator("..");
  const before = (await node.boundingBox())!;
  const title = page.getByTestId("change-c1").locator("> .title");
  const bar = (await title.boundingBox())!;
  expect(bar.y - before.y).toBeLessThan(3);
  expect(bar.width).toBeGreaterThan(before.width - 4);
  await page.mouse.move(before.x + before.width / 2, bar.y + 6);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 150, bar.y + 66, { steps: 10 });
  await page.mouse.up();
  const after = (await node.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(100);
  expect(after.y - before.y).toBeGreaterThan(40);
});
