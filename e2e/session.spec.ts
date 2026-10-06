import { test, expect } from "@playwright/test";
import { setLevel, startReview } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

test("the fixture session shows the finished analysis", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await setLevel(page, "code");
  await expect(page.getByTestId("task-narrate")).toHaveAttribute("data-status", "succeeded");
  await expect(page.getByText("Edits a and adds c.")).toBeVisible();
  await expect(page.getByTestId("analysis")).toHaveCount(0);
});

test("expand context around a hunk", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await setLevel(page, "code");
  const hunk = page.getByTestId("hunk-f0h0");
  await expect(hunk.getByText("line 27", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 26", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↓ 20 lines" }).click();
  await expect(hunk.getByText("line 53", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 54", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 7", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 6", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 1", { exact: true })).toBeAttached();
  await expect(hunk.getByRole("button", { name: "↑ 20 lines" })).toHaveCount(0);
  const below = hunk.getByRole("button", { name: "↓ 20 lines" });
  for (let i = 0; i < 5 && (await below.boundingBox())!.y > 800; i++) {
    const x = await page.evaluate(() => [...Array(60).keys()].map((i) => 10 + i * 20).find((x) => document.elementFromPoint(x, 650)?.classList.contains("react-flow__pane")));
    expect(x).toBeDefined();
    await page.mouse.move(x!, 650);
    await page.mouse.down();
    await page.mouse.move(x!, 400, { steps: 5 });
    await page.mouse.move(x!, 150, { steps: 5 });
    await page.mouse.up();
  }
  await below.click();
  await expect(hunk.getByText("line 60", { exact: true })).toBeAttached();
  await expect(hunk.getByRole("button", { name: "↓ 20 lines" })).toHaveCount(0);
});

test("a failed analysis shows the error and a retry", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD..HEAD~1");
  await expect(page.getByTestId("task-importDiff").first()).toHaveAttribute("data-status", "failed", { timeout: 10_000 });
  await expect(page.getByTestId("analysis")).toContainText(/is not an ancestor of/);
  await expect(page.getByTestId("analysis")).toHaveAttribute("data-state", "failed");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("task-importDiff")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByTestId("analysis")).toContainText(/is not an ancestor of/);
});

test("open the whole file in the side panel", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await setLevel(page, "code");
  await page.getByTestId("hunk-f0h0").getByRole("button", { name: "a.txt" }).click();
  const panel = page.getByTestId("file-panel");
  await expect(panel.getByText("line 1", { exact: true })).toBeAttached();
  await expect(panel.getByText("line 60", { exact: true })).toBeAttached();
  await expect(panel.getByText("THIRTY", { exact: true })).toBeInViewport();
  await expect(panel.locator("td.code").first()).toHaveCSS("white-space", "pre-wrap");
  await expect(panel.locator("tr.add")).toHaveCSS("background-color", "rgb(230, 255, 236)");
  await panel.getByRole("button", { name: "Close file" }).click();
  await expect(panel).toHaveCount(0);
});

test("code span in an explanation opens the file at the matching line", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await setLevel(page, "concept");
  await page.getByTestId("change-c1").getByRole("button", { name: "THIRTY" }).click();
  const focus = page.getByTestId("file-panel").locator("tr.focus");
  await expect(focus).toHaveText(/THIRTY/);
  await expect(focus).toBeInViewport();
});
