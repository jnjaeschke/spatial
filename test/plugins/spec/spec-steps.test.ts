import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { Root, RootContent } from "hast";
import { rehypeSpecSteps } from "../../../src/plugins/spec/web/spec-steps.ts";
import type { SpecSite } from "../../../src/shared/types.ts";

function steps(markdown: string): { path: string; text: string }[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSpecSteps);
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  const out: { path: string; text: string }[] = [];
  const text = (node: RootContent): string => node.type === "text" ? node.value : "children" in node ? (node.children as RootContent[]).filter((child) => !(child.type === "element" && child.tagName === "ol")).map(text).join("") : "";
  const walk = (node: Root | RootContent) => {
    if (node.type === "element" && node.properties.dataStep !== undefined) out.push({ path: String(node.properties.dataStep), text: text(node).trim() });
    if ("children" in node) for (const child of node.children as RootContent[]) walk(child);
  };
  walk(tree);
  return out;
}

test("nested lists get dotted paths", () => {
  assert.deepEqual(steps("1. A\n2. B\n\n    1. B1\n    2. B2\n3. C"), [{ path: "1", text: "A" }, { path: "2", text: "B" }, { path: "2.1", text: "B1" }, { path: "2.2", text: "B2" }, { path: "3", text: "C" }]);
});

test("a list's start attribute sets its first number", () => {
  assert.deepEqual(steps("Intro.\n\n3. C\n4. D").map((s) => s.path), ["3", "4"]);
});

test("lists inside a note in a step are not steps, and numbering continues after the note", () => {
  assert.deepEqual(steps("1. A\n\n    > **Note:** see\n    >\n    > 1. not a step\n2. B").map((s) => s.path), ["1", "2"]);
});

test("webspec-index step paths of HTML#navigate are annotated steps", () => {
  const query = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-query.json", import.meta.url), "utf8"));
  const effects = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-effects.json", import.meta.url), "utf8"));
  const annotated = new Set(steps(query.content).map((s) => s.path));
  const here = (s: SpecSite | undefined) => s?.spec === "HTML" && s.anchor === "navigate" && s.step_path;
  const cited = new Set<string>();
  for (const effect of effects.effects) for (const location of [effect.location, ...(effect.other_locations ?? [])]) if (here(location)) cited.add(location.step_path.join("."));
  for (const explanation of effects.explanations) for (const witness of explanation.witnesses) for (const hop of witness.hops) for (const s of [hop.from, hop.to, hop.site.subject]) if (here(s)) cited.add(s.step_path.join("."));
  assert.ok(cited.size >= 10);
  assert.deepEqual([...cited].filter((path) => !annotated.has(path)), []);
});
