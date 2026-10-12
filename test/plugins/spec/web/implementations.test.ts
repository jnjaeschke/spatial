import { test } from "node:test";
import assert from "node:assert/strict";
import { columnState } from "../../../../src/plugins/spec/web/implementations.ts";

test("columnState: busy while a mapping, search or alignment of this algorithm and engine runs; the latest failure otherwise", () => {
  const task = (kind: string, status: string, engine: string, error: string | null = null) => ({ kind, status, input: { algorithmId: "A", engine }, error }) as never;
  assert.deepEqual(columnState([task("mapEngine", "failed", "blink", "chromium-search exited with code 127")], "A", "blink"), { busy: false, failed: "chromium-search exited with code 127" });
  assert.deepEqual(columnState([task("mapEngine", "failed", "blink", "x"), task("findImplementation", "running", "blink")], "A", "blink"), { busy: true, failed: null });
  assert.deepEqual(columnState([task("alignSteps", "running", "gecko")], "A", "blink"), { busy: false, failed: null });
  assert.deepEqual(columnState([task("mapEngine", "failed", "blink", "x"), task("mapEngine", "succeeded", "blink")], "A", "blink"), { busy: false, failed: null });
  assert.deepEqual(columnState([task("alignSteps", "failed", "blink", "no function")], "A", "blink"), { busy: false, failed: "no function" });
});
