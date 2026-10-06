import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkflowInfo } from "../../src/shared/types.ts";
import { commandSuggestions, completeCommand } from "../../src/web/slash.ts";

const commands: WorkflowInfo[] = [
  { id: "review", description: "Review changes", argHint: "<base..head>" },
  { id: "chat", description: "Chat about code", argHint: "<message>" },
];

test("commandSuggestions offers only matching slash prefixes", () => {
  assert.deepEqual(commandSuggestions("/", commands), commands);
  assert.deepEqual(commandSuggestions("/c", commands), [commands[1]]);
  assert.deepEqual(commandSuggestions("/rev", commands), [commands[0]]);
  assert.deepEqual(commandSuggestions("/review", commands), []);
  assert.deepEqual(commandSuggestions("/x", commands), []);
  for (const text of ["/chat ", "/chat hi", "hello", "", " /c"]) {
    assert.deepEqual(commandSuggestions(text, commands), [], text);
  }
});

test("completeCommand adds the command prefix and separating space", () => {
  assert.equal(completeCommand(commands[1]!), "/chat ");
});
