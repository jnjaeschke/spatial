import { test, expect, type Locator, type Page } from "@playwright/test";
import { expandItem, openChange, openInPanel, openPatch, revealNode, waitForCanvasSettled } from "./canvas.ts";

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

test("double-click drills into a change, Up and the breadcrumb go back up, zooming keeps the representation", async ({ page }) => {
  await page.goto(URL);
  const canvas = page.locator(".canvas");
  const crumbs = page.getByTestId("place-crumbs");
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await waitForCanvasSettled(page);
  await expect(canvas).toHaveAttribute("data-place", "patch:0");
  await expect(page.getByTestId("place-up")).toBeDisabled();
  await expect(crumbs).toHaveText("Patch");
  await expect(page.getByTestId("change-c1").getByText("Introduce pending-commit state")).toBeVisible();
  await expect(page.getByText("Adds mPendingCommit")).toBeVisible();
  await expect(page.getByTestId("hunk-f0h0")).toHaveCount(0);
  await assertNoOverlap(page);

  await openChange(page, "change-c2");
  await expect(crumbs).toContainText("Patch");
  await expect(crumbs).toContainText("Fire navigatesuccess when the commit");
  await expect(page.getByTestId("hunk-f1h0").getByText("mPendingCommit = aPending;")).toBeAttached();
  await assertNoOverlap(page);

  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "zoom out" }).click();
  await waitForCanvasSettled(page);
  await expect(canvas).toHaveAttribute("data-place", /^change:c2$/);
  await expect(page.getByTestId("hunk-f1h0").getByText("mPendingCommit = aPending;")).toBeAttached();

  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-place", /^change:c2$/);
  await page.getByTestId("place-up").click();
  await expect(canvas).toHaveAttribute("data-place", "patch:0");
  await expect(page.getByTestId("change-c2").locator("..")).toHaveClass(/\bselected\b/);
  await waitForCanvasSettled(page);
  await expect(page.getByTestId("change-c2")).toBeInViewport();
  await expect(page.getByTestId("hunk-f1h0")).toHaveCount(0);
  await expect(page.getByTestId("change-c2").locator(".explanation")).toBeAttached();

  await openChange(page, "change-c2");
  await crumbs.getByRole("button", { name: "Patch" }).click();
  await expect(canvas).toHaveAttribute("data-place", "patch:0");
  await expect(crumbs).toHaveText("Patch");

  await page.getByTestId("change-c3").click();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-place", /^change:c3$/);
  await page.keyboard.press("Backspace");
  await expect(canvas).toHaveAttribute("data-place", "patch:0");
});

test("the Open button opens a change, and only nodes that open a place have one", async ({ page }) => {
  await page.goto(URL);
  const canvas = page.locator(".canvas");
  await expect(page.getByTestId("change-c2")).toBeVisible();
  await waitForCanvasSettled(page);
  const open = page.getByTestId("change-c2").getByRole("button", { name: "Open" });
  await expect(open).toHaveAttribute("title", "Open (Enter, double-click)");
  await revealNode(page, open);
  await open.click();
  await expect(canvas).toHaveAttribute("data-place", /^change:c2$/);
  await expect(page.getByTestId("hunk-f1h0")).toBeAttached();
  await expect(page.getByTestId("open-place")).toHaveCount(0);
});

test("Back and Forward walk the places", async ({ page }) => {
  await page.goto(URL);
  const canvas = page.locator(".canvas");
  await openChange(page, "change-c2");
  await page.goBack();
  await expect(canvas).toHaveAttribute("data-place", "patch:0");
  await expect(page.getByTestId("change-c2")).toBeVisible();
  await page.goForward();
  await expect(canvas).toHaveAttribute("data-place", /^change:c2$/);
  await expect(page.getByTestId("hunk-f1h0")).toBeAttached();
});

test("a stored place that does not exist falls back to the first place", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("spatial:view:S", JSON.stringify({ x: 0, y: 0, zoom: 1, place: "change:gone", guideStep: null })));
  await page.reload();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", "patch:0");
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await expect(page.getByTestId("change-c1")).toBeInViewport();
});

test("the place persists across reloads", async ({ page }) => {
  await page.goto(URL);
  await openChange(page, "change-c2");
  await page.reload();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", /^change:c2$/);
  await expect(page.getByTestId("hunk-f1h0")).toBeAttached();
  await expect(page.getByTestId("place-crumbs")).toContainText("Patch");
});

test("diff text is selectable without panning the canvas", async ({ page }) => {
  await page.goto(URL);
  await openChange(page, "change-c2");
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
  await openChange(page);
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.getByTestId("change-c1").locator(".explanation").dblclick();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
});

test("spec text is selectable without panning", async ({ page }) => {
  await page.goto(URL);
  await openChange(page, "change-c2");
  const spec = page.getByTestId("spec-chip-R");
  await expandItem(spec);
  const before = await page.locator(".react-flow__viewport").getAttribute("style");
  await spec.locator(".spec-section-text p").first().dblclick({ position: { x: 4, y: 6 } });
  const inlineSelected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(inlineSelected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
  await openInPanel(spec);
  await page.getByTestId("spec-panel").locator(".spec-section-text p").first().dblclick({ position: { x: 4, y: 6 } });
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.length).toBeGreaterThan(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(before);
});

test("interacting with a node selects and raises it until selection moves or clears", async ({ page }) => {
  await page.goto(URL);
  await openPatch(page, 0);
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

  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 80 } });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
});

