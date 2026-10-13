#!/usr/bin/env node
// Stub for webspec-index. `query HTML#navigate` and `effects HTML#navigate` print captured fixtures. `query <ref>` resolves any other
// ref or URL with a fragment to a two-step algorithm of the ref's spec without effects, except `#missing` (not found) and `#broken`
// (crash); `effects <ref>` of those has none.
// `search <phrase>` returns navigate and navigate-fragid. `refs <ref>` returns captured navigate refs, or empty lists. `idl` finds nothing. `analyze <file>` checks `// Step N. text` comments against the two steps,
// scoped to the nearest URL above.
import { readFileSync } from "node:fs";

const STEPS = ["Edit the line.", "Add the file."];
const fixture = (name) => readFileSync(new URL(`../fixtures/webspec/${name}`, import.meta.url), "utf8");
const [command, ...rest] = process.argv.slice(2);
const arg = rest.includes("--") ? rest[rest.indexOf("--") + 1] : rest[0];
// Returns the exit code instead of calling process.exit, which drops unflushed output on macOS, where pipes are asynchronous.
function main() {
  if (command === "analyze") {
    const scopes = new Map();
    let url = null;
    readFileSync(arg, "utf8").split("\n").forEach((line, index) => {
      url = /https?:\/\/\S+#\S+/.exec(line)?.[0] ?? url;
      const step = /\/\/\s*Step (\d+)\.\s*(.*)$/.exec(line);
      if (!step || !url) return;
      const n = Number(step[1]);
      const result = n > STEPS.length ? "not_found" : STEPS[n - 1] === step[2] ? "exact" : "mismatch";
      if (!scopes.has(url)) scopes.set(url, { url, validations: [] });
      scopes.get(url).validations.push({ line: index, step: [n], comment_text: step[2], result });
    });
    if (scopes.size) process.stdout.write(JSON.stringify({ file: arg, scopes: [...scopes.values()] }));
    return 0;
  }
  if (command === "search") {
    process.stdout.write(JSON.stringify({ query: arg, results: [
      { spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", snippet: "To navigate a navigable" },
      { spec: "HTML", anchor: "navigate-fragid", title: "navigate to a fragment", type: "algorithm", snippet: "To navigate to a fragment" },
    ] }));
    return 0;
  }
  if (command === "refs") {
    if (arg === "HTML#navigate") process.stdout.write(fixture("navigate-refs.json"));
    else process.stdout.write(JSON.stringify({ query: arg, direction: "both", matches: [{ spec: arg.split("#")[0], anchor: arg.split("#")[1] ?? "", type: "unknown", resolution: "exact", outgoing: [], incoming: [] }] }));
    return 0;
  }
  if (command === "idl") {
    process.stdout.write(JSON.stringify({ query: arg, matches: [] }));
    return 0;
  }
  const anchor = arg?.split("#")[1];
  if ((command !== "query" && command !== "effects") || !anchor || anchor === "missing") {
    process.stderr.write(`Error: URL not recognized: ${arg}`);
    return 1;
  }
  if (anchor === "broken") {
    process.stderr.write("thread 'main' panicked");
    return 101;
  }
  if (arg === "HTML#navigate") {
    process.stdout.write(fixture(command === "query" ? "navigate-query.json" : "navigate-effects.json"));
    return 0;
  }
  if (command === "effects") {
    process.stdout.write(JSON.stringify({ effects: [], explanations: [] }));
    return 0;
  }
  const spec = /^[A-Za-z0-9-]+#/.test(arg) ? arg.split("#")[0] : "HTML";
  process.stdout.write(JSON.stringify({ spec, anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content: `To do it, see [the setup](HTML#setup):\n\n${STEPS.map((step, i) => `${i + 1}. ${step}`).join("\n")}`, outgoing_refs: { total: 1 }, effects: [], effects_status: { state: "ready", semantics: "may", issues: [], omitted: 0 }, sha: `fake-${anchor}` }));
  return 0;
}
process.exitCode = main();
