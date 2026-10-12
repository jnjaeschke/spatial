import { test, expect, type Page } from "@playwright/test";
import { makeRepo } from "../test/helpers/git-fixture.ts";
import { openPatch, startReview, waitForCanvasSettled } from "./canvas.ts";

async function explore(page: Page, ref: string) {
  const repo = makeRepo();
  repo.commit({ "a.txt": "a\n" }, "base");
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(repo.dir)}`);
  const box = page.getByLabel("start");
  await box.fill(`/explore ${ref}`);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const algorithm = page.getByTestId(`spec-box-${ref}`);
  await expect(algorithm).toBeVisible({ timeout: 15_000 });
  return algorithm;
}

async function exploreNavigate(page: Page) {
  const navigate = await explore(page, "HTML#navigate");
  await expect(navigate.getByTestId("spec-summary")).toBeVisible({ timeout: 15_000 });
  await waitForCanvasSettled(page);
  return navigate;
}

test("explore HTML#navigate from the start screen: a link opens a box with an edge, closing removes it", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  await expect(navigate.locator('li[data-step="24.9.1"]')).toBeAttached();
  await navigate.locator('li[data-step="2"]').getByTestId("spec-link").first().click();
  const target = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params");
  await expect(target).toBeVisible();
  await expect(page.locator(".react-flow__edge-text", { hasText: "step 2" })).toHaveCount(1);
  await target.getByRole("button", { name: "Close HTML#snapshotting-source-snapshot-params" }).click();
  await expect(target).toHaveCount(0);
  await expect(page.locator(".react-flow__edge-text", { hasText: "step 2" })).toHaveCount(0);
  await navigate.getByRole("button", { name: "Reopen 1 closed box" }).click();
  await expect(target).toBeVisible();
});

test("steps go into a trace, export as markdown, and show as a sequence diagram", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  const add = async (box: ReturnType<Page["getByTestId"]>, step: string, count: number) => {
    await box.locator(`li[data-step="${step}"]`).first().hover();
    await box.getByRole("button", { name: `Add step ${step} to trace` }).click();
    await expect(page.getByTestId("traces-toggle")).toHaveText(`Traces · ${count}`);
  };
  await add(navigate, "2", 1);
  await navigate.locator('li[data-step="2"]').getByTestId("spec-link").first().click();
  const target = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params");
  await expect(target).toBeVisible();
  await add(target, "1", 2);
  await page.getByRole("button", { name: "Fit view" }).click();
  await add(navigate, "3", 3);
  await expect(page.locator(".react-flow__edge.trace-hop")).toHaveCount(2);
  await page.getByTestId("traces-toggle").click();
  const panel = page.getByTestId("trace-panel");
  await expect(panel.getByTestId(/^trace-entry-/)).toHaveCount(3);
  await panel.getByRole("button", { name: "Export" }).click();
  await expect(page.getByTestId("trace-export").getByLabel("Trace markdown")).toHaveValue("[navigate step 2](https://html.spec.whatwg.org/#navigate)\n→ [snapshotting-source-snapshot-params step 1](https://html.spec.whatwg.org/#snapshotting-source-snapshot-params)\n→ [navigate step 3](https://html.spec.whatwg.org/#navigate)");
  await page.getByTestId("trace-export").getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Trace sequence" }).click();
  const sequence = page.getByTestId("trace-sequence");
  await expect(sequence.locator('.sequence-step[data-kind="call"]')).toHaveCount(1);
  await expect(sequence.locator('.sequence-step[data-kind="return"]')).toHaveCount(1);
  await sequence.locator('.sequence-step[data-kind="return"]').click();
  await expect(page.getByTestId("spec-box-HTML#navigate").locator('li[data-step="3"]')).toHaveClass(/step-focus/);
});

test("a review chat proposes an exploration; Explore opens the explorer and Back returns to the review place", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  await startReview(page, sessions.find((s) => s.title === "fixture")!.worktree, "HEAD~1..HEAD");
  await openPatch(page, 0);
  const place = await page.locator(".canvas").getAttribute("data-place");
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.getByTestId("change-c1").locator(".inline-item.kind-chat");
  await chat.getByLabel("message").fill("SPEC-EXPLORE-PLEASE");
  await chat.getByRole("button", { name: "Send" }).click();
  const explore = chat.getByTestId("spec-explore");
  await expect(explore).toHaveText("Explore HTML#navigate", { timeout: 15_000 });
  await explore.click();
  await expect(page).toHaveURL(/[?&]view=spec/);
  await expect(page.getByTestId("spec-box-HTML#navigate")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Spec explorer" })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page).not.toHaveURL(/view=spec/);
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", place!);
  await expect(page.getByTestId("change-c1").locator(".inline-item.kind-chat")).toBeVisible();
});

test("a review chat question about a spec algorithm is traced after Explore", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  await startReview(page, sessions.find((s) => s.title === "fixture")!.worktree, "HEAD~1..HEAD");
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const chat = page.getByTestId("change-c1").locator(".inline-item.kind-chat");
  await chat.getByLabel("message").fill("SPEC-TRACE-PLEASE");
  await chat.getByRole("button", { name: "Send" }).click();
  const explore = chat.getByTestId("spec-explore");
  await expect(explore).toHaveText("Explore HTML#navigate and trace", { timeout: 15_000 });
  await explore.click();
  await expect(page).toHaveURL(/[?&]view=spec/);
  await expect(page.getByTestId("trace-panel").getByTestId("trace-verdict")).toHaveText("fails · 4 steps, 1 unverified hop, 0 unsupported notes", { timeout: 15_000 });
});

test("an algorithm box numbers its steps, and selected step text can be asked about", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  const first = navigate.locator('li[data-step="1"]').first();
  expect(await first.evaluate((li) => getComputedStyle(li, "::before").content)).toBe('"1" "."');
  const text = (await first.locator("p").first().boundingBox())!;
  await page.mouse.move(text.x + 2, text.y + 8);
  await page.mouse.down();
  await page.mouse.move(text.x + 120, text.y + 8, { steps: 8 });
  await page.mouse.up();
  const ask = page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true });
  await expect(ask).toBeVisible();
  await ask.click();
  await expect(page.locator(".chat-quote").last()).toBeVisible();
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "message");
});

test("an algorithm box shows where Gecko implements it, with step links and tests", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  const rev = "0f".repeat(20);
  const strip = navigate.getByTestId("spec-impl");
  await expect(strip.getByRole("link", { name: "Fake::Navigate" })).toHaveAttribute("href", `https://searchfox.org/mozilla-central/rev/${rev}/dom/fake/Fake.cpp#4`, { timeout: 15_000 });
  await expect(navigate.locator('li[data-step="1"]').getByTestId("spec-g-link").first()).toHaveAttribute("href", `https://searchfox.org/mozilla-central/rev/${rev}/dom/fake/Fake.cpp#5`);
  const reworded = navigate.locator('li[data-step="2"]').getByTestId("spec-g-link").first();
  await expect(reworded).toHaveText("Gecko");
  await reworded.hover();
  const peek = page.getByTestId("code-peek");
  await expect(peek).toContainText("The comment's wording differs from step 2.");
  await expect(peek.locator(".peek-line.at")).toContainText("Add the files.");
  await strip.getByRole("button", { name: "1 test" }).click();
  await expect(navigate.getByRole("link", { name: "testing/web-platform/tests/fake/navigate.html:2" })).toHaveAttribute("href", `https://searchfox.org/mozilla-central/rev/${rev}/testing/web-platform/tests/fake/navigate.html#2`);
});