const flowX =(page: Page, id: string) =>
  page.getByTestId(`change-${id}`).locator("..").evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41);

test("dragging a node by its title survives a relayout until reset", async ({ page }) => {
  await page.goto(URL);
  await openPatch(page, 0);
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

  await page.keyboard.press("Control+=");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-scale"))).toBe("1.15");
  await page.waitForTimeout(400);
  const dragged = await relX();
  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.waitForTimeout(400);
  expect(Math.abs(dragged - await relX() - offset)).toBeLessThan(1);
});

test("spec sections are inline items of the change and diff lines link to Searchfox", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId("summary").locator(".spec-status")).toContainText("Specs: 1 cited in code");
  await expect(page.getByTestId("change-c1").locator(".explanation a.code-link")).toHaveCount(0);
  await openChange(page, "change-c2");
  const spec = page.getByTestId("spec-chip-R");
  await expect(spec).toBeVisible();
  await expect(page.getByTestId("hunk-f1h0").locator("td.ln a").first())
    .toHaveAttribute("href", "https://searchfox.org/firefox-main/rev/5555555555555555555555555555555555555555/dom/navigation/Navigation.cpp#200");
  await expect(page.getByTestId("hunk-f1h0").locator(".sf-link"))
    .toHaveAttribute("href", "https://searchfox.org/firefox-main/rev/5555555555555555555555555555555555555555/dom/navigation/Navigation.cpp#200");
  await expect(page.getByTestId("hunk-f1h0").locator(".sf-link"))
    .toHaveAttribute("title", "Searchfox at the patch's base");
  await openInPanel(spec);
  const panel = page.getByTestId("spec-panel");
  await expect(panel.getByRole("link", { name: /open spec/ })).toBeAttached();
  await expect(panel.getByText("cited in code")).toBeVisible();
  await expect(panel.getByText("unverified")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: /Code: dom\/navigation\/Navigation.cpp:120/ })).toBeAttached();
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
  await page.waitForTimeout(400);
  const all = await page.locator(".react-flow__node").count();
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(all);
  await openChange(page, "change-c2");
  // Every node of the place stays mounted, also off-screen, so the layout can use its measured size.
  const here = await page.locator(".react-flow__node").count();
  expect(here).toBeLessThan(all);
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(here);
});

const zoomOf = (page: Page) => page.locator(".react-flow__viewport").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

test("guide Next from a far-away view keeps the zoom and centers the step", async ({ page }) => {
  await page.goto(URL);
  await openPatch(page, 0);
  await page.locator(".canvas").focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
  await waitForCanvasSettled(page);
  const zoom = await zoomOf(page);
  await page.getByRole("button", { name: "Next step" }).click();
  await waitForCanvasSettled(page);
  const change = page.getByTestId("change-c1");
  expect(await zoomOf(page)).toBeCloseTo(zoom, 5);
  const box = (await change.boundingBox())!;
  const pane = (await page.locator(".react-flow").boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (pane.x + pane.width / 2))).toBeLessThan(5);
});

test("view, guide step, and collapse state persist across reloads", async ({ page }) => {
  await page.goto(URL);
  await openPatch(page, 0);
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
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", "patch:0");
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

test("resizing a node persists its width and reset restores defaults", async ({ page }) => {
  await page.goto(URL);
  await openPatch(page, 0);
  const first = page.getByTestId("change-c1").locator("..");
  const second = page.getByTestId("change-c2").locator("..");
  await first.click();
  const flowWidth = async (node: Locator) => (await node.boundingBox())!.width / await zoomOf(page);
  const beforeWidth = await flowWidth(first);
  const handle = first.locator(".react-flow__resize-control.line.right");
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => flowWidth(first)).toBeGreaterThan(beforeWidth + 60);
  await waitForCanvasSettled(page);
  const resized = (await first.boundingBox())!;
  const below = (await second.boundingBox())!;
  expect(below.y).toBeGreaterThanOrEqual(resized.y + resized.height);

  const resizedWidth = await flowWidth(first);
  await page.reload();
  await openPatch(page, 0);
  const reloadedFirst = page.getByTestId("change-c1").locator("..");
  await expect.poll(() => flowWidth(reloadedFirst)).toBeCloseTo(resizedWidth, -1);
  await openChange(page);
  await expect(reloadedFirst).toHaveCSS("width", /\d+px/);
  const codeWidth = await flowWidth(reloadedFirst);
  expect(codeWidth).toBeCloseTo(resizedWidth, -1);
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Reset layout" }).click();
  await expect.poll(() => flowWidth(reloadedFirst)).toBeLessThan(resizedWidth - 60);
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
  await openPatch(page, 0);
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
  await openPatch(page, 0);
  await expect.poll(async () => (await page.getByTestId("change-c1").locator("..").boundingBox())!.height).toBeCloseTo(shortened.height, -1);
});

test("a node drags from anywhere on its title bar, including the strip above the title text", async ({ page }) => {
  await page.goto(URL);
  await openPatch(page, 0);
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
