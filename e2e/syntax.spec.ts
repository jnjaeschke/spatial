import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { openChange, startReview } from "./canvas.ts";

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? 4178}`;
let dir = "";

test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

function git(...args: string[]) {
  execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args]);
}

const painted = (name: string) => [...(CSS.highlights.get(name) ?? [])].map((range) => (range as Range).toString());

test("C++ code in a hunk is painted through the highlight registry", async ({ page, request }) => {
  dir = mkdtempSync(join(tmpdir(), "spatial-syntax-"));
  git("init", "-b", "main");
  writeFileSync(join(dir, "a.cpp"), "int f() {\n  return 1;\n}\n");
  git("add", "-A");
  git("commit", "-m", "base");
  git("checkout", "-b", "feature");
  writeFileSync(join(dir, "a.cpp"), "int f() {\n  static const int x = 2;\n  return x;\n}\n");
  writeFileSync(join(dir, "c.txt"), "c\n");
  git("add", "-A");
  git("commit", "-m", "change");

  await startReview(page, dir, "main..feature");
  await openChange(page);

  await expect.poll(() => page.evaluate(painted, "syn-keyword")).toEqual(expect.arrayContaining(["static", "const", "return"]));
  await expect.poll(() => page.evaluate(painted, "syn-number")).toContain("2");
});

test("introduced symbols are marked, peek at their definition, and jump to its change", async ({ page }) => {
  dir = mkdtempSync(join(tmpdir(), "spatial-symbols-"));
  git("init", "-b", "main");
  writeFileSync(join(dir, "api.cpp"), "void existing() {}\n");
  writeFileSync(join(dir, "caller.cpp"), "void caller() {}\n");
  git("add", "-A");
  git("commit", "-m", "base");
  git("checkout", "-b", "feature");
  writeFileSync(join(dir, "api.cpp"), "void existing() {}\nvoid introducedFunction() {}\n");
  writeFileSync(join(dir, "caller.cpp"), "void caller() { introducedFunction(); }\n");
  git("add", "-A");
  git("commit", "-m", "Introduce function and call");

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
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("symbol-panel")).toContainText("introducedFunction");
  await expect(page.getByTestId("symbol-panel").locator("tr[data-new=\"2\"]")).toHaveClass(/focus/);
  await page.getByTestId("symbol-go-to-change").click();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", /^change:/);
  await expect(page.locator(`.canvas tr[data-anchor$="#f0h0"][data-new="2"]`)).toHaveClass(/focus/);
});
