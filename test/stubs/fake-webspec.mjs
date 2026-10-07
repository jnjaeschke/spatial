#!/usr/bin/env node
// Stub for webspec-index. `query <url> --format json` resolves every URL with a fragment to a two-step algorithm;
// `analyze <file>` checks `// Step N. text` comments against those steps, scoped to the nearest URL above.
import { readFileSync } from "node:fs";

const STEPS = ["Edit the line.", "Add the file."];
const [command, arg] = process.argv.slice(2);
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
  process.exit(0);
}
const anchor = arg?.split("#")[1];
if (command !== "query" || !anchor) {
  process.stderr.write(`Error: URL not recognized: ${arg}`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ spec: "HTML", anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content: `To do it:\n\n${STEPS.map((step, i) => `${i + 1}. ${step}`).join("\n")}` }));
