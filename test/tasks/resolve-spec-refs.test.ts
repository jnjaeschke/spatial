import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { PatchNarrativeData, SpecReferenceData } from "../../src/shared/types.ts";
import { resolveSpecRefs } from "../../src/tasks/resolve-spec-refs/task.ts";

const CANON = "https://html.spec.whatwg.org/#navigate";
const webspec: WebspecCapability = {
  effect: "read-only",
  async resolve(url) {
    if (url.endsWith("#navigate")) return { found: true, spec: { spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", url: CANON, content: "To navigate" } };
    return { found: false, reason: `URL not recognized: ${url}` };
  },
};

function setup(opts: { gecko: boolean; searchfoxFails?: boolean }) {
  const repo = mkdtempSync(join(tmpdir(), "repo-"));
  if (opts.gecko) { writeFileSync(join(repo, "mach"), ""); writeFileSync(join(repo, "moz.build"), ""); }
  const searchfoxCalls: string[] = [];
  const searchfox: SearchfoxCapability = {
    effect: "read-only",
    async specRefs(url) {
      searchfoxCalls.push(url);
      if (opts.searchfoxFails) throw new Error("searchfox-cli failed: offline");
      return [{ group: "Code", path: "dom/N.cpp", line: 1, url: "https://sf/dom/N.cpp#1" }];
    },
    async tip() { return { repoBase: "https://sf/", rev: "0".repeat(40) }; },
  };
  const store = new Store(":memory:");
  const rt = new Runtime({ store, tasks: [resolveSpecRefs], llm: {} as LlmService, git: () => ({}) as GitCapability, webspec, searchfox });
  const session = store.createSession(repo, "t");
  const change = (id: string, specUrls: string[]) => ({ id, title: id, explanation: "e", rationale: "r", hunkIds: [], dependsOn: [], specUrls });
  const data: PatchNarrativeData = {
    diffId: "D",
    summary: "s",
    changes: [
      change("c1", ["https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate"]),
      change("c2", [CANON, "https://developer.mozilla.org/en-US/docs/Web/API/Navigation"]),
      change("c3", []),
    ],
  };
  const narrativeId = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data, provenance: { taskId: "x" } }).id;
  return { store, rt, session, narrativeId, searchfoxCalls };
}

test("dedupes by canonical URL, links all citing changes, records unresolved", async () => {
  const { store, rt, session, narrativeId, searchfoxCalls } = setup({ gecko: true });
  const { specRefIds } = await rt.run<{ specRefIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  assert.equal(specRefIds.length, 2);
  const refs = specRefIds.map((id) => store.getArtifact<SpecReferenceData>(id));
  const nav = refs.find((r) => r.data.resolved)!;
  const mdn = refs.find((r) => !r.data.resolved)!;
  assert.equal(nav.status, "verified");
  assert.equal(nav.data.resolved!.url, CANON);
  assert.deepEqual(nav.data.geckoRefs, [{ group: "Code", path: "dom/N.cpp", line: 1, url: "https://sf/dom/N.cpp#1" }]);
  assert.equal(mdn.status, "proposed");
  assert.match(mdn.data.reason!, /URL not recognized/);
  assert.deepEqual(mdn.data.geckoRefs, []);
  assert.deepEqual(searchfoxCalls, [CANON]);
  const links = store.listLinks(session.id).map((l) => [l.from, l.to, l.kind]);
  assert.deepEqual(links.sort(), [
    [nav.id, `${narrativeId}#c1`, "supports"],
    [nav.id, `${narrativeId}#c2`, "supports"],
    [mdn.id, `${narrativeId}#c2`, "supports"],
  ].sort());
});

test("searchfox failure is recorded, task still succeeds", async () => {
  const { store, rt, session, narrativeId } = setup({ gecko: true, searchfoxFails: true });
  const { specRefIds } = await rt.run<{ specRefIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  const nav = specRefIds.map((id) => store.getArtifact<SpecReferenceData>(id)).find((r) => r.data.resolved)!;
  assert.equal(nav.data.geckoRefsError, "searchfox-cli failed: offline");
  assert.deepEqual(nav.data.geckoRefs, []);
});

test("non-Gecko repo never calls searchfox", async () => {
  const { rt, session, narrativeId, searchfoxCalls } = setup({ gecko: false });
  await rt.run(session.id, "resolveSpecRefs", { narrativeId });
  assert.deepEqual(searchfoxCalls, []);
});

test("narrative without spec URLs produces nothing", async () => {
  const { store, rt, session } = setup({ gecko: true });
  const id = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: "D", summary: "s", changes: [] }, provenance: { taskId: "x" } }).id;
  assert.deepEqual(await rt.run(session.id, "resolveSpecRefs", { narrativeId: id }), { specRefIds: [] });
});
