/** Spec section markdown → plain text for compact cards. */
export function plainSpecText(md: string, max: number): string {
  const text = md
    .replace(/\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*\*?([^*]+)\*\*\*?/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1");
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
}

/** A numbered step of a spec algorithm; `number` is the dotted path, e.g. "4.2". */
export interface SpecStep { number: string; depth: number; text: string }

const ITEM = /^( *)(\d+)\.\s+(.*)$/;

/** The steps of the first numbered algorithm in a section's markdown (webspec-index indents nested lists by 4 spaces); empty when the section has none. Indented lines that are not items, such as notes, continue the previous step. */
export function parseSteps(markdown: string): SpecStep[] {
  const steps: { number: string; depth: number; parts: string[] }[] = [];
  const path: string[] = [];
  for (const line of markdown.replaceAll("\t", "    ").split("\n")) {
    const item = ITEM.exec(line);
    if (item) {
      const depth = Math.min(Math.floor(item[1]!.length / 4), path.length);
      if (depth === 0 && item[2] === "1" && steps.length > 0) break;
      path.length = depth;
      path.push(item[2]!);
      steps.push({ number: path.join("."), depth, parts: [item[3]!] });
    } else if (steps.length > 0 && /^ +\S/.test(line)) {
      steps.at(-1)!.parts.push(line.trim().replace(/^>\s*/, ""));
    }
  }
  return steps.map(({ number, depth, parts }) => ({ number, depth, text: plainSpecText(parts.join(" ").replace(/\s+/g, " ").trim(), Infinity) }));
}
