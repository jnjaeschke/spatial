import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geckoPlugin } from "../../../src/plugins/gecko/index.ts";
import { linkText } from "../../../src/shared/text-links.ts";

test("the gecko plugin links bug references to Bugzilla in Gecko checkouts only", () => {
  const plain = mkdtempSync(join(tmpdir(), "plain-"));
  assert.deepEqual(geckoPlugin.textLinks!(plain), []);
  const gecko = mkdtempSync(join(tmpdir(), "gecko-"));
  writeFileSync(join(gecko, "mach"), "");
  writeFileSync(join(gecko, "moz.build"), "");
  const rules = geckoPlugin.textLinks!(gecko);
  assert.deepEqual(linkText("Fixes Bug 2072138 and bug 7, not debug 5 or Bug x.", rules), [
    { text: "Fixes " },
    { text: "Bug 2072138", href: "https://bugzilla.mozilla.org/show_bug.cgi?id=2072138" },
    { text: " and " },
    { text: "bug 7", href: "https://bugzilla.mozilla.org/show_bug.cgi?id=7" },
    { text: ", not debug 5 or Bug x." },
  ]);
});
