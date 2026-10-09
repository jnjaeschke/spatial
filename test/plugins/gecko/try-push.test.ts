// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { geckoPlugin } from "../../../src/plugins/gecko/index.ts";
import type { CommandRunData } from "../../../src/plugins/implement/api.ts";
import type { TryPushData } from "../../../src/plugins/gecko/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const MACH = `#!/bin/sh
printf '%s\\n' "$@" > .git/mach-args
echo "2. Enter the following code: WXYZ-1234"
if [ -n "$FAIL" ]; then echo "lando said no" >&2; exit 3; fi
if [ -n "$NOLINK" ]; then echo "Pushing to try..."; exit 0; fi
echo "try submission success in 1.0s:"
echo " https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=42"
`;
const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
function setup(machScript = MACH) {
  const repo = makeRepo();
  repo.commit({ mach: machScript, "moz.build": "" }, "base");
  repo.git("update-index", "--chmod=+x", "mach");
  chmodSync(join(repo.dir, "mach"), 0o755);
  const head = repo.commit({ "a.txt": "a\n" }, "Bug 1 - A");
  const store = new Store(":memory:");
  const llm: LlmService = { defaultSelection: selection, async run(chosen) { return { text: "", json: null, providerSessionId: "p", selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [reviewPlugin, implementPlugin, geckoPlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  const progress: string[] = [];
  rt.onEvent((e) => { if (e.type === "task.progress") progress.push((e.payload as { progress: { message?: string } }).progress.message ?? ""); });
  const run = (command: string, at = head) => rt.run<{ pushId: string }>(session.id, "tryPush", { command, head: at, proposalId: "p" });
  return { repo, head, store, session, run, progress };
}

test("a confirmed command runs mach without a shell, keeps its output and records the push", async () => {
  const { repo, store, session, run, progress } = setup();
  const out = await run("./mach try fuzzy --query 'dom/base !win'");
  assert.deepEqual(readFileSync(join(repo.dir, ".git/mach-args"), "utf8").split("\n").filter(Boolean), ["try", "fuzzy", "--query", "dom/base !win"]);
  const push = store.getArtifact<TryPushData>(out.pushId);
  assert.equal(push.type, "TryPush");
  assert.equal(push.data.url, "https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=42");
  const runs = store.listArtifacts(session.id, "CommandRun");
  assert.equal(runs.length, 1);
  assert.match((runs[0]!.data as CommandRunData).output, /try submission success/);
  assert.equal((runs[0]!.data as CommandRunData).test, false);
  assert.ok(progress.some((message) => message.includes("WXYZ-1234")), "login code shown while mach runs");
});

test("a failing or link-less mach try fails the task and keeps the output", async () => {
  const failing = setup(MACH.replace('if [ -n "$FAIL" ]', "if true"));
  await assert.rejects(failing.run("./mach try auto"), /mach try exited 3/);
  assert.match((failing.store.listArtifacts(failing.session.id, "CommandRun")[0]!.data as CommandRunData).output, /lando said no/);
  assert.equal(failing.store.listArtifacts(failing.session.id, "TryPush").length, 0);
  const silent = setup(MACH.replace('if [ -n "$NOLINK" ]', "if true"));
  await assert.rejects(silent.run("./mach try auto"), /printed no Treeherder link/);
});

test("nothing runs for a refused command, a moved checkout or a dirty work tree", async () => {
  const { repo, head, run } = setup();
  await assert.rejects(run("./mach try auto; touch pwned"), /not allowed/);
  await assert.rejects(run("./mach try fuzzy"), /needs --query or --preset/);
  await assert.rejects(run("./mach try auto", "0".repeat(40)), /not at the accepted tip/);
  writeFileSync(join(repo.dir, "a.txt"), "dirty\n");
  await assert.rejects(run("./mach try auto", head), /uncommitted changes/);
  assert.equal(existsSync(join(repo.dir, ".git/mach-args")), false);
});

test("commandRunData caps command output", async () => {
  const { commandRunData } = await import("../../../src/plugins/implement/runtime/command-run.ts");
  const data = commandRunData("x", 0, 1, "x".repeat(262145), false);
  assert.equal(data.output, `${"x".repeat(262144)}\n[output truncated]`);
});
