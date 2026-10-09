import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiffData, SessionState } from "../../src/shared/types.ts";
import { fileUrl, linkTitle, searchfoxLinks } from "../../src/web/searchfox-url.ts";

const state = (searchfox: SessionState["searchfox"]): SessionState => ({
  session: { id: "S", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "0", workflow: "review" }, artifacts: [], links: [], tasks: [], lastEventId: 0, searchfox,
 epochs: [],});
const diff = (upstreamRev?: string) => ({ upstreamRev } as DiffData);

test("searchfoxLinks selects upstream revision or current tip", () => {
  const sf = { repoBase: "https://searchfox.org/firefox-main/", tipRev: "t".repeat(40) };
  const request = () => {};
  assert.deepEqual(searchfoxLinks(state(sf), diff("b".repeat(40)), request), { repoBase: sf.repoBase, rev: "b".repeat(40), exact: true, links: {}, request });
  assert.deepEqual(searchfoxLinks(state(sf), diff(), request), { repoBase: sf.repoBase, rev: sf.tipRev, exact: false, links: {}, request });
  assert.equal(searchfoxLinks(state(null), diff(), request), null);
});

test("Searchfox URL builders", () => {
  const sf = { repoBase: "https://searchfox.org/firefox-main/", rev: "b".repeat(40), exact: true, links: {}, request() {} };
  assert.equal(fileUrl(sf, "dom/a.cpp"), `${sf.repoBase}rev/${sf.rev}/dom/a.cpp`);
  assert.equal(fileUrl(sf, "dom/a.cpp", 12), `${sf.repoBase}rev/${sf.rev}/dom/a.cpp#12`);
  assert.equal(linkTitle(sf), "Searchfox at the patch's base");
  assert.equal(linkTitle({ ...sf, exact: false }), "Searchfox at current mozilla-central; line numbers may differ");
});
