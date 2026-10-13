import { test } from "node:test";
import assert from "node:assert/strict";
import type { RepoProfile } from "../../../src/plugin-api.ts";
import { fetchBugs, parseBugMarkdown } from "../../../src/plugins/review/tasks/fetch-bugs/task.ts";

test("parse Bugzilla markdown fields", () => {
  assert.deepEqual(parseBugMarkdown(`# Bug 4242 - c.txt is missing\n\n- **Status**: ASSIGNED\n- **Product**: Core\n- **Component**: DOM: Core & HTML`), {
    title: "c.txt is missing", status: "ASSIGNED", component: "Core :: DOM: Core & HTML",
  });
});

const commits = [{ subject: "Bug 1 - first" }, { subject: "Bug 2 - second" }, { subject: "bug 1 repeat" }];
const profile = (fetchBug?: RepoProfile["fetchBug"]): RepoProfile => ({ id: "p", description: "p", commitStyle: "single", ...(fetchBug ? { fetchBug } : {}) });
const context = (repoProfile: RepoProfile, artifacts: unknown[] = []) => ({
  repo: "/r", repoMcp: { moz: { type: "http", url: "http://moz.test/mcp" } }, signal: new AbortController().signal, repoProfiles: new Map([["p", repoProfile]]),
  artifacts: {
    view: () => ({ links: [], artifacts: [{ type: "WorkflowStart", data: { profile: "p" } }, { type: "Diff", id: "D", data: { commits } }] }),
    get: () => ({ type: "Diff", data: { commits } }),
    put: (_type: string, _status: string, data: unknown) => { artifacts.push(data); return { id: `R${artifacts.length}` }; },
  },
}) as never;

test("fetchBugs asks the profile for distinct commit bugs in order and stores errors", async () => {
  const artifacts: unknown[] = [];
  const calls: [string, unknown][] = [];
  const fetchBug: RepoProfile["fetchBug"] = async (id, ctx) => {
    calls.push([id, ctx.repoMcp.moz]);
    if (id === "2") throw new Error("unavailable");
    return `# Bug ${id} - Bug ${id}\n- **Status**: NEW\n- **Product**: Core\n- **Component**: DOM`;
  };
  const out = await fetchBugs.run(context(profile(fetchBug), artifacts), { diffId: "D" });
  assert.deepEqual(calls, [["1", { type: "http", url: "http://moz.test/mcp" }], ["2", { type: "http", url: "http://moz.test/mcp" }]]);
  assert.deepEqual(out.reportIds, ["R1", "R2"]);
  assert.deepEqual(artifacts[1], { bug: 2, title: "", status: "", component: "", markdown: "", error: "unavailable" });
});

test("fetchBugs does nothing when the profile cannot fetch bugs", async () => {
  const artifacts: unknown[] = [];
  assert.deepEqual(await fetchBugs.run(context(profile(), artifacts), { diffId: "D" }), { reportIds: [] });
  assert.deepEqual(artifacts, []);
});

test("fetchBugs stores nothing when the repo's bug tracker is not reachable", async () => {
  const artifacts: unknown[] = [];
  assert.deepEqual(await fetchBugs.run(context(profile(async () => null), artifacts), { diffId: "D" }), { reportIds: [] });
  assert.deepEqual(artifacts, []);
});
