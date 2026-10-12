/** A numbered step of a spec algorithm; `number` is the dotted path, e.g. "4.2". */
export interface SpecStep { number: string; depth: number; text: string }

/** Step markdown as plain text: only paired emphasis and code spans, links and escapes are unwrapped, so identifiers such as `_foo` and expressions such as `a * b` survive. */
const stepText = (markdown: string) => markdown
  .replace(/\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, "$1")
  .replace(/\*\*\*?([^*]+)\*\*\*?/g, "$1")
  .replace(/\*([^*]+)\*/g, "$1")
  .replace(/`([^`]*)`/g, "$1")
  .replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1");

/** Steps as prompt lines: `[4.2] text`, indented by depth. */
export const stepLines = (steps: SpecStep[]) => steps.map((step) => `${"    ".repeat(step.depth)}[${step.number}] ${step.text}`).join("\n");

const ITEM = /^( *)(\d+)\.\s+(.*)$/;

/** The steps of the first numbered algorithm in a section's markdown, numbered as webspec-index addresses them, so step numbers are unique (webspec-index indents nested lists by 4 spaces); empty when the section has none. Indented lines that are not items, such as notes, continue the previous step. */
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
  return steps.map(({ number, depth, parts }) => ({ number, depth, text: stepText(parts.join(" ").replace(/\s+/g, " ").trim()) }));
}
