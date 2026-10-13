import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LlmService } from "../../../../src/runtime/llm/types.ts";
import { Store } from "../../../../src/runtime/store.ts";
import { Runtime } from "../../../../src/runtime/tasks.ts";
import { makeGit } from "../../../../src/runtime/git/read.ts";
import { makeRepo } from "../../../helpers/git-fixture.ts";
import { reviewPlugin } from "../../../../src/plugins/review/index.ts";

function setup(repo: ReturnType<typeof makeRepo>, git = () => makeGit(repo.dir), llm: LlmService = {} as never) {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "round", workflow: "review" });
  const rt = new Runtime({ store, plugins: [{ id: "review", tasks: reviewPlugin.tasks, phases: reviewPlugin.phases }], llm, git });
  return { store, session, rt };
}

test("a local round imports a Diff and its interdiff without narration", async () => {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "one\n" }, "base");
  const first = repo.commit({ "a.txt": "two\n" }, "first");
  const second = repo.commit({ "a.txt": "three\n" }, "second");
  const { store, session, rt } = setup(repo);
  try {
    const earlier = await rt.run<{ diffId: string }>(session.id, "importDiff", { base, head: first });
    await rt.runPhase(session.id, "round", { round: { kind: "local", base, head: second, host: null, phab: null }, narrate: false });
    const diffs = store.listArtifacts(session.id, "Diff");
    assert.equal(diffs.length, 2);
    const next = diffs.at(-1)!;
    const interdiff = store.listArtifacts(session.id, "Interdiff").at(-1)!;
    const { fromDiff, toDiff } = interdiff.data as { fromDiff: string; toDiff: string };
    assert.deepEqual({ fromDiff, toDiff }, { fromDiff: earlier.diffId, toDiff: next.id });
    assert.equal(store.listArtifacts(session.id, "PhabSync").length, 0);
    assert.deepEqual(store.listTasks(session.id).map((task) => task.kind), ["importDiff", "importRound", "importDiff", "interdiff"]);
  } finally { store.close(); }
});

test("retrying a failed round reuses its imported Diff", async () => {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "zero\n" }, "base");
  const first = repo.commit({ "a.txt": "one\n" }, "first");
  const otherBase = repo.commit({ "a.txt": "two\n" }, "other base");
  const second = repo.commit({ "a.txt": "three\n" }, "second");
  let fail = true;
  const git = () => {
    const capability = makeGit(repo.dir);
    const replay = capability.replay;
    return { ...capability, async replay(...args: Parameters<NonNullable<typeof replay>>) {
      if (fail) { fail = false; throw new Error("fail once"); }
      return replay!(...args);
    } };
  };
  const { store, session, rt } = setup(repo, git);
  try {
    await rt.run(session.id, "importDiff", { base, head: first });
    const input = { round: { kind: "local" as const, base: otherBase, head: second, host: null, phab: null }, narrate: false };
    await assert.rejects(rt.runPhase(session.id, "round", input));
    await rt.retryPhase(session.id);
    assert.equal(store.listArtifacts(session.id, "Diff").length, 2);
    assert.equal(store.listArtifacts(session.id, "Interdiff").length, 1);
  } finally { store.close(); }
});

const HOST = "https://phab.example.com";

