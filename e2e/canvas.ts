import { expect, type Locator, type Page } from "@playwright/test";

export async function startReview(page: Page, repoDir: string, range: string): Promise<string> {
  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(repoDir)}`);
  const box = page.getByLabel("start");
  await box.fill(`/review ${range}`);
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  return new URL(page.url()).searchParams.get("session")!;
}

/** Resolves once the canvas viewport transform has not changed for a number of consecutive animation frames. */
export async function waitForCanvasSettled(page: Page, frames = 20): Promise<void> {
  await page.locator(".react-flow__viewport").waitFor();
  await page.evaluate((frames) => new Promise<void>((resolve) => {
    const viewport = document.querySelector(".react-flow__viewport")!;
    let last = "";
    let stable = 0;
    const tick = () => {
      const now = getComputedStyle(viewport).transform;
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), frames);
}

const placeOf = (page: Page) => page.locator(".canvas").getAttribute("data-place");

async function drillInto(page: Page, node: Locator, place: RegExp): Promise<void> {
  await revealNode(page, node);
  await node.locator("> .title").dblclick({ position: { x: 12, y: 8 } });
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", place);
  await waitForCanvasSettled(page);
}

/** Goes one place up through the breadcrumb: the crumb before the current place. */
export async function placeUp(page: Page): Promise<void> {
  const before = await placeOf(page);
  await page.getByTestId("place-crumbs").locator("button").last().click();
  await expect(page.locator(".canvas")).not.toHaveAttribute("data-place", before!);
  await waitForCanvasSettled(page);
}

/** Opens commit `n` of a stack; a single-commit diff is already at its only patch. */
export async function openPatch(page: Page, n: number): Promise<void> {
  const card = page.getByTestId(`commit-${n}`);
  await page.locator(".canvas[data-place]").waitFor();
  await waitForCanvasSettled(page);
  for (let place = await placeOf(page); place !== `patch:${n}`; place = await placeOf(page)) {
    if (place === "stack") await drillInto(page, card, new RegExp(`^patch:${n}$`));
    else if (place === "patch:0" && await page.getByTestId("commit-0").count() === 0) return;
    else await placeUp(page);
  }
}

/** Opens the Change place of the change card `changeTestId` (e.g. `change-c1`), starting from any place that can reach it. */
export async function openChange(page: Page, changeTestId = "change-c1"): Promise<void> {
  await page.locator(".canvas[data-place]").waitFor();
  await waitForCanvasSettled(page);
  const id = changeTestId.slice("change-".length);
  const node = page.getByTestId(changeTestId);
  for (let place = await placeOf(page); !place!.endsWith(`#${id}`); place = await placeOf(page)) {
    if (place!.startsWith("change:")) await placeUp(page);
    else if (place === "stack") throw new Error(`open the patch of ${changeTestId} first`);
    else await drillInto(page, node, /^change:/);
  }
}

/**
 * Pans with the arrow keys until the target is inside the canvas pane (its top-left corner, when it is larger than
 * the pane). While the target is not in the DOM yet, the direction is probed: up, left, down, right.
 */
export async function revealNode(page: Page, target: string | Locator): Promise<void> {
  const node = (typeof target === "string" ? page.getByTestId(target) : target).first();
  const pane = page.locator(".react-flow");
  await waitForCanvasSettled(page);
  await page.locator(".canvas").focus();
  const correction = async (): Promise<string | null> => {
    if (await node.count() === 0) return "";
    const box = (await node.boundingBox())!;
    const paneBox = (await pane.boundingBox())!;
    if (box.y < paneBox.y) return "ArrowUp";
    if (box.x < paneBox.x) return "ArrowLeft";
    // A node larger than the pane counts as revealed once its top-left half is in view; an exact fit is not reachable with arrow steps.
    if (box.y + Math.min(box.height, paneBox.height / 2) > paneBox.y + paneBox.height) return "ArrowDown";
    if (box.x + Math.min(box.width, paneBox.width / 2) > paneBox.x + paneBox.width) return "ArrowRight";
    return null;
  };
  // A top panel (the layer toggles) over a revealed button intercepts its clicks.
  const clearTopPanels = async () => {
    for (let i = 0; i < 10; i++) {
      const box = (await node.boundingBox())!;
      const paneBox = (await pane.boundingBox())!;
      const panels = await page.locator(".react-flow__panel.top").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map(({ left, right, bottom }) => ({ left, right, bottom })));
      const covered = panels.some((p) => p.left < box.x + box.width && box.x < p.right && box.y < p.bottom);
      if (!covered || box.y + box.height > paneBox.y + paneBox.height) return;
      await page.keyboard.press("ArrowUp");
    }
  };
  const opposite: Record<string, string> = { ArrowUp: "ArrowDown", ArrowDown: "ArrowUp", ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };
  const probes = 40;
  for (const probe of Object.keys(opposite)) {
    let pressed = 0;
    for (; pressed < probes; pressed++) {
      const key = await correction();
      if (key === null) return clearTopPanels();
      if (key !== "") break;
      await page.keyboard.press(probe);
    }
    if (pressed < probes) {
      for (let i = 0; i < 200; i++) {
        const key = await correction();
        if (key === null) return clearTopPanels();
        if (key === "") break;
        await page.keyboard.press(key);
      }
    }
    for (let i = 0; i < pressed; i++) await page.keyboard.press(opposite[probe]!);
  }
  throw new Error(`could not reveal ${typeof target === "string" ? target : target.toString()}`);
}
