import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBug } from "../../../src/plugins/review/tasks/summarize-bug/task.ts";

test("summarizeBug task is registered with its prompt and no tools", () => {
  assert.equal(summarizeBug.kind, "summarizeBug");
});

test("summarizeBug sends report markdown without tools and links the proposed summary", async () => {
  let request: any;
  let stored: any;
  let linked: any;
  const report = { id: "R", type: "BugReport", data: { bug: 4242, title: "c.txt missing", status: "ASSIGNED", component: "Core", markdown: "# Bug 4242 - c.txt is missing", error: null } };
  const ctx: any = {
    repo: "/repo", artifacts: { get: () => report, put: (_type: string, status: string, data: unknown, llm: unknown) => { stored = { status, data, llm }; return { id: "S" }; } },
    llm: { run: async (value: unknown) => { request = value; return { json: { summary: "The file is missing." }, selection: { backend: "claude", model: "sonnet", effort: "medium" } }; } },
    links: { put: (...args: unknown[]) => { linked = args; } },
  };
  await summarizeBug.run(ctx, { reportId: "R" });
  assert.equal(request.tools, "none");
  assert.match(request.system, /You summarize a Bugzilla bug/);
  assert.match(request.prompt, /c.txt is missing/);
  assert.deepEqual(stored, { status: "proposed", data: { bug: 4242, summary: "The file is missing." }, llm: { backend: "claude", model: "sonnet", effort: "medium" } });
  assert.deepEqual(linked, ["S", "R", "about"]);
});

test("summarizeBug skips reports whose fetch failed", async () => {
  let called = false;
  const ctx: any = {
    artifacts: { get: () => ({ type: "BugReport", data: { bug: 9, error: "unavailable" } }) },
    llm: { run: async () => { called = true; throw new Error("should not run"); } },
  };
  assert.deepEqual(await summarizeBug.run(ctx, { reportId: "R" }), { summaryId: "" });
  assert.equal(called, false);
});
