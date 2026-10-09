import { test } from "node:test";
import assert from "node:assert/strict";
import { composerKey } from "../../src/web/composer-key.ts";

const key = (over: Partial<Parameters<typeof composerKey>[0]>) => composerKey({ key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...over });

test("Enter submits", () => assert.equal(key({}), "submit"));
test("Ctrl+Enter and Meta+Enter insert a newline", () => { assert.equal(key({ ctrlKey: true }), "newline"); assert.equal(key({ metaKey: true }), "newline"); });
test("Shift+Enter keeps the native newline", () => assert.equal(key({ shiftKey: true }), "native"));
test("Enter while composing (IME) does nothing", () => assert.equal(key({ isComposing: true }), null));
test("other keys are not handled", () => assert.equal(key({ key: "a" }), null));
