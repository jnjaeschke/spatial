import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, SessionState } from "../../../../src/web/plugin-api.ts";
import type { CodeLinksData, GeckoSessionState } from "../../../../src/plugins/gecko/shared/types.ts";
import { mergedCodeLinks, searchfoxCodeLinks } from "../../../../src/plugins/gecko/web/searchfox-url.ts";

const artifact = (rev: string, links: CodeLinksData["links"], createdAt: string): Artifact<CodeLinksData> => ({
  id: createdAt, sessionId: "S", type: "CodeLinks", status: "verified", data: { rev, links },
  provenance: { taskId: "runtime" }, epoch: null, createdAt,
});
const state = (gecko: GeckoSessionState | null, artifacts: Artifact[] = []): SessionState => ({
  session: { id: "S", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "0", workflow: "review" }, artifacts, links: [], tasks: [], lastEventId: 0, textLinks: [], plugins: gecko ? { gecko } : {},
  epochs: [],
});
const sf = { repoBase: "https://searchfox.org/firefox-main/", tipRev: "t".repeat(40), linkRev: null };

test("mergedCodeLinks uses the newest link per token for the requested revision", () => {
  assert.deepEqual(mergedCodeLinks([
    artifact("a", { Foo: "old", Bar: null }, "1"),
    artifact("b", { Foo: "other revision" }, "2"),
    artifact("a", { Foo: null, Baz: "baz" }, "3"),
  ], "a"), { Foo: null, Bar: null, Baz: "baz" });
});

test("a session without gecko state has no code links", () => {
  assert.equal(searchfoxCodeLinks(state(null), {}, () => {}), null);
});

test("with a known link revision file and token links pin to it, and unresolved tokens are requested", () => {
  const rev = "b".repeat(40);
  const requested: string[][] = [];
  const links = searchfoxCodeLinks(state({ ...sf, linkRev: rev }, [artifact(rev, { Foo: "stored" }, "1")]), { Bar: "fresh" }, (tokens) => requested.push(tokens))!;
  assert.equal(links.fileUrl("dom/a.cpp"), `${sf.repoBase}rev/${rev}/dom/a.cpp`);
  assert.equal(links.fileUrl("dom/a.cpp", 12, "old"), `${sf.repoBase}rev/${rev}/dom/a.cpp#12`);
  assert.equal(links.fileUrl("dom/a.cpp", 12, "new"), null);
  assert.deepEqual([links.tokenUrl("Foo"), links.tokenUrl("Bar"), links.tokenUrl("Baz")], ["stored", "fresh", null]);
  links.request(["Baz"]);
  assert.deepEqual(requested, [["Baz"]]);
  assert.equal(links.title, "Searchfox at the patch's base");
});

test("without a link revision files link at Searchfox's tip and tokens are neither linked nor requested", () => {
  const requested: string[][] = [];
  const links = searchfoxCodeLinks(state(sf, [artifact(sf.tipRev, { Foo: "stored" }, "1")]), {}, (tokens) => requested.push(tokens))!;
  assert.equal(links.fileUrl("a.cpp", 3), `${sf.repoBase}rev/${sf.tipRev}/a.cpp#3`);
  assert.equal(links.tokenUrl("Foo"), null);
  links.request(["Foo"]);
  assert.deepEqual(requested, []);
  assert.equal(links.title, "Searchfox at current mozilla-central; line numbers may differ");
});