/** Serves `differential.getrawdiff` from `raws` with the arcrc and base URL env set for the duration of `body`. */
async function withConduit(raws: Record<number, string>, body: (calls: string[]) => Promise<void>): Promise<void> {
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const method = req.url!.slice("/api/".length);
    calls.push(method);
    const params = JSON.parse(new URLSearchParams(text).get("params")!) as { diffID: number };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(method === "differential.getrawdiff" ? { result: raws[params.diffID], error_code: null, error_info: null } : { result: null, error_code: "ERR", error_info: `unexpected ${method}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const arcrc = join(mkdtempSync(join(tmpdir(), "spatial-arcrc-")), "arcrc");
  writeFileSync(arcrc, JSON.stringify({ hosts: { [`${HOST}/api/`]: { token: "test-token" } } }));
  const old = { arcrc: process.env.SPATIAL_ARCRC_PATH, base: process.env.SPATIAL_CONDUIT_BASE_URL };
  process.env.SPATIAL_ARCRC_PATH = arcrc;
  process.env.SPATIAL_CONDUIT_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { await body(calls); }
  finally {
    if (old.arcrc === undefined) delete process.env.SPATIAL_ARCRC_PATH; else process.env.SPATIAL_ARCRC_PATH = old.arcrc;
    if (old.base === undefined) delete process.env.SPATIAL_CONDUIT_BASE_URL; else process.env.SPATIAL_CONDUIT_BASE_URL = old.base;
    server.close();
  }
}

test("a Phabricator round rebuilds the stack under refs/spatial and records which diff each revision matches", async () => {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "one\n" }, "base");
  repo.git("switch", "-q", "-c", "scratch");
  repo.commit({ "a.txt": "one\ntwo\n" }, "p1");
  repo.commit({ "a.txt": "one\ntwo\nthree\n" }, "p2");
  const raw1 = repo.git("diff", "scratch~2", "scratch~1") + "\n";
  const raw2 = repo.git("diff", "scratch~1", "scratch") + "\n";
  repo.git("switch", "-q", "main");
  const head = repo.git("rev-parse", "HEAD");
  const branchesBefore = repo.git("branch", "--list");
  const { store, session, rt } = setup(repo);
  const entry = (revision: number, diffId: number, title: string, latestDiffId: number) => ({ revision, diffId, base, dateCreated: 1_760_000_000 + revision, title, latestDiffId });
  try {
    await withConduit({ 10: raw1, 11: raw2 }, async (calls) => {
      await rt.runPhase(session.id, "round", { round: { kind: "phabricator", host: HOST, stack: [entry(1, 10, "Part 1", 20), entry(2, 11, "Part 2", 21)] }, narrate: false });
      assert.deepEqual(calls, ["differential.getrawdiff", "differential.getrawdiff"]);
    });
    const [diff] = store.listArtifacts(session.id, "Diff");
    const data = diff!.data as { baseSha: string; commits: { subject: string; body: string }[] };
    assert.equal(data.baseSha, base);
    assert.deepEqual(data.commits.map((c) => [c.subject, c.body]), [["Part 1", `Differential Revision: ${HOST}/D1`], ["Part 2", `Differential Revision: ${HOST}/D2`]]);
    assert.match(repo.git("for-each-ref", "--format=%(refname)", "refs/spatial"), /^refs\/spatial\/D1\/10-[0-9a-f]{12}\nrefs\/spatial\/D2\/11-[0-9a-f]{12}$/);
    assert.equal(repo.git("rev-parse", "HEAD"), head);
    assert.equal(repo.git("branch", "--list"), branchesBefore);
    assert.deepEqual(store.listArtifacts(session.id, "PhabSync").map((a) => a.data), [
      { revision: 1, matchingDiffId: 10, latestDiffId: 20, localDiff: diff!.id },
      { revision: 2, matchingDiffId: 11, latestDiffId: 21, localDiff: diff!.id },
    ]);
  } finally { store.close(); }
});

test("a narrated round runs narrate and no review", async () => {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "one\n" }, "base");
  const head = repo.commit({ "a.txt": "two\n" }, "change");
  const selection = { backend: "claude", model: "sonnet", effort: "low" } as const;
  const llm = {
    defaultSelection: selection,
    async run() {
      return { text: "", json: { summary: "S", changes: [{ id: "c1", title: "t", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }] }, providerSessionId: "p", selection };
    },
  } as unknown as LlmService;
  const { store, session, rt } = setup(repo, () => makeGit(repo.dir), llm);
  try {
    await rt.runPhase(session.id, "round", { round: { kind: "local", base, head, host: null, phab: null }, narrate: true });
    const kinds = store.listTasks(session.id).map((task) => task.kind);
    assert.ok(kinds.includes("narrate"));
    assert.equal(kinds.includes("review"), false);
    assert.equal(store.listArtifacts(session.id, "PatchNarrative").length, 1);
  } finally { store.close(); }
});
