// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { specServices } from "../../../src/plugins/spec/runtime/services.ts";
import type { DiffData, SessionState } from "../../../src/shared/types.ts";
import { base, newSession, post, repo, rt } from "../../helpers/http-server.ts";

const searchfox = () => specServices(rt).searchfox as unknown as {
  tip: () => Promise<{ repoBase: string; rev: string }>;
  define: () => Promise<{ path: string; line: number; text: string }>;
};
const stateOf = async (id: string): Promise<SessionState> => (await fetch(`${base}/api/sessions/${id}/state`)).json();

test("a non-gecko session has no gecko state and no code links", async () => {
  const session = await newSession();
  assert.deepEqual((await stateOf(session.id)).plugins, {});
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: [] })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["x".repeat(201)] })).status, 400);
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] })).status, 409);
});

test("code-links requires an upstream Gecko Diff and caches resolved tokens", async () => {
  const session = await newSession();
  writeFileSync(join(repo.dir, "mach"), "");
  writeFileSync(join(repo.dir, "moz.build"), "");
  assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] })).status, 409);
  const rev = repo.git("rev-parse", "HEAD");
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { upstreamRev: rev, baseSha: rev, headSha: rev, commits: [], files: [{ path: "a.txt", status: "modified", binary: false, hunks: [] }] } satisfies DiffData, provenance: { taskId: "test" } });
  let definitions = 0;
  const original = { tip: searchfox().tip, define: searchfox().define };
  try {
    searchfox().tip = async () => ({ repoBase: "https://searchfox.org/firefox-main/", rev });
    searchfox().define = async () => { definitions++; return { path: "a.txt", line: 1, text: "1" }; };
    assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] })).status, 200);
    assert.equal((await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] })).status, 200);
    assert.equal(definitions, 1);
    assert.deepEqual((await stateOf(session.id)).plugins.gecko, { repoBase: "https://searchfox.org/firefox-main/", tipRev: rev, linkRev: rev });
  } finally {
    Object.assign(searchfox(), original);
  }
});

test("code-links of an implement session without a Diff resolve at the branch base and state carries that linkRev", async () => {
  const session = await newSession();
  const rev = repo.git("rev-parse", "HEAD");
  rt.store.putArtifact({ sessionId: session.id, type: "ImplementBranch", status: "verified", data: { branch: "b", baseSha: rev, baseRef: null, checkout: "new-branch" }, provenance: { taskId: "test" } });
  const original = searchfox().tip;
  try {
    searchfox().tip = async () => ({ repoBase: "https://searchfox.org/firefox-main/", rev: "tip" });
    assert.deepEqual((await stateOf(session.id)).plugins.gecko, { repoBase: "https://searchfox.org/firefox-main/", tipRev: "tip", linkRev: rev });
    const res = await post(`/api/sessions/${session.id}/code-links`, { tokens: ["a.txt:1"] });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).links, { "a.txt:1": `https://searchfox.org/firefox-main/rev/${rev}/a.txt#1` });
  } finally {
    searchfox().tip = original;
  }
});

test("a Searchfox failure is a 502 with its message and leaves the state without gecko data", async () => {
  const session = await newSession();
  const rev = repo.git("rev-parse", "HEAD");
  rt.store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { upstreamRev: rev, baseSha: rev, headSha: rev, commits: [], files: [] } satisfies DiffData, provenance: { taskId: "test" } });
  const original = searchfox().tip;
  try {
    searchfox().tip = async () => { throw new Error("searchfox-cli failed: offline"); };
    const res = await post(`/api/sessions/${session.id}/code-links`, { tokens: ["Foo::Bar"] });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /offline/);
    assert.equal((await stateOf(session.id)).plugins.gecko, undefined);
  } finally {
    searchfox().tip = original;
  }
});
