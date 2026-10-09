import { test } from "node:test";
import assert from "node:assert/strict";
import { TRY_TEXT_PATTERN, splitCommand, treeherderUrl, tryCommandProblem } from "../../../src/plugins/gecko/runtime/try-command.ts";

test("splitCommand honours quotes and escapes like sh", () => {
  assert.deepEqual(splitCommand(`./mach try fuzzy --query 'dom/base !win' -q "a \\"b\\""`), ["./mach", "try", "fuzzy", "--query", "dom/base !win", "-q", 'a "b"']);
  assert.deepEqual(splitCommand("./mach  try\tauto"), ["./mach", "try", "auto"]);
  assert.deepEqual(splitCommand("a\\ b ''"), ["a b", ""]);
});

test("splitCommand refuses shell operators outside quotes and unclosed quotes", () => {
  for (const bad of ["./mach try auto; rm -rf x", "./mach try auto && x", "./mach try auto | x", "./mach try auto > f", "./mach try $(x)", "./mach try `x`", "./mach try auto\nx", "./mach try 'auto"]) {
    assert.throws(() => splitCommand(bad), /not allowed|Unclosed/, bad);
  }
  assert.deepEqual(splitCommand("./mach try fuzzy -q '$x; y'"), ["./mach", "try", "fuzzy", "-q", "$x; y"]);
});

test("tryCommandProblem accepts the non-interactive forms only", () => {
  for (const ok of ["./mach try fuzzy --query 'dom/base mochitest'", "./mach try fuzzy -q 'a' -q 'b' --artifact", "./mach try fuzzy --query='x'", "./mach try fuzzy --preset dom", "./mach try --preset dom", "./mach try auto", "./mach try again"]) assert.equal(tryCommandProblem(ok), null, ok);
  assert.match(tryCommandProblem("./mach try fuzzy")!, /needs --query or --preset/);
  for (const interactive of ["./mach try fuzzy -q 'a' -i", "./mach try fuzzy --query 'a' --interactive", "./mach try --preset dom -i"]) assert.match(tryCommandProblem(interactive)!, /interactive/, interactive);
  assert.match(tryCommandProblem("./mach try chooser")!, /runs `\.\/mach try fuzzy --query …`/);
  assert.match(tryCommandProblem("mach try auto")!, /starts with `\.\/mach try`/);
  assert.match(tryCommandProblem("./mach build")!, /starts with `\.\/mach try`/);
  assert.match(tryCommandProblem("./mach try auto; ls")!, /not allowed/);
});

test("treeherderUrl finds the Lando and the revision link", () => {
  const lando = "Pushing to try...\ntry submission success in 3.2s:\n https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=42199\n";
  assert.equal(treeherderUrl(lando), "https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=42199");
  const vcs = "remote: Follow the progress of your build on Treeherder:\nremote:   https://treeherder.mozilla.org/jobs?repo=try&revision=0123456789abcdef0123456789abcdef01234567\n";
  assert.equal(treeherderUrl(vcs), "https://treeherder.mozilla.org/jobs?repo=try&revision=0123456789abcdef0123456789abcdef01234567");
  assert.equal(treeherderUrl("Pushing to try...\nerror\n"), null);
});

test("the decision text pattern rejects text that is not a try command", () => {
  const pattern = new RegExp(TRY_TEXT_PATTERN);
  assert.ok(pattern.test("./mach try auto"));
  assert.ok(!pattern.test("rm -rf /"));
});
