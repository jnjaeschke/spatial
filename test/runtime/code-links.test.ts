// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../helpers/git-fixture.ts";
import { classifyToken, resolveCodeLinks } from "../../src/runtime/code-links.ts";

test("classifyCodeToken accepts paths and symbols but rejects prose and expressions", () => {
  for (const [token, expected] of [
    ["browser.toml", { kind: "file", path: "browser.toml" }],
    ["dom/base/test/browser.toml", { kind: "file", path: "dom/base/test/browser.toml" }],
    ["nsGlobalWindowOuter.cpp:5488", { kind: "file", path: "nsGlobalWindowOuter.cpp", line: 5488 }],
    ["Foo::Bar()", { kind: "symbol", symbol: "Foo::Bar" }],
    ["IsSubframe()", { kind: "symbol", symbol: "IsSubframe" }],
    ["git log -S", null], ["a == b", null], ["true", null], ["self", null], ["mBrowsingContext->IsSubframe()", null],
  ] as const) assert.deepEqual(classifyToken(token), expected, token);
});

test("resolveCodeLinks pins files and definitions to the supplied revision", async () => {
  const repo = makeRepo();
  const rev = repo.commit({
    "dom/base/a.cpp": "one\ntwo\nvoid Foo::Bar() {\nend\n",
    "dom/base/test/browser.toml": "[DEFAULT]\n",
  }, "base");
  let calls = 0;
  const links = await resolveCodeLinks({
    git: async (args) => repo.git(...args),
    searchfox: { define: async () => { calls++; return { path: "dom/base/a.cpp", line: 9, text: "void Foo::Bar() {" }; } },
    repoBase: "https://searchfox.org/firefox-main/", rev,
    diffPaths: ["dom/base/test/x.js"],
  }, ["Foo::Bar()", "browser.toml", "a.cpp:2", "git log -S"]);
  assert.deepEqual(links, {
    "Foo::Bar()": `https://searchfox.org/firefox-main/rev/${rev}/dom/base/a.cpp#3`,
    "browser.toml": `https://searchfox.org/firefox-main/rev/${rev}/dom/base/test/browser.toml`,
    "a.cpp:2": `https://searchfox.org/firefox-main/rev/${rev}/dom/base/a.cpp#2`,
    "git log -S": null,
  });
  assert.equal(calls, 1);
  const absent = await resolveCodeLinks({ git: async (args) => repo.git(...args), searchfox: { define: async () => ({ path: "dom/base/a.cpp", line: 1, text: "newer" }) }, repoBase: "https://searchfox.org/firefox-main/", rev, diffPaths: [] }, ["Foo::Bar"]);
  assert.equal(absent["Foo::Bar"], null);
});
