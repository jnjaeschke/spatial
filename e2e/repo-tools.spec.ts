import { test, expect } from "@playwright/test";
import { setLevel } from "./canvas.ts";

test("chat can request a denylisted repo server and enable it for that thread", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  const title = `repo-tools-${crypto.randomUUID()}`;
  await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: fixture.worktree, title } });
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await setLevel(page, "concept");
  const finding = page.locator('[data-testid^="finding-"]').first();
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.getByLabel("message").fill("ENABLE-DEVTOOLS-PLEASE");
  await finding.getByRole("button", { name: "Send" }).click();

  const enable = finding.getByRole("button", { name: "Enable" });
  await expect(enable).toBeVisible({ timeout: 10_000 });
  await page.mouse.move(400, 780);
  await page.mouse.wheel(0, 500);
  await enable.click();
  await expect(enable).not.toBeVisible({ timeout: 5_000 });
});
