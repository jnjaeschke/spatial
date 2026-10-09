import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchBugsWith, parseBugMarkdown } from "../../../src/plugins/review/tasks/fetch-bugs/task.ts";

test("parse Bugzilla markdown fields", () => {
  assert.deepEqual(parseBugMarkdown(`# Bug 4242 - c.txt is missing\n\n- **Status**: ASSIGNED\n- **Product**: Core\n- **Component**: DOM: Core & HTML`), {
    title: "c.txt is missing", status: "ASSIGNED", component: "Core :: DOM: Core & HTML",
  });
});

test("fetchBugs fetches distinct commit bugs in order and stores errors", async () => {
  const repo = mkdtempSync(join(tmpdir(), "fetch-bugs-"));
  writeFileSync(join(repo, "mach"), ""); writeFileSync(join(repo, "moz.build"), "");
  const artifacts: any[] = [];
  const calls: number[] = [];
  const ctx: any = {
    repo, repoMcp: { moz: { type: "http", url: "http://moz.test/mcp" } }, signal: new AbortController().signal,
    artifacts: {
      view: () => ({ artifacts: [{ type: "Diff", id: "D", data: { commits: [{ subject: "Bug 1 - first" }, { subject: "Bug 2 - second" }, { subject: "bug 1 repeat" }] } }] }),
      get: () => ({ type: "Diff", data: { commits: [{ subject: "Bug 1 - first" }, { subject: "Bug 2 - second" }, { subject: "bug 1 repeat" }] } }),
      put: (_type: string, _status: string, data: unknown) => { artifacts.push(data); return { id: `R${artifacts.length}` }; },
    },
  };
  try {
    const task = fetchBugsWith(async (url, bug) => {
      assert.equal(url, "http://moz.test/mcp"); calls.push(bug);
      if (bug === 2) throw new Error("unavailable");
      return `# Bug ${bug} - Bug ${bug}\n- **Status**: NEW\n- **Product**: Core\n- **Component**: DOM`;
    });
    const out = await task.run(ctx, { diffId: "D" });
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(out.reportIds, ["R1", "R2"]);
    assert.deepEqual(artifacts[1], { bug: 2, title: "", status: "", component: "", markdown: "", error: "unavailable" });
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("fetchBugs is a no-op outside Gecko or without an HTTP moz server", async () => {
  const repo = mkdtempSync(join(tmpdir(), "fetch-bugs-noop-"));
  const emptyCtx: any = { repo, repoMcp: { moz: { type: "http", url: "http://moz.test" } } };
  try { assert.deepEqual(await fetchBugsWith(async () => "").run(emptyCtx, { diffId: "unused" }), { reportIds: [] }); }
  finally { rmSync(repo, { recursive: true, force: true }); }
  const gecko = mkdtempSync(join(tmpdir(), "fetch-bugs-noop-"));
  writeFileSync(join(gecko, "mach"), ""); writeFileSync(join(gecko, "moz.build"), "");
  try { assert.deepEqual(await fetchBugsWith(async () => "").run({ ...emptyCtx, repo: gecko, repoMcp: { moz: { type: "stdio" } } }, { diffId: "unused" }), { reportIds: [] }); }
  finally { rmSync(gecko, { recursive: true, force: true }); }
});
