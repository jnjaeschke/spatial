import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathOpens } from "../../../src/plugins/spec/shared/effect-path.ts";

test("a witness path opens each algorithm it enters from the calling step, skipping continuations", () => {
  const raw = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-effects.json", import.meta.url), "utf8"));
  const witness = raw.explanations.find((e: any) => e.effect_id === "ef_e6c5f8c3e2980985").witnesses[0].hops.map((h: any) => ({ from: h.from, to: h.to, site: h.site.subject }));
  assert.deepEqual(pathOpens(witness), [
    { anchor: "HTML#fire-a-push/replace/reload-navigate-event", from: { anchor: "HTML#navigate", step: "22.4" } },
    { anchor: "HTML#inner-navigate-event-firing-algorithm", from: { anchor: "HTML#fire-a-push/replace/reload-navigate-event", step: "12" } },
    { anchor: "WEBIDL#wait-for-all", from: { anchor: "HTML#inner-navigate-event-firing-algorithm", step: "31.4" } },
  ]);
  assert.deepEqual(pathOpens([{ from: { spec: "A", anchor: "a" }, to: { spec: "A", anchor: "a", step_path: [1] }, site: { spec: "A", anchor: "a", step_path: [1] } }]), []);
});
