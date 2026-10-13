import type { PatchNarrativeData } from "../../../../src/plugins/review/shared/types.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type StepCommentCheck, type WebspecCapability } from "../../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../../src/runtime/llm/types.ts";
import type { ReviewFindingData } from "../../../../src/plugins/review/shared/types.ts";
import type { SpecReferenceData } from "../../../../src/plugins/spec/api.ts";
import type { DiffData, DiffLine } from "../../../../src/shared/types.ts";

import { resolveSpecRefs } from "../../../../src/plugins/review/tasks/resolve-spec-refs/task.ts";

const CANON = "https://html.spec.whatwg.org/#navigate";
const webspecFor = (failing?: string, checks: StepCommentCheck[] = [], analyzed: string[] = []): WebspecCapability => ({
  effect: "read-only",
  async lookup() { throw new Error("not used"); }, async query() { throw new Error("not used"); }, async search() { throw new Error("not used"); }, async refs() { throw new Error("not used"); }, async idl() { throw new Error("not used"); }, async effectPaths() { throw new Error("not used"); },
  async analyze(name, text) {
    analyzed.push(name);
    if (text.includes("ANALYZE-FAILS")) throw new Error("webspec-index analyze exited with code 101: panicked");
    return checks;
  },
  async resolve(url) {
    if (url === failing) throw new Error("webspec-index exited with code 1: parse worker panicked");
    if (url.endsWith("#navigate")) return { found: true, spec: { spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", url: CANON, content: "To navigate:\n\n1. Fire *navigate*.\n2. Commit the entry.\n3. Fire navigatesuccess after the commit." } };
    return { found: false, reason: `URL not recognized: ${url}` };
  },
});

function setup(opts: { gecko: boolean; searchfoxFails?: boolean; webspecFails?: string; head?: string[]; f0h0?: DiffLine[]; checks?: StepCommentCheck[] }) {
  const analyzed: string[] = [];
  const repo = mkdtempSync(join(tmpdir(), "repo-"));
  if (opts.gecko) { writeFileSync(join(repo, "mach"), ""); writeFileSync(join(repo, "moz.build"), ""); }
  const searchfoxCalls: string[] = [];
  const showCalls: string[] = [];
  const searchfox: SearchfoxCapability = {
    effect: "read-only",
    async define() { return null; },
    async search() { throw new Error("not used"); },
    async specRefs(url) {
      searchfoxCalls.push(url);
      if (opts.searchfoxFails) throw new Error("searchfox-cli failed: offline");
      return [{ group: "Code", path: "dom/N.cpp", line: 1, url: "https://sf/dom/N.cpp#1" }];
    },
    async functionAt() { return []; },
    async file() { return ""; },
    async tip() { return { repoBase: "https://sf/", rev: "0".repeat(40) }; },
  };
  const store = new Store(":memory:");
  const git: GitCapability = {
    effect: "read-only", isDirty: async () => false, resolve: async () => "H", isAncestor: async () => true, mergeBase: async () => null, mainlineRefs: async () => [], blame: async () => [],
    log: async () => [], diff: async () => "", replay: async () => ({ tree: "T", conflicts: [] }),
    async show(sha, path) {
      showCalls.push(`${sha}:${path}`);
      return (opts.head ?? [
        "// https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate",
        "void First() {", "  Changed();", "}",
        "// https://github.com/whatwg/html/issues/1#issuecomment-2",
        "void Second() {", "  Changed();", "}",
      ]).join("\n");
    },
    async wordsAt() { return new Set(); },
  };
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [resolveSpecRefs] }], llm: {} as LlmService, git: () => git, webspec: webspecFor(opts.webspecFails, opts.checks, analyzed), searchfox });
  const session = store.createSession({ worktree: repo, repoDir: `${repo}/.git`, title: "t" });
  const change = (id: string, specUrls: string[]) => ({ id, title: id, explanation: "e", rationale: "r", hunkIds: [], dependsOn: [], specUrls });
  const diff: DiffData = {
    baseSha: "B", headSha: "H", commits: [], files: [
      { path: "dom/N.cpp", status: "modified", binary: false, hunks: [
        { id: "f0h0", header: "", oldStart: 3, oldLines: 1, newStart: 3, newLines: opts.f0h0?.length ?? 1, lines: opts.f0h0 ?? [] },
        { id: "f0h1", header: "", oldStart: 7, oldLines: 1, newStart: 7, newLines: 1, lines: [] },
      ] },
      { path: "dom/Deleted.cpp", status: "deleted", binary: false, hunks: [
        { id: "f1h0", header: "", oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, lines: [] },
      ] },
    ],
  };
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diff, provenance: { taskId: "x" } }).id;
  const data: PatchNarrativeData = {
    diffId,
    summary: "s",
    changes: [
      { ...change("c1", []), hunkIds: ["f0h0"] },
      { ...change("c2", [CANON, "https://developer.mozilla.org/en-US/docs/Web/API/Navigation"]), hunkIds: ["f0h1"] },
      change("c3", []),
    ],
  };
  const narrativeId = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data, provenance: { taskId: "x" } }).id;
  return { store, rt, session, narrativeId, searchfoxCalls, showCalls, analyzed };
}

