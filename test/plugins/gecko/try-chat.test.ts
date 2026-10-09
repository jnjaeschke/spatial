// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { tryField } from "../../../src/plugins/gecko/runtime/try-chat.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { TaskContext } from "../../../src/plugin-api.ts";

const ctxFor = (dir: string) => ({ repo: dir, git: makeGit(dir) }) as unknown as TaskContext;

test("a try request in a gecko checkout asks to run the try phase at HEAD with the proposal", async () => {
  const repo = makeRepo();
  const head = repo.commit({ mach: "", "moz.build": "" }, "base");
  const out = await tryField.accept(ctxFor(repo.dir), { command: " ./mach try auto ", reason: "asked" });
  assert.deepEqual(out, { ok: true, artifacts: [], run: { phase: "try", input: { head, proposal: { command: "./mach try auto", reason: "asked" } } } });
});

test("a try request is refused outside gecko, with a bad command or a bad shape", async () => {
  const plain = makeRepo();
  plain.commit({ "a.txt": "a" }, "base");
  assert.deepEqual(await tryField.accept(ctxFor(plain.dir), { command: "./mach try auto", reason: "r" }), { ok: false, error: "Try pushes need a Gecko checkout" });
  const gecko = makeRepo();
  gecko.commit({ mach: "", "moz.build": "" }, "base");
  const bad = await tryField.accept(ctxFor(gecko.dir), { command: "./mach try fuzzy", reason: "r" });
  assert.equal(bad.ok, false);
  assert.deepEqual(await tryField.accept(ctxFor(gecko.dir), { command: 1 }), { ok: false, error: "tryPush has an invalid shape" });
});
