// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Artifact, DecisionData, Epoch, WorkflowView } from "../../../src/plugin-api.ts";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { geckoPlugin } from "../../../src/plugins/gecko/index.ts";
import { REVIEWERS_PATTERN } from "../../../src/plugins/gecko/runtime/submit-command.ts";
import type { ReviewerSuggestionData } from "../../../src/plugins/gecko/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const MACH = `#!/bin/sh
printf '%s\\n' "$@" > .git/mach-args
if [ -n "$FAIL" ]; then echo "(herald rules unavailable)"; exit 1; fi
echo " 0:00.40 Fetching herald rules"
echo '{"files":["dom/a.txt","dom/b.txt"],"herald_groups":[{"name":"dom-core","blocking":false}],"herald_individuals":[]}'
`;
const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
function setup() {
  const repo = makeRepo();
  repo.commit({ mach: MACH, "moz.build": "" }, "base");
  repo.git("update-index", "--chmod=+x", "mach");
  chmodSync(join(repo.dir, "mach"), 0o755);
  repo.git("commit", "--amend", "--no-edit");
  const base = repo.git("rev-parse", "HEAD").trim();
  const head = repo.commit({ "dom/a.txt": "a\n" }, "Bug 1 - A");
  repo.commit({ "dom/b.txt": "b\n" }, "Bug 1 - B");
  const store = new Store(":memory:");
  const llm: LlmService = { defaultSelection: selection, async run(chosen) { return { text: "", json: null, providerSessionId: "p", selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin, geckoPlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  return { repo, base, head: repo.git("rev-parse", "HEAD").trim(), rt, store, session };
}

let n = 0;
const art = (type: string, data: unknown, epoch: number): Artifact => ({ id: `${type}${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const epoch = (num: number, phase: string, input: unknown = null): Epoch => ({ sessionId: "s", n: num, phase, status: "succeeded", input, error: null, startedAt: "", endedAt: "" });
const view = (artifacts: Artifact[], epochs: Epoch[] = [epoch(4, "submit", { base: "B", head: "H" })]): WorkflowView => ({ artifacts, links: [], epochs });
const question = "Submit 2 commits (H) to Phabricator?";
const answer = (chosen: DecisionData["chosen"]) => art("Decision", { key: "submit", question, options: [], chosen } satisfies DecisionData, 4);

test("submit suggests reviewers for changed files and asks Submit, Submit as WIP or Not yet", async () => {
  const { repo, base, head, rt, store, session } = setup();
  await rt.runPhase(session.id, "submit", { base, head });
  assert.deepEqual(readFileSync(join(repo.dir, ".git/mach-args"), "utf8").split("\n").filter(Boolean), ["file-info", "reviewers", "--format", "json", "dom/a.txt", "dom/b.txt"]);
  const suggestion = store.listArtifacts(session.id, "ReviewerSuggestion").at(-1)!.data as ReviewerSuggestionData;
  assert.deepEqual(suggestion, { files: ["dom/a.txt", "dom/b.txt"], commits: 2, suggested: ["#dom-core"], candidates: [], error: null });
  const step = rt.nextStep(session.id);
  assert.ok(step && "decide" in step);
  assert.equal(step.decide.question, `Submit 2 commits (${head.slice(0, 12)}) to Phabricator?`);
  assert.equal(step.decide.key, "submit");
  assert.deepEqual(step.decide.options.map((o) => [o.id, o.label, o.defaultText ?? null]), [["submit", "Submit", "#dom-core"], ["wip", "Submit as WIP", "#dom-core"], ["skip", "Not yet", null]]);
  assert.equal(step.decide.options[0]!.textPattern, REVIEWERS_PATTERN);
});

test("Submit and WIP run phabSubmit with edited reviewers; Not yet ends", async () => {
  const { submitNext } = await import("../../../src/plugins/gecko/workflow/submit.ts");
  const suggestion = art("ReviewerSuggestion", { files: [], commits: 2, suggested: ["#dom-core"], candidates: [], error: null }, 4);
  const submit = submitNext(view([suggestion, answer({ option: "submit", by: "user", text: "#dom-core, smaug" })]), epoch(4, "submit", { base: "B", head: "H" }));
  assert.deepEqual(submit, { run: "phabSubmit", input: { base: "B", head: "H", reviewers: "#dom-core, smaug", wip: false } });
  assert.deepEqual(submitNext(view([suggestion, answer({ option: "wip", by: "user" })]), epoch(4, "submit", { base: "B", head: "H" })), { run: "phabSubmit", input: { base: "B", head: "H", reviewers: "", wip: true } });
  assert.equal(submitNext(view([suggestion, answer({ option: "skip", by: "user" })]), epoch(4, "submit", { base: "B", head: "H" })), null);
  assert.equal(submitNext(view([suggestion, answer({ option: "skip", by: "user" })], [epoch(4, "submit"), epoch(5, "phabSubmit")]), epoch(4, "submit", { base: "B", head: "H" })), null);
});

test("a failing reviewer command still asks, with error kept and nothing prefilled", async () => {
  const { base, head, rt, store, session } = setup();
  process.env.FAIL = "1";
  try { await rt.runPhase(session.id, "submit", { base, head }); } finally { delete process.env.FAIL; }
  const suggestion = store.listArtifacts(session.id, "ReviewerSuggestion").at(-1)!.data as ReviewerSuggestionData;
  assert.match(suggestion.error!, /exited with code 1.*herald rules unavailable/);
  assert.deepEqual(suggestion.suggested, []);
  const step = rt.nextStep(session.id);
  assert.ok(step && "decide" in step && step.decide.options[0]!.defaultText === undefined);
});
