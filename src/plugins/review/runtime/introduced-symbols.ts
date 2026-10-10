import type { DiffData } from "../../../plugin-api.ts";
import { numberLines } from "../../../plugin-api.ts";

/** Identifiers of at least 3 characters on added lines, in first-seen order. */
export function addedIdentifiers(diff: DiffData): string[] {
  const names = new Set<string>();
  for (const file of diff.files) for (const hunk of file.hunks) for (const row of hunk.lines) {
    if (row.kind !== "add") continue;
    for (const match of row.text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) if (match[0].length >= 3) names.add(match[0]);
  }
  return [...names];
}

const HEADER = /\.(?:h|hh|hpp|idl|webidl)$/i;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The added line that defines `name`, preferring header-like files, else the first in diff order; null when no added line looks like a definition. */
export function definitionSite(diff: DiffData, name: string): { path: string; hunkId: string; line: number; commit: number } | null {
  const escaped = escapeRegExp(name);
  const keywordDef = new RegExp(`\\b(?:fn|struct|enum|class|interface|function|const|let|var|def|type|impl|trait|union|namespace|typedef|using|define)\\s+(?:\\w+::)*${escaped}\\b`);
  const declaration = new RegExp(`^(?!\\s*(?:return|else|case|delete|new|throw|co_return|co_await)\\b)\\s*[\\w:<>,*&\\s]*[\\w>*&]\\s*[*&]*\\s*\\b(?:\\w+::)*${escaped}\\s*[;=({\\[]`);
  const matches: { path: string; hunkId: string; line: number; commit: number }[] = [];
  for (const file of diff.files) for (const hunk of file.hunks) {
    for (const row of numberLines(hunk)) {
      if (row.kind !== "add" || (!keywordDef.test(row.text) && !declaration.test(row.text))) continue;
      matches.push({ path: file.path, hunkId: hunk.id, line: row.new!, commit: row.commit ?? 0 });
    }
  }
  return matches.find((site) => HEADER.test(site.path)) ?? matches[0] ?? null;
}
