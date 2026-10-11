#!/usr/bin/env node
// Stub for searchfox-cli. `--spec-refs <url>` for fragment `navigate` lists lines 3 and 9 of dom/fake/Fake.cpp (line 9 links
// `#navigate-fragid`: the real search matches fragment prefixes too) and a web-platform test; other fragments have none.
// `--get-file` serves those files, and the tip permalink for `moz.build`; `--function-at` knows Fake::Navigate (lines 4-10).
const REV = "0f".repeat(20);
const FILES = {
  "dom/fake/Fake.cpp": ["#include \"Fake.h\"", "", "// https://html.spec.whatwg.org/#navigate", "void Fake::Navigate() {", "  // Step 1. Edit the line.", "  Edit();", "  // Step 2. Add the files.", "  Add();", "  // https://html.spec.whatwg.org/#navigate-fragid", "}", ""].join("\n"),
  "testing/web-platform/tests/fake/navigate.html": ["<!doctype html>", "<link rel=help href=\"https://html.spec.whatwg.org/#navigate\">", ""].join("\n"),
};
const args = process.argv.slice(2);
const write = (value) => process.stdout.write(value);
const fail = () => { process.stderr.write("Error: Request failed: 404 Not Found\n"); process.exit(1); };

if (args[0] === "--spec-refs") {
  const url = new URL(args[1]);
  if (url.hash !== "#navigate") write("## Gecko references\n\n0 reference(s) in mozilla-central\n");
  else write(`## Gecko references\n\n3 reference(s) in mozilla-central\n\n### Code\n\n- dom/fake/Fake.cpp:3 — https://searchfox.org/mozilla-central/source/dom/fake/Fake.cpp#3\n- dom/fake/Fake.cpp:9 — https://searchfox.org/mozilla-central/source/dom/fake/Fake.cpp#9\n\n### Web-Platform Test\n\n- testing/web-platform/tests/fake/navigate.html:2 — https://searchfox.org/mozilla-central/source/testing/web-platform/tests/fake/navigate.html#2\n`);
} else if (args[0] === "--function-at") {
  const [path, lineText] = args[1].split(":");
  const line = Number(lineText);
  if (path !== "dom/fake/Fake.cpp") fail();
  if (line >= 4 && line <= 10) write(`dom/fake/Fake.cpp:${line}\nin _ZN4Fake8NavigateEv\n  void Fake::Navigate() {\n`);
  else write(`dom/fake/Fake.cpp:${line}: (file scope — not inside any function or class)\n`);
} else if (args[0] === "--get-file") {
  const path = args[1];
  if (path === "moz.build" && args.includes("--permalink")) write(`https://searchfox.org/mozilla-central/rev/${REV}/moz.build#1\n`);
  else if (FILES[path]) write(FILES[path]);
  else fail();
} else {
  fail();
}