test("Find in Gecko proposes a verified place, and Confirm keeps it", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  await navigate.locator('li[data-step="2"]').getByTestId("spec-link").first().click();
  const strip = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params").getByTestId("spec-impl");
  await strip.getByRole("button", { name: "Find in Gecko" }).click({ timeout: 15_000 });
  const proposal = strip.getByRole("link", { name: "Fake::Snapshot" });
  await expect(proposal).toHaveClass(/method-llm/, { timeout: 15_000 });
  await strip.getByRole("button", { name: "Confirm Fake::Snapshot" }).click();
  await expect(proposal).toHaveClass(/method-user/);
  await expect(strip.getByRole("button", { name: "Confirm Fake::Snapshot" })).toHaveCount(0);
  await page.reload();
  const reloaded = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params").getByTestId("spec-impl");
  await expect(reloaded.getByRole("link", { name: "Fake::Snapshot" })).toHaveClass(/method-user/, { timeout: 15_000 });
});

test("Reject removes a proposal for good", async ({ page }) => {
  const demo = await explore(page, "HTML#reject-demo");
  const strip = demo.getByTestId("spec-impl");
  await strip.getByRole("button", { name: "Find in Gecko" }).click({ timeout: 15_000 });
  await expect(strip.getByRole("link", { name: "Fake::Snapshot" })).toHaveClass(/method-llm/, { timeout: 15_000 });
  await expect(strip.getByText("AI-proposed")).toBeVisible();
  await expect(strip.getByText("Snapshots the source params.")).toBeVisible();
  await strip.getByRole("button", { name: "Reject Fake::Snapshot" }).click();
  await expect(strip.getByRole("link", { name: "Fake::Snapshot" })).toHaveCount(0);
  await page.reload();
  const reloaded = page.getByTestId("spec-box-HTML#reject-demo").getByTestId("spec-impl");
  await expect(reloaded.getByRole("button", { name: "Find in Gecko" })).toBeVisible({ timeout: 15_000 });
  await expect(reloaded.getByRole("link", { name: "Fake::Snapshot" })).toHaveCount(0);
});

