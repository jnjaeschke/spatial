// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitField } from "../../../src/plugins/gecko/runtime/submit-chat.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";
import { makeGit } from "../../../src/runtime/git/read.ts";
import type { TaskContext } from "../../../src/plugin-api.ts";

const ctxFor = (dir: string, artifacts: { type: string; data: unknown }[] = []) => ({ repo: dir, git: makeGit(dir), artifacts: { view: () => ({ artifacts, links: [] }) } }) as unknown as TaskContext;

test("a submit request in an implement session asks to run submit for the branch's base..HEAD", async () => {
  const repo = makeRepo();
  const base = repo.commit({ mach: "", "moz.build": "" }, "base");
  const head = repo.commit({ "a.txt": "a" }, "Bug 1 - A");
  const branch = { type: "ImplementBranch", data: { branch: "spatial/x", baseSha: base, baseRef: "main", profile: "gecko", checkout: "new-branch" } };
  assert.deepEqual(await submitField.accept(ctxFor(repo.dir, [branch]), { reason: "asked" }), { ok: true, artifacts: [], run: { phase: "submit", input: { base, head } } });
});

test("a submit request is refused with a bad shape, outside gecko and outside implement sessions", async () => {
  const plain = makeRepo();
  plain.commit({ "a.txt": "a" }, "base");
  assert.deepEqual(await submitField.accept(ctxFor(plain.dir), { reason: "asked" }), { ok: false, error: "Phabricator submits need a Gecko checkout" });

  const gecko = makeRepo();
  gecko.commit({ mach: "", "moz.build": "" }, "base");
  assert.deepEqual(await submitField.accept(ctxFor(gecko.dir), { reason: 1 }), { ok: false, error: "phabSubmit has an invalid shape" });
  assert.deepEqual(await submitField.accept(ctxFor(gecko.dir), { reason: "asked" }), { ok: false, error: "Phabricator submits need an implement session" });
});
