import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizePhabThread } from "../../src/plugins/review/tasks/summarize-phab-thread/task.ts";
import type { PhabCommentData } from "../../src/plugins/review/shared/types.ts";

const comment = (phid: string, txId: number, replyTo?: string) => ({ id: phid, type: "PhabComment", data: { revision: 42, phid, version: 1, author: `author${txId}`, bot: false, byMe: false, body: `body ${txId}`, replyTo, own: false, done: false, txId, dateCreated: txId } as PhabCommentData });

test("summarizePhabThread prompts oldest first and stores a proposed summary linked to every comment", async () => {
  let request: any;
  let stored: any;
  const links: unknown[][] = [];
  const comments = [comment("ROOT", 1), comment("R2", 2, "ROOT"), comment("R3", 3, "R2"), comment("R4", 4, "R3")];
  const ctx: any = {
    llm: { defaultSelection: { backend: "claude" }, run: async (value: unknown, selection: unknown) => { request = { value, selection }; return { json: { summary: "The request remains open." }, selection: { backend: "claude", model: "haiku", effort: "low" } }; } },
    artifacts: { view: () => ({ artifacts: comments }), put: (_type: string, status: string, data: unknown, llm: unknown) => { stored = { status, data, llm }; return { id: "SUMMARY" }; } },
    links: { put: (...args: unknown[]) => links.push(args) },
  };
  assert.deepEqual(await summarizePhabThread.run(ctx, { revision: 42, rootPhid: "ROOT" }), { summaryId: "SUMMARY" });
  assert.deepEqual(request.selection, { backend: "claude", model: "haiku", effort: "low" });
  assert.equal(request.value.tools, "none");
  assert.match(request.value.system, /one or two plain sentences/);
  assert.ok(request.value.prompt.indexOf("@author1 (1970-01-01T00:00:01.000Z): body 1") < request.value.prompt.indexOf("@author4 (1970-01-01T00:00:04.000Z): body 4"));
  assert.deepEqual(stored, { status: "proposed", data: { revision: 42, rootPhid: "ROOT", commentPhids: ["ROOT", "R2", "R3", "R4"], summary: "The request remains open." }, llm: request.selection });
  assert.deepEqual(links, [["SUMMARY", "ROOT", "derivedFrom"], ["SUMMARY", "R2", "derivedFrom"], ["SUMMARY", "R3", "derivedFrom"], ["SUMMARY", "R4", "derivedFrom"]]);
});

test("summarizePhabThread rejects threads with fewer than four comments", async () => {
  const ctx: any = { artifacts: { view: () => ({ artifacts: [comment("ROOT", 1), comment("R2", 2, "ROOT"), comment("R3", 3, "ROOT")] }) }, llm: { run: async () => { throw new Error("must not run"); } } };
  await assert.rejects(summarizePhabThread.run(ctx, { revision: 42, rootPhid: "ROOT" }), /at least 4 comments/);
});

test("summarizePhabThread rejects a reply without a summary", async () => {
  const comments = [comment("ROOT", 1), comment("R2", 2, "ROOT"), comment("R3", 3, "R2"), comment("R4", 4, "R3")];
  const ctx: any = { llm: { defaultSelection: { backend: "claude" }, run: async () => ({ json: {}, selection: { backend: "claude", model: "haiku", effort: "low" } }) }, artifacts: { view: () => ({ artifacts: comments }) } };
  await assert.rejects(summarizePhabThread.run(ctx, { revision: 42, rootPhid: "ROOT" }), /Phab thread summary failed validation:\n\$\.summary is missing/);
});
