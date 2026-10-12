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

/** The steps of the first numbered algorithm in a section's markdown, each with its own source lines; sub-steps are separate steps. */
export function stepSources(markdown: string): { number: string; depth: number; lines: string[] }[] {
  const steps: { number: string; depth: number; lines: string[] }[] = [];
  const path: string[] = [];
  for (const line of markdown.replaceAll("\t", "    ").split("\n")) {
    const item = ITEM.exec(line);
    if (item) {
      const depth = Math.min(Math.floor(item[1]!.length / 4), path.length);
      if (depth === 0 && item[2] === "1" && steps.length > 0) break;
      path.length = depth;
      path.push(item[2]!);
      steps.push({ number: path.join("."), depth, lines: [item[3]!] });
    } else if (steps.length > 0 && /^ +\S/.test(line)) {
      steps.at(-1)!.lines.push(line.trim());
    }
  }
  return steps;
}

export function parseSteps(markdown: string): SpecStep[] {
  return stepSources(markdown).map(({ number, depth, lines }) => ({ number, depth, text: stepText(lines.map((line, i) => i ? line.replace(/^>\s*/, "") : line).join(" ").replace(/\s+/g, " ").trim()) }));
}

const LINK = /\]\(([A-Za-z0-9-]+#[^)\s]+)\)/g;

/** The `SPEC#anchor` refs each step links in its own text, by dotted step path; notes (`>` lines) are not part of it. */
export function stepLinks(markdown: string): Record<string, string[]> {
  return Object.fromEntries(stepSources(markdown).map(({ number, lines }) => [number, [...new Set(lines.filter((line, i) => i === 0 || !line.startsWith(">")).flatMap((line) => [...line.matchAll(LINK)].map((match) => match[1]!)))]]));
}
