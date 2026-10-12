import { test } from "node:test";
import assert from "node:assert/strict";
import { localLinkToken } from "../../src/web/local-links.ts";

const worktree = "/home/jan/dev/gecko2";

test("localLinkToken turns worktree paths and repo-relative paths into path:line tokens", () => {
  assert.equal(localLinkToken(`${worktree}/layout/generic/nsIFrame.cpp:2440`, worktree), "layout/generic/nsIFrame.cpp:2440");
  assert.equal(localLinkToken(`${worktree}/layout/generic/nsIFrame.cpp#L2440`, worktree), "layout/generic/nsIFrame.cpp:2440");
  assert.equal(localLinkToken(`${worktree}/layout/generic/nsIFrame.cpp:2440:7`, worktree), "layout/generic/nsIFrame.cpp:2440");
  assert.equal(localLinkToken(`${worktree}/layout/generic/nsIFrame.cpp`, `${worktree}/`), "layout/generic/nsIFrame.cpp");
  assert.equal(localLinkToken("dom/base/Document.cpp:12", worktree), "dom/base/Document.cpp:12");
  assert.equal(localLinkToken("./dom/base/Document.cpp#L12-L20", undefined), "dom/base/Document.cpp:12");
});

test("localLinkToken leaves external, foreign and non-file links alone", () => {
  for (const href of ["https://example.com/a.cpp", "http://example.com/a.cpp:3", "mailto:a@b.c", "//example.com/a.cpp", "#section", "/etc/passwd.conf", `${worktree}-other/a.cpp`, "../a.cpp", "page", undefined]) {
    assert.equal(localLinkToken(href, worktree), null, String(href));
  }
  assert.equal(localLinkToken(`${worktree}/a.cpp`, undefined), null);
});
