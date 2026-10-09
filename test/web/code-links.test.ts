import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, CodeLinksData } from "../../src/shared/types.ts";
import { mergedCodeLinks } from "../../src/web/searchfox-url.ts";

const artifact = (rev: string, links: CodeLinksData["links"], createdAt: string): Artifact<CodeLinksData> => ({
  id: createdAt, sessionId: "S", type: "CodeLinks", status: "verified", data: { rev, links },
  provenance: { taskId: "runtime" }, epoch: null, createdAt,
});

test("mergedCodeLinks uses the newest link per token for the requested revision", () => {
  assert.deepEqual(mergedCodeLinks([
    artifact("a", { Foo: "old", Bar: null }, "1"),
    artifact("b", { Foo: "other revision" }, "2"),
    artifact("a", { Foo: null, Baz: "baz" }, "3"),
  ], "a"), { Foo: null, Bar: null, Baz: "baz" });
});
