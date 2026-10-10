import { test, expect, type Page } from "@playwright/test";
import { openChange } from "./canvas.ts";

const URL = "http://localhost:5174/?fixture=1";

const onScreenCodeSize = (page: Page) => page.getByTestId("hunk-f1h0").locator("td.code").first().evaluate((el) =>
  parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);

const textScaleVar = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-scale"));

test("Ctrl+= grows node text and the fit keeps it readable", async ({ page }) => {
  await page.goto(URL);
  await openChange(page, "change-c2");
  await page.waitForTimeout(500);
  const change = page.getByTestId("change-c2");
  await expect(change).toHaveCSS("font-size", "13px");
  const before = await onScreenCodeSize(page);

  for (let i = 0; i < 4; i++) await page.keyboard.press("Control+=");
  await expect.poll(() => textScaleVar(page)).toBe("1.6");
  expect(await page.evaluate(() => localStorage.getItem("spatial.textScale"))).toBe("1.6");
  await expect.poll(async () => Math.abs(
    parseFloat(await change.evaluate((el) => getComputedStyle(el).fontSize)) - 20.8,
  )).toBeLessThanOrEqual(1 / 64);
  await expect(change).toHaveAttribute("data-level", "code");
  await expect.poll(async () => (await onScreenCodeSize(page)) / before, { timeout: 5_000 }).toBeGreaterThan(1.3);
  await expect(change).toHaveAttribute("data-level", "code");

  await page.keyboard.press("Control+0");
  await expect.poll(() => textScaleVar(page)).toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("spatial.textScale"))).toBeNull();
  await expect(change).toHaveCSS("font-size", "13px");
});

test("text scale persists across reloads and Ctrl+- is clamped at the smallest size", async ({ page }) => {
  await page.goto(URL);
  await page.keyboard.press("Control+=");
  await page.reload();
  await expect(page.getByTestId("change-c1")).toBeVisible();
  expect(await textScaleVar(page)).toBe("1.15");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Control+-");
  await expect.poll(() => textScaleVar(page)).toBe("0.9");
});
