// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git/read.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { geckoPlugin } from "../../../src/plugins/gecko/index.ts";
import type { CommandRunData } from "../../../src/plugin-api.ts";
import type { PhabSubmissionData, PhabSubmitInput } from "../../../src/plugins/gecko/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const FAKE = `#!/bin/sh
printf '%s\\n' "$@" > .git/moz-phab-args
if [ -n "$FAIL" ]; then echo "#madeup is not a valid reviewer's name" >&2; exit 1; fi
for a in "$@"; do start=$prev; prev=$a; done
base=$(git rev-parse "$start")
git -c user.name=t -c user.email=t@e -c commit.gpgsign=false rebase -q "$base" --exec 'n=$(git rev-list --count HEAD); git -c user.name=t -c user.email=t@e -c commit.gpgsign=false commit -q --amend -m "$(git log -1 --format=%B)" -m "Differential Revision: https://phabricator.services.mozilla.com/D$((1000 + n))"'
[ -n "$SKIPLAST" ] && git -c user.name=t -c user.email=t@e -c commit.gpgsign=false commit -q --amend -m "$(git log -1 --format=%s)"
echo "Submitting done"
`;
const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
function setup() {
  const repo = makeRepo();
  const base = repo.commit({ mach: "", "moz.build": "" }, "base");
  repo.commit({ "dom/a.txt": "a\n" }, "Bug 1 - A");
  const head = repo.commit({ "dom/b.txt": "b\n" }, "Bug 1 - B");
  const binary = join(repo.dir, ".git", "fake-moz-phab");
  writeFileSync(binary, FAKE);
  chmodSync(binary, 0o755);
  const store = new Store(":memory:");
  const llm: LlmService = { defaultSelection: selection, async run(chosen) { return { text: "", json: null, providerSessionId: "p", selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin, geckoPlugin], llm, git: makeGit });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  const run = (input: PhabSubmitInput) => rt.run<{ submissionId: string }>(session.id, "phabSubmit", input);
  return { repo, base, head, run, store, session, rt };
}

async function withBinary<T>(binary: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.SPATIAL_MOZPHAB;
  process.env.SPATIAL_MOZPHAB = binary;
  try { return await fn(); }
  finally { if (previous === undefined) delete process.env.SPATIAL_MOZPHAB; else process.env.SPATIAL_MOZPHAB = previous; }
}

test("Submit runs moz-phab without a shell and records the revision of every commit", async () => {
  const { repo, base, head, run, store, session } = setup();
  const binary = join(repo.dir, ".git", "fake-moz-phab");
  const out = await withBinary(binary, () => run({ base, head, reviewers: "#dom-core, smaug!", wip: false }));
  assert.deepEqual(readFileSync(join(repo.dir, ".git/moz-phab-args"), "utf8").split("\n").filter(Boolean), ["submit", "--yes", "--reviewer", "#dom-core", "--blocker", "smaug", base, "HEAD"]);
  const submission = store.getArtifact<PhabSubmissionData>(out.submissionId).data;
  assert.equal(submission.head, repo.git("rev-parse", "HEAD").trim());
  assert.notEqual(submission.head, head);
  assert.deepEqual(store.listArtifacts(session.id, "StackRewrite").map((a) => a.data), [{ from: head, to: submission.head, by: "moz-phab submit" }]);
  assert.deepEqual(submission.revisions.map((r) => [r.subject, r.url]), [["Bug 1 - A", "https://phabricator.services.mozilla.com/D1002"], ["Bug 1 - B", "https://phabricator.services.mozilla.com/D1003"]]);
  assert.equal(submission.command, `moz-phab submit --yes --reviewer #dom-core --blocker smaug ${base} HEAD`);
  const runs = store.listArtifacts(session.id, "CommandRun").map((a) => a.data as CommandRunData);
  assert.equal(runs.at(-1)!.exitCode, 0);
  assert.match(runs.at(-1)!.output, /Submitting done/);
});

test("the phabSubmit phase imports the rewritten, trailered stack as the latest Diff", async () => {
  const { repo, base, head, store, session, rt } = setup();
  await withBinary(join(repo.dir, ".git", "fake-moz-phab"), async () => {
    await rt.runPhase(session.id, "phabSubmit", { base, head, reviewers: "", wip: false });
  });
  const diff = store.listArtifacts(session.id, "Diff").at(-1)!;
  assert.equal((diff.data as { headSha: string }).headSha, repo.git("rev-parse", "HEAD").trim());
  assert.match(repo.git("log", "-1", "--format=%B"), /Differential Revision:/);
});

test("a failing moz-phab fails the epoch and keeps its output", async () => {
  const { repo, base, head, run, store, session } = setup();
  await withBinary(join(repo.dir, ".git", "fake-moz-phab"), async () => {
    process.env.FAIL = "1";
    try { await assert.rejects(run({ base, head, reviewers: "", wip: false }), /moz-phab exited 1/); }
    finally { delete process.env.FAIL; }
  });
  const runs = store.listArtifacts(session.id, "CommandRun").map((a) => a.data as CommandRunData);
  assert.match(runs.at(-1)!.output, /#madeup is not a valid reviewer's name/);
});

test("a commit left without a trailer fails the submission", async () => {
  const { repo, base, head, run } = setup();
  await withBinary(join(repo.dir, ".git", "fake-moz-phab"), async () => {
    process.env.SKIPLAST = "1";
    try { await assert.rejects(run({ base, head, reviewers: "", wip: false }), /commit [0-9a-f]{12} \(Bug 1 - B\) has no Differential Revision trailer/); }
    finally { delete process.env.SKIPLAST; }
  });
});

test("a moved or dirty checkout and an invalid reviewer list stop before moz-phab runs", async () => {
  const { repo, base, head, run } = setup();
  const binary = join(repo.dir, ".git", "fake-moz-phab");
  await withBinary(binary, async () => {
    await assert.rejects(run({ base, head: base, reviewers: "", wip: false }), /checkout is at/);
    writeFileSync(join(repo.dir, "dirty.txt"), "dirty\n");
    await assert.rejects(run({ base, head, reviewers: "", wip: false }), /uncommitted changes/);
    assert.ok(!existsSync(join(repo.dir, ".git/moz-phab-args")));
    await assert.rejects(run({ base, head, reviewers: "a;b", wip: false }), /comma-separated list/);
    assert.ok(!existsSync(join(repo.dir, ".git/moz-phab-args")));
  });
});
