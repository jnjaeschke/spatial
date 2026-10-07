#!/usr/bin/env node
// Stub for webspec-index: `query <url> --format json` resolves every URL with a fragment to a two-step algorithm.
const [command, url] = process.argv.slice(2);
const anchor = url?.split("#")[1];
if (command !== "query" || !anchor) {
  process.stderr.write(`Error: URL not recognized: ${url}`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ spec: "HTML", anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content: "To do it:\n\n1. Edit the line.\n2. Add the file." }));
