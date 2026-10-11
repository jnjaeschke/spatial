import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { Root, RootContent } from "hast";
import { checkSummary, citedText } from "../../../src/plugins/spec/shared/summary-check.ts";
import { parseSteps } from "../../../src/plugins/spec/shared/steps.ts";
import { rehypeSpecSteps } from "../../../src/plugins/spec/web/spec-steps.ts";

const steps = parseSteps("1. Let *x* be the [node](DOM#concept-node).\n2. Fire `load` at *x*:\n\n    1. Run [the setup](HTML#setup).\n3. Return.");

test("a valid summary passes", () => {
  assert.deepEqual(checkSummary([{ text: "Takes `x` as the `node` and fires `load`.", steps: ["1", "2"] }, { text: "Runs `the setup`.", steps: ["2"] }], steps), []);
});

test("an invented identifier, a nonexistent step and empty citations are errors", () => {
  assert.deepEqual(checkSummary([{ text: "Uses `y`.", steps: ["1"] }, { text: "Ends.", steps: ["9"] }, { text: "Nothing.", steps: [] }], steps), [
    "Clause 1 names `y`, which its cited steps do not mention",
    "Clause 2 cites step 9, which the algorithm does not have",
    "Clause 3 cites no step",
  ]);
  assert.deepEqual(checkSummary([], steps), ["A summary has 1 to 4 clauses, got 0"]);
  assert.equal(checkSummary(Array.from({ length: 5 }, () => ({ text: "x", steps: ["1"] })), steps)[0], "A summary has 1 to 4 clauses, got 5");
});

test("a cited step includes its sub-steps", () => {
  assert.equal(citedText(steps, "2"), "Fire load at x:\nRun the setup.");
});

test("parseSteps numbers HTML#navigate as the web annotator does", () => {
  const content = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-query.json", import.meta.url), "utf8")).content;
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSpecSteps);
  const tree = processor.runSync(processor.parse(content)) as Root;
  const annotated: string[] = [];
  const walk = (node: Root | RootContent) => { if (node.type === "element" && node.properties.dataStep !== undefined) annotated.push(String(node.properties.dataStep)); if ("children" in node) for (const child of node.children as RootContent[]) walk(child); };
  walk(tree);
  assert.equal(annotated.length, 67);
  assert.deepEqual(parseSteps(content).map((step) => step.number), annotated);
});
