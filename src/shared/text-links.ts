import type { TextLink } from "./types.ts";

export interface TextPart { text: string; href?: string }

/** Splits `text` into plain parts and linked parts; earlier rules win where matches overlap. */
export function linkText(text: string, rules: TextLink[]): TextPart[] {
  let parts: TextPart[] = [{ text }];
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, "g");
    parts = parts.flatMap((part) => {
      if (part.href !== undefined) return [part];
      const out: TextPart[] = [];
      let last = 0;
      for (const m of part.text.matchAll(re)) {
        if (m[0] === "") continue;
        if (m.index > last) out.push({ text: part.text.slice(last, m.index) });
        out.push({ text: m[0], href: rule.url.replace(/\$(\d)/g, (_, n: string) => m[Number(n)] ?? "") });
        last = m.index + m[0].length;
      }
      if (last < part.text.length) out.push({ text: part.text.slice(last) });
      return out;
    });
  }
  return parts;
}

// Code spans, code fences and existing markdown links are left alone.
const PROTECTED = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\))/;

/** `markdown` with matches outside code and existing links written as markdown links. */
export function linkMarkdown(markdown: string, rules: TextLink[]): string {
  if (rules.length === 0) return markdown;
  return markdown.split(PROTECTED).map((chunk, i) => i % 2 === 1 ? chunk : linkText(chunk, rules).map((part) => part.href === undefined ? part.text : `[${part.text}](${part.href})`).join("")).join("");
}