test("implementations: the Gecko site from searchfox, a Blink proposal confirmed, WebKit says it found nothing", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  await navigate.getByTestId("impl-open").click();
  await expect(page).toHaveURL(/[?&]view=impl/);
  await expect(page).toHaveURL(/[?&]ref=HTML%23navigate/);
  const view = page.getByTestId("impl-view");
  await expect(view.getByTestId("impl-site-gecko").first()).toHaveText("Fake::Navigate", { timeout: 15_000 });
  await view.getByRole("button", { name: "Find in WebKit" }).click({ timeout: 15_000 });
  await expect(view.getByTestId("impl-not-found-webkit")).toHaveText("No WebKit match found", { timeout: 15_000 });
  await expect(view.getByRole("button", { name: "Find in WebKit" })).toBeVisible();
  await view.getByRole("button", { name: "Find in Blink" }).click();
  await expect(view.getByTestId("impl-site-blink")).toHaveText("FrameLoader::CancelProvisionalLoaderForNewNavigation", { timeout: 15_000 });
  await expect(view.locator(".impl-site.method-llm")).toHaveCount(1);
  await view.getByRole("button", { name: "Confirm FrameLoader::CancelProvisionalLoaderForNewNavigation" }).click();
  await expect(view.locator(".impl-site.method-llm")).toHaveCount(0);
  await expect(view.getByRole("button", { name: "Find in Blink" })).toHaveCount(0);
  await view.getByRole("button", { name: "Compare" }).click();
  const differences = view.getByTestId("impl-difference");
  await expect(differences).toHaveCount(1, { timeout: 15_000 });
  await expect(differences.first()).toContainText("Blink aborts the active document");
  await expect(differences.first()).toContainText("AI-written");
  await differences.first().hover();
  await expect(view.locator('tr[data-step="9"].highlight')).toHaveCount(1);
  await view.getByRole("button", { name: "Flag difference 1" }).click();
  await expect(differences).toHaveCount(0);
  await expect(view.locator("tr.highlight")).toHaveCount(0);
});

test("a claim check opens its trace: one unverified hop dashed on the map, the verdict with its counts", async ({ page }) => {
  await exploreNavigate(page);
  await page.getByTestId("traces-toggle").click();
  const panel = page.getByTestId("trace-panel");
  await panel.getByRole("button", { name: "Check claim" }).click();
  await panel.getByLabel("Question about the spec").fill("The source snapshot is taken before the origin snapshot.");
  await panel.getByRole("button", { name: "Ask" }).click();
  await expect(panel.getByTestId("trace-verdict")).toHaveText("fails · 4 steps, 1 unverified hop, 0 unsupported notes", { timeout: 15_000 });
  await expect(page.getByTestId("spec-box-HTML#setup")).toBeVisible();
  await expect(page.locator(".react-flow__edge.trace-hop")).toHaveCount(3);
  const dashed = page.locator(".react-flow__edge.trace-hop.unverified");
  await expect(dashed).toHaveCount(1);
  expect(await dashed.locator("title").textContent()).toBe("HTML#navigate step 3 does not link HTML#setup");
  await expect(panel.getByTestId("trace-entry-3").locator(".trace-unverified")).toHaveAttribute("title", "HTML#navigate step 3 does not link HTML#setup");
  await panel.getByLabel("Note for entry 4").fill("Runs the whole setup.");
  await panel.getByLabel("Note for entry 4").blur();
  await expect(panel.getByTestId("trace-outdated")).toBeVisible();
  await expect(page.locator(".react-flow__edge.trace-hop.unverified")).toHaveCount(0);
  await panel.getByRole("button", { name: "Re-check" }).click();
  await expect(page.locator(".react-flow__edge.trace-hop.unverified")).toHaveCount(1, { timeout: 15_000 });
  await expect(panel.getByTestId("trace-outdated")).toHaveCount(0);
});
