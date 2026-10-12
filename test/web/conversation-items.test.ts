import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, ChatMessageData } from "../../src/shared/types.ts";
import { interleave } from "../../src/web/conversation-items.ts";

const at = (id: string, createdAt: string) => ({ id, createdAt }) as Artifact;

test("messages and items are in creation order; at the same time a message comes first", () => {
  const messages = [at("M1", "1"), at("M2", "3")] as Artifact<ChatMessageData>[];
  const items = [at("I1", "2"), at("I2", "3")];
  assert.deepEqual(interleave(messages, items).map((entry) => "message" in entry ? entry.message.id : entry.item.id), ["M1", "I1", "M2", "I2"]);
  assert.deepEqual(interleave([], []), []);
  assert.deepEqual(interleave(messages, []).map((entry) => "message" in entry), [true, true]);
});
