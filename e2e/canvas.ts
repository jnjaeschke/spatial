import { expect, type Locator, type Page } from "@playwright/test";

export async function startReview(page: Page, repoDir: string, range: string): Promise<string> {
  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(repoDir)}`);
  const box = page.getByLabel("start");
  await box.fill(`/review ${range}`);
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  return new URL(page.url()).searchParams.get("session")!;
}

export type Level = "patch" | "concept" | "code";
const ORDER: Level[] = ["patch", "concept", "code"];

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

/**
 * Zooms until the node shows `level`. Waits for the viewport to settle before each read, so a fit-driven level flip
 * cannot race the clicks. The node must be rendered on entry; it is re-found by panning if zooming moves it away.
 */
export async function setLevel(page: Page, level: Level, testId = "change-c1"): Promise<void> {
  const node = page.getByTestId(testId);
  await node.waitFor();
  await waitForCanvasSettled(page);
  for (let i = 0; i < 20; i++) {
    await waitForCanvasSettled(page);
    if (i > 0 && await node.count() === 0) await revealNode(page, node);
    const current = await node.getAttribute("data-level") as Level | null;
    if (current === level) return;
    const zoomOut = current !== null && ORDER.indexOf(current) > ORDER.indexOf(level);
    await page.getByRole("button", { name: zoomOut ? "zoom out" : "zoom in" }).click();
  }
  throw new Error(`never reached level ${level}`);
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
    if (box.y + Math.min(box.height, paneBox.height) > paneBox.y + paneBox.height) return "ArrowDown";
    if (box.x + Math.min(box.width, paneBox.width) > paneBox.x + paneBox.width) return "ArrowRight";
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
