import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRef, sessionOverview, type SessionView } from "../../src/runtime/render-ref.ts";
import type { Artifact, Link } from "../../src/shared/types.ts";

const artifact = <T,>(id: string, type: string, data: T): Artifact<T> => ({
  id, sessionId: "s", type, data, status: "proposed", provenance: { taskId: "task" }, createdAt: "now",
});

const hunk = (id: string) => ({ id, header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add" as const, text: `line ${id}` }] });
const diff = artifact("D", "Diff", {
  baseSha: "base", headSha: "head", commits: [{ sha: "sha", subject: "Fix parser", body: "Commit body" }],
  files: [{ path: "src/a.ts", status: "modified" as const, binary: false, hunks: [hunk("f0h0"), hunk("f0h1")] }],
});
const narrative = artifact("N", "PatchNarrative", {
  diffId: "D", summary: "Overall summary", changes: [
    { id: "c1", title: "First change", explanation: "First explanation", rationale: "First rationale", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
    { id: "c2", title: "Second change", explanation: "Second explanation", rationale: "Second rationale", hunkIds: ["f0h1"], dependsOn: ["c1"], specUrls: [] },
  ],
});
const spec = artifact("R", "SpecReference", {
  url: "https://example.test/spec#section", resolved: { spec: "Example", anchor: "section", title: "Section title", type: "dfn", url: "https://example.test/spec#section", content: "Full section content" },
  origin: "code" as const, geckoRefs: [],
});
const thread = artifact("T", "ChatThread", { anchor: "N#c1" });
const user = artifact("U", "ChatMessage", { role: "user" as const, text: "Why this change?" });
const assistant = artifact("A", "ChatMessage", { role: "assistant" as const, text: "It fixes the parser." });
const view: SessionView = {
  artifacts: [diff, narrative, spec, thread, user, assistant],
  links: [
    { id: "l1", sessionId: "s", from: "R", to: "N#c2", kind: "supports" },
    { id: "l2", sessionId: "s", from: "U", to: "T", kind: "reply" },
    { id: "l3", sessionId: "s", from: "A", to: "T", kind: "reply" },
  ] as Link[],
};

test("renderRef renders artifacts and supported subrefs", () => {
  assert.match(renderRef(view, "N"), /Overall summary/);
  assert.match(renderRef(view, "N"), /N#c1.*First change/s);
  const change = renderRef(view, "N#c2");
  assert.match(change, /Second explanation/);
  assert.match(change, /Second rationale/);
  assert.match(change, /line f0h1/);
  assert.ok(change.includes("Spec R") && change.includes("Section title"));
  assert.match(renderRef(view, "D"), /Fix parser/);
  assert.match(renderRef(view, "D"), /src\/a.ts/);
  assert.match(renderRef(view, "D#f0h0"), /line f0h0/);
  assert.match(renderRef(view, "D#f0h0"), /First change/);
  const renderedSpec = renderRef(view, "R");
  assert.match(renderedSpec, /Section title/);
  assert.match(renderedSpec, /Full section content/);
  assert.ok(renderedSpec.includes("N#c2"));
  const renderedThread = renderRef(view, "T");
  assert.match(renderedThread, /N#c1/);
  assert.match(renderedThread, /User: Why this change\?/);
  assert.match(renderedThread, /Assistant: It fixes the parser\./);
  assert.match(renderRef(view, "U"), /Why this change\?/);
  assert.throws(() => renderRef(view, "N#nope"), /Unknown ref: N#nope/);
});

test("sessionOverview lists latest narrative changes, specs, and threads", () => {
  const overview = sessionOverview(view);
  for (const expected of ["N#c1", "N#c2", "f0h0", "f0h1", "R", "T"]) assert.ok(overview.includes(expected));
});
