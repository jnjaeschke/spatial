import { expect, type Page } from "@playwright/test";

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
