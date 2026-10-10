import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { DiffData } from "../../src/plugin-api.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { IntroducedSymbolsData } from "../../src/plugins/review/shared/types.ts";
import { introducedSymbols } from "../../src/plugins/review/tasks/introduced-symbols/task.ts";

test("introducedSymbols stores only new defined names and links the Diff", async () => {
  const store = new Store(":memory:");
  const searched: string[] = [];
  const git = {
    async show(sha: string, path: string) { assert.deepEqual([sha, path], ["base", "a.h"]); return "void LocalThing();\n"; },
    async wordsAt(_rev: string, words: string[]) { searched.push(...words); return new Set(words.filter((word) => word === "ExistingThing")); },
  } as unknown as GitCapability;
  const llm = { defaultSelection: { backend: "claude" as const, model: "m", effort: "low" as const }, async run() { throw new Error("unused"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } } as LlmService;
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [introducedSymbols] }], llm, git: () => git, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const diff: DiffData = { baseSha: "base", headSha: "head", commits: [{ sha: "commit", subject: "add", body: "" }], files: [{ path: "a.h", status: "modified", binary: false, hunks: [{ id: "h0", header: "", oldStart: 1, oldLines: 0, newStart: 1, newLines: 4, lines: [
    { kind: "add", text: "void ExistingThing();" }, { kind: "add", text: "void NewThing();" }, { kind: "add", text: "CallOnlyName();" }, { kind: "add", text: "void LocalThing(int);" },
  ] }] }] };
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diff, provenance: { taskId: "x" } }).id;
  const { artifactId } = await rt.run<{ artifactId: string }>(session.id, "introducedSymbols", { diffId });
  const artifact = store.getArtifact<IntroducedSymbolsData>(artifactId);
  assert.equal(artifact.type, "IntroducedSymbols");
  assert.equal(artifact.status, "verified");
  assert.deepEqual(artifact.data, { diffId, symbols: { NewThing: { path: "a.h", hunkId: "h0", line: 2, commit: 0 } } });
  assert.ok(!searched.includes("LocalThing"), "names in the base version of a touched file skip the tree-wide search");
  assert.deepEqual(store.listLinks(session.id).map((link) => [link.from, link.to, link.kind]), [[artifactId, diffId, "derivedFrom"]]);
});
