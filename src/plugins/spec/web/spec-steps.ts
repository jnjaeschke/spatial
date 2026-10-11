import type { Element, ElementContent, Root, RootContent } from "hast";

/** Rehype plugin for spec algorithms: every `<li>` of an ordered list not inside another ordered list, and of each `<ol>` directly inside such an `<li>`, gets `data-step` with its dotted 1-based path ("4.2"); a list's `start` sets its first number. */
export function rehypeSpecSteps() {
  return (tree: Root) => { for (const child of tree.children) find(child); };
}

function find(node: RootContent | ElementContent): void {
  if (node.type !== "element") return;
  if (node.tagName === "ol") { number(node, []); return; }
  for (const child of node.children) find(child);
}

function number(ol: Element, parent: number[]): void {
  let n = Number(ol.properties.start ?? 1);
  for (const li of ol.children) {
    if (li.type !== "element" || li.tagName !== "li") continue;
    const path = [...parent, n++];
    li.properties.dataStep = path.join(".");
    for (const child of li.children) if (child.type === "element" && child.tagName === "ol") number(child, path);
  }
}
