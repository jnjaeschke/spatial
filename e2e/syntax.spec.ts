import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { openChange, startReview } from "./canvas.ts";
import { git as runGit, makeRepo } from "./repo.ts";

let dir = "";

test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

const painted = (name: string) => [...(CSS.highlights.get(name) ?? [])].map((range) => (range as Range).toString());

test("C++ code in a hunk is painted through the highlight registry", async ({ page }) => {
  dir = makeRepo("spatial-syntax-", { "a.cpp": "int f() {\n  return 1;\n}\n" });
  runGit(dir, "checkout", "-b", "feature");
  writeFileSync(join(dir, "a.cpp"), "int f() {\n  static const int x = 2;\n  return x;\n}\n");
  writeFileSync(join(dir, "c.txt"), "c\n");
  runGit(dir, "add", "-A");
  runGit(dir, "commit", "-m", "change");

  await startReview(page, dir, "main..feature");
  await openChange(page);

  await expect.poll(() => page.evaluate(painted, "syn-keyword")).toEqual(expect.arrayContaining(["static", "const", "return"]));
  await expect.poll(() => page.evaluate(painted, "syn-number")).toContain("2");
});

test("introduced symbols show all sites in a hover card and jump to the selected site", async ({ page }) => {
  dir = makeRepo("spatial-symbols-", { "api.h": "void existing();\n", "api.cpp": '#include "api.h"\nvoid existing() {}\n', "caller.cpp": '#include "api.h"\nvoid caller() {}\n' });
  runGit(dir, "checkout", "-b", "feature");
  writeFileSync(join(dir, "api.h"), "void existing();\nvoid introducedFunction();\n");
  writeFileSync(join(dir, "api.cpp"), '#include "api.h"\nvoid existing() {}\nvoid introducedFunction() {}\n');
  writeFileSync(join(dir, "caller.cpp"), '#include "api.h"\nvoid caller() { introducedFunction(); }\n');
  runGit(dir, "add", "-A");
  runGit(dir, "commit", "-m", "Introduce function and call");

  await startReview(page, dir, "main..feature");
  await openChange(page);
  await expect.poll(() => page.evaluate(painted, "sym-this")).toContain("introducedFunction");
  const target = page.locator(".hunk-node td.code").filter({ hasText: "introducedFunction" }).first();
  const point = await target.evaluate((cell) => {
    const text = cell.firstChild!;
    const start = text.textContent!.indexOf("introducedFunction");
    const range = document.createRange();
    range.setStart(text, start + 5);
    range.setEnd(text, start + 6);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await expect.poll(() => target.evaluate((cell) => getComputedStyle(cell).cursor)).toBe("pointer");
  const card = page.getByTestId("symbol-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("symbol-site-0")).toContainText("defined in api.cpp:3");
  await expect(card.getByTestId("symbol-site-1")).toContainText("declared in api.h:2");
  await expect(card.locator("pre").first()).toHaveText("void introducedFunction() {}");
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(point.x + 100, point.y + 100);
  await expect(card).toBeVisible();
  await card.getByTestId("symbol-site-0").click();
  await expect(page.getByTestId("symbol-panel")).toContainText("introducedFunction");
  await expect(page.getByTestId("symbol-panel").locator("tr[data-new=\"3\"]")).toHaveClass(/focus/);
  await page.getByTestId("symbol-go-to-change").click();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", /^change:/);
  await expect(page.locator(`.canvas tr[data-anchor$="#f0h0"][data-new="3"]`)).toHaveClass(/focus/);
});
