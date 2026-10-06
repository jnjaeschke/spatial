import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { setLevel, startReview } from "./canvas.ts";

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
  await setLevel(page, "code");

  await expect.poll(() => page.evaluate(painted, "syn-keyword")).toEqual(expect.arrayContaining(["static", "const", "return"]));
  await expect.poll(() => page.evaluate(painted, "syn-number")).toContain("2");
});