test("merges cited and narrative URLs, links all changes, and records origins", async () => {
  const { store, rt, session, narrativeId, searchfoxCalls, showCalls } = setup({ gecko: true });
  const { specRefIds } = await rt.run<{ specRefIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  assert.equal(specRefIds.length, 2);
  const refs = specRefIds.map((id) => store.getArtifact<SpecReferenceData>(id));
  const nav = refs.find((r) => r.data.resolved)!;
  const mdn = refs.find((r) => !r.data.resolved)!;
  assert.equal(nav.status, "verified");
  assert.equal(nav.data.origin, "code");
  assert.equal(nav.data.resolved!.url, CANON);
  assert.deepEqual(nav.data.geckoRefs, [{ group: "Code", path: "dom/N.cpp", line: 1, url: "https://sf/dom/N.cpp#1" }]);
  assert.equal(mdn.status, "proposed");
  assert.equal(mdn.data.origin, "llm");
  assert.match(mdn.data.reason!, /URL not recognized/);
  assert.deepEqual(mdn.data.geckoRefs, []);
  assert.deepEqual(searchfoxCalls, [CANON]);
  assert.deepEqual(showCalls, ["H:dom/N.cpp"]);
  assert.equal(refs.some((r) => r.data.url.includes("github.com")), false);
  const links = store.listLinks(session.id).map((l) => [l.from, l.to, l.kind]);
  assert.deepEqual(links.sort(), [
    [nav.id, `${narrativeId}#c1`, "supports"],
    [nav.id, `${narrativeId}#c2`, "supports"],
    [mdn.id, `${narrativeId}#c2`, "supports"],
  ].sort());
});

test("code citations support their change and merge with equivalent narrative URLs", async () => {
  const { store, rt, session, narrativeId } = setup({ gecko: false });
  const { specRefIds } = await rt.run<{ specRefIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  const refs = specRefIds.map((id) => store.getArtifact<SpecReferenceData>(id));
  const nav = refs.find((r) => r.data.resolved)!;
  assert.equal(nav.data.origin, "code");
  assert.deepEqual(store.listLinks(session.id).filter((l) => l.from === nav.id).map((l) => l.to).sort(),
    [`${narrativeId}#c1`, `${narrativeId}#c2`].sort());
});

test("searchfox failure is recorded, task still succeeds", async () => {
  const { store, rt, session, narrativeId } = setup({ gecko: true, searchfoxFails: true });
  const { specRefIds } = await rt.run<{ specRefIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  const nav = specRefIds.map((id) => store.getArtifact<SpecReferenceData>(id)).find((r) => r.data.resolved)!;
  assert.equal(nav.data.geckoRefsError, "searchfox-cli failed: offline");
  assert.deepEqual(nav.data.geckoRefs, []);
});

test("a failing spec lookup becomes an unresolved reference, the other URLs still resolve", async () => {
  const mdn = "https://developer.mozilla.org/en-US/docs/Web/API/Navigation";
  const { store, rt, session, narrativeId } = setup({ gecko: false, webspecFails: mdn });
  const { specRefIds } = await rt.run<{ specRefIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  const refs = specRefIds.map((id) => store.getArtifact<SpecReferenceData>(id));
  assert.ok(refs.some((r) => r.data.resolved?.url === CANON));
  const failed = refs.find((r) => r.data.url === mdn)!;
  assert.equal(failed.status, "proposed");
  assert.match(failed.data.reason!, /parse worker panicked/);
});

test("non-Gecko repo never calls searchfox", async () => {
  const { rt, session, narrativeId, searchfoxCalls } = setup({ gecko: false });
  await rt.run(session.id, "resolveSpecRefs", { narrativeId });
  assert.deepEqual(searchfoxCalls, []);
});

test("narrative without spec URLs produces nothing", async () => {
  const { store, rt, session } = setup({ gecko: true });
  const diffId = store.listArtifacts(session.id).find((a) => a.type === "Diff")!.id;
  const id = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId, summary: "s", changes: [] }, provenance: { taskId: "x" } }).id;
  assert.deepEqual(await rt.run(session.id, "resolveSpecRefs", { narrativeId: id }), { specRefIds: [], findingIds: [], stepCheckErrors: [] });
});

const NAV = "https://html.spec.whatwg.org/#navigate";
const stepHead = [
  "// https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate",
  "void First() {",
  "  // Step 2. Commit the entry.",
  "  // Step 3. Commit the entry.",
  "  // Step 9. Unknown.",
  "}",
];

test("Step comments on added lines that webspec-index rejects become spec findings, once", async () => {
  const checks: StepCommentCheck[] = [
    { line: 3, step: "2", text: "Commit the entry.", result: "exact", url: NAV },
    { line: 4, step: "3", text: "Commit the entry.", result: "mismatch", url: NAV },
    { line: 5, step: "9", text: "Unknown.", result: "not_found", url: NAV },
    { line: 1, step: "1", text: "Unchanged.", result: "not_found", url: NAV },
  ];
  const { store, rt, session, narrativeId, analyzed } = setup({ gecko: false, head: stepHead, f0h0: stepHead.slice(2, 5).map((text) => ({ kind: "add", text })), checks });
  const { findingIds, stepCheckErrors } = await rt.run<{ findingIds: string[]; stepCheckErrors: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  assert.deepEqual(analyzed, ["N.cpp"]);
  assert.deepEqual(stepCheckErrors, []);
  const findings = findingIds.map((id) => store.getArtifact<ReviewFindingData>(id));
  assert.deepEqual(findings.map((f) => [f.status, f.provenance.llm, f.data.category, f.data.severity, f.data.title, f.data.quote, f.data.lines]), [
    ["verified", undefined, "spec", "medium", "Step 3 comment describes step 2 of HTML#navigate", "// Step 3. Commit the entry.", { path: "dom/N.cpp", side: "new", start: 4, end: 4 }],
    ["verified", undefined, "spec", "low", "Comment cites step 9, which HTML#navigate does not have", "// Step 9. Unknown.", { path: "dom/N.cpp", side: "new", start: 5, end: 5 }],
  ]);
  const diffId = store.listArtifacts(session.id).find((a) => a.type === "Diff")!.id;
  const links = store.listLinks(session.id).filter((l) => l.from === findingIds[0]).map((l) => [l.to, l.kind]);
  assert.deepEqual(links, [[narrativeId, "derivedFrom"], [`${diffId}#f0h0`, "about"]]);
  const again = await rt.run<{ findingIds: string[] }>(session.id, "resolveSpecRefs", { narrativeId });
  assert.deepEqual(again.findingIds, []);
});

test("files without a step-like added line are not analyzed; a failing analysis is reported, not fatal", async () => {
  const plain = setup({ gecko: false });
  await plain.rt.run(plain.session.id, "resolveSpecRefs", { narrativeId: plain.narrativeId });
  assert.deepEqual(plain.analyzed, []);
  const head = ["// ANALYZE-FAILS https://html.spec.whatwg.org/#navigate", "void F() {", "  // 1. Do it.", "}"];
  const failing = setup({ gecko: false, head, f0h0: [{ kind: "add", text: head[2]! }] });
  const out = await failing.rt.run<{ specRefIds: string[]; stepCheckErrors: string[] }>(failing.session.id, "resolveSpecRefs", { narrativeId: failing.narrativeId });
  assert.deepEqual(out.stepCheckErrors, ["dom/N.cpp: webspec-index analyze exited with code 101: panicked"]);
  assert.ok(out.specRefIds.length > 0);
});
