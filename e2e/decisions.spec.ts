import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function openNarrated(page: Page, request: APIRequestContext): Promise<void> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; repo: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  const title = `decisions-${crypto.randomUUID()}`;
  await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: fixture.repo, title } });
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 20 && (await page.getByTestId("change-c1").getAttribute("data-level")) !== "concept"; i++) {
    const level = await page.getByTestId("change-c1").getAttribute("data-level");
    await page.getByRole("button", { name: level === "code" ? "zoom out" : "zoom in" }).click();
    await page.waitForTimeout(150);
  }
}

test("accept a finding, edit comment, post to Phabricator", async ({ page, request }) => {
  await openNarrated(page, request);
  const finding = page.locator(".finding-node");
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await expect(finding).toContainText("No test for c");
  await finding.getByLabel("Accept finding").click();
  await expect(finding.getByLabel("Dismiss finding")).toBeVisible();
  await expect(finding.getByLabel("Accept finding")).toHaveCount(0);
  await expect(finding.getByLabel("Comment")).toHaveValue("No test was added for the c.txt change.", { timeout: 10_000 });
  const summary = page.getByTestId("summary");
  await expect(summary.getByText(/Post.*draft/)).toHaveCount(0);
  await finding.getByLabel("Comment").fill("Edited comment text.");
  await finding.getByRole("button", { name: "Save" }).click();
  const post = summary.getByText(/Post.*draft.*D1/);
  await expect(post).toBeVisible({ timeout: 5_000 });
  await page.mouse.move(400, 780);
  await page.mouse.wheel(0, 500);
  await post.click();
  await expect(summary.getByText(/Posted 1 draft to D1/)).toBeVisible({ timeout: 10_000 });
  await expect(finding.getByText("Posted to D1")).toBeVisible();
  await expect(summary.getByText(/Post.*draft.*D1/)).toHaveCount(0);
});

test("dismiss a finding makes it dimmed", async ({ page, request }) => {
  await openNarrated(page, request);
  const finding = page.locator(".finding-node");
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.getByLabel("Dismiss finding").click();
  await expect(finding).toHaveClass(/dismissed/);
  await finding.getByLabel("Accept finding").click();
  await expect(finding).not.toHaveClass(/dismissed/);
});
