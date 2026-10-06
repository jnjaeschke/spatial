import type { Page } from "@playwright/test";

export type Level = "patch" | "concept" | "code";
const ORDER: Level[] = ["patch", "concept", "code"];

export async function setLevel(page: Page, level: Level, testId = "change-c1"): Promise<void> {
  const node = page.getByTestId(testId);
  for (let i = 0; i < 20; i++) {
    const current = await node.getAttribute("data-level") as Level | null;
    if (current === level) return;
    const zoomOut = current !== null && ORDER.indexOf(current) > ORDER.indexOf(level);
    await page.getByRole("button", { name: zoomOut ? "zoom out" : "zoom in" }).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`never reached level ${level}`);
}
