import type { DiffFile, Hunk } from "../shared/types.ts";

export function splitInlineCode(text: string): { code: boolean; text: string }[] {
  const parts = text.split("`");
  if (parts.length % 2 === 0) return [{ code: false, text }];
  const out: { code: boolean; text: string }[] = [];
  parts.forEach((p, i) => {
    if (i % 2 === 1 && p === "") { out.push({ code: false, text: "``" }); return; }
    if (p !== "") out.push({ code: i % 2 === 1, text: p });
  });
  return out.reduce<typeof out>((acc, p) => {
    const last = acc.at(-1);
    if (last && !last.code && !p.code) last.text += p.text;
    else acc.push({ ...p });
    return acc;
  }, []);
}

/** Searchfox search for a code token. `sourceBase` is e.g. `https://searchfox.org/firefox-main/source/`. */
export function searchfoxSearchUrl(sourceBase: string, token: string): string {
  return sourceBase.replace(/source\/$/, "search?q=") + encodeURIComponent(token.replace(/\(.*\)$/, ""));
}

export function findInHunks(token: string, hunks: { file: DiffFile; hunk: Hunk }[]): { path: string; hunkId: string; text: string } | null {
  const full = token.replace(/\(.*\)$/, "");
  const last = full.split(/::|\./).at(-1)!;
  const candidates = [...new Set([full, last])].filter((c) => c.length >= 3);
  for (const c of candidates) {
    for (const changed of [true, false]) {
      for (const { file, hunk } of hunks) {
        const line = hunk.lines.find((l) => (l.kind !== "ctx") === changed && l.text.includes(c));
        if (line) return { path: file.path, hunkId: hunk.id, text: line.text };
      }
    }
  }
  return null;
}
