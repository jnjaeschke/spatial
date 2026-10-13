import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGeckoRepo } from "../../../src/plugins/gecko/runtime/gecko-repo.ts";

const dir = mkdtempSync(join(tmpdir(), "gecko-repo-"));

test("isGeckoRepo", () => {
  assert.equal(isGeckoRepo(dir), false);
  writeFileSync(join(dir, "mach"), "");
  writeFileSync(join(dir, "moz.build"), "");
  assert.equal(isGeckoRepo(dir), true);
});
