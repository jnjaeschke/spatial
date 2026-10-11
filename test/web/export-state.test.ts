import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, Link, SessionState, TaskRecord } from "../../src/shared/types.ts";
import { exportHtml, exportState, type SessionExport } from "../../src/web/export-state.ts";

const artifact = (id: string, type: string, data: unknown = {}): Artifact => ({ id, sessionId: "S", type, status: "verified", createdAt: id, provenance: { taskId: "t" }, data } as Artifact);
const link = (from: string, to: string, kind: Link["kind"]): Link => ({ id: `${from}->${to}`, sessionId: "S", from, to, kind });
const task = (id: string, kind: string, status: TaskRecord["status"]) => ({ id, kind, status, input: { prompt: "secret" } } as unknown as TaskRecord);

const state = (artifacts: Artifact[], links: Link[], tasks: TaskRecord[] = []): SessionState => ({
  session: { id: "S", worktree: "/w", repoDir: "/w/.git", title: "T", createdAt: "0", workflow: "review" },
  artifacts, links, tasks, lastEventId: 0, searchfox: null,
 epochs: [],});

test("exportState drops closed items with their messages, replies, revisions and derived diagrams", () => {
  const st = state([
    artifact("T1", "ChatThread", { anchor: "N#c1" }), artifact("M1", "ChatMessage"), artifact("R1", "Revision"), artifact("D1", "Diagram"),
    artifact("T2", "ChatThread", { anchor: "M1" }), artifact("M2", "ChatMessage"),
    artifact("T3", "ChatThread", { anchor: "N#c1" }), artifact("M3", "ChatMessage"),
    artifact("NOTE", "Note"), artifact("D2", "Diagram"), artifact("F", "ReviewFinding"),
  ], [
    link("M1", "T1", "reply"), link("R1", "M1", "revises"), link("D1", "M1", "derivedFrom"), link("M2", "T2", "reply"), link("M3", "T3", "reply"),
  ], [task("a", "resolveSpecRefs", "succeeded"), task("b", "chatTurn", "succeeded"), task("c", "resolveSpecRefs", "failed")]);
  const out = exportState(st, new Set(["T1", "NOTE", "D2", "F", "unknown"]), []);
  assert.deepEqual(out.artifacts.map((a) => a.id), ["T3", "M3", "F"]);
  assert.deepEqual(out.links.map((l) => l.id), ["M3->T3"]);
  assert.deepEqual(out.tasks.map((t) => t.id), ["a"]);
  assert.deepEqual(exportState(st, new Set(), []).artifacts.filter((a) => a.type !== "Diagram").length, st.artifacts.filter((a) => a.type !== "Diagram").length);
});

test("exportState keeps only the diagram the canvas shows for each reviewed commit", () => {
  const diff = artifact("DIFF", "Diff", { baseSha: "b", headSha: "h", commits: [{ sha: "c1" }, { sha: "c2" }], files: [] });
  const sequence = (id: string, commit: string) => artifact(id, "Diagram", { kind: "sequence", commit });
  const st = state([diff, sequence("D-old", "c1"), sequence("D-new", "c1"), artifact("D-legacy", "Diagram", { kind: "flow", commit: "c2" }), sequence("D-other", "gone"), sequence("D-c2", "c2")], []);
  assert.deepEqual(exportState(st, new Set(), ["c1", "c2"]).artifacts.map((a) => a.id), ["DIFF", "D-new", "D-c2"]);
});

test("exportHtml embeds the data and bundle as HTML-safe JSON", () => {
  const data = { version: 1, exportedAt: "now", state: state([artifact("M", "ChatMessage", { text: "</script><b>" })], []), diffId: "DIFF", files: { "a.cpp": ["x < y"] }, view: {} } satisfies SessionExport;
  const js = 'console.log("</script>")';
  const html = exportHtml("A <title>", "a { color: red }", js, data);
  assert.equal(html.match(/<\/script>/g)!.length, 3);
  assert.match(html, /<title>A &#60;title&#62; · spatial export<\/title>/);
  const embedded = (id: string) => JSON.parse(html.match(new RegExp(`<script type="application/json" id="${id}">(.*?)</script>`, "s"))![1]!);
  assert.deepEqual(embedded("spatial-export"), data);
  assert.equal(embedded("spatial-bundle"), js);
});
