import type { InvestigationLocation } from "../shared/types.ts";

/** Checks each cited quote against the file at the base: the quote must occur on the cited line or within two lines of it (nearest wins and corrects `line`). Unverifiable locations are dropped with a reason. */
export async function verifyLocations(locations: InvestigationLocation[], read: (path: string) => Promise<string>): Promise<{ verified: InvestigationLocation[]; dropped: string[] }> {
  const verified: InvestigationLocation[] = [], dropped: string[] = [];
  const files = new Map<string, string[] | null>();
  for (const location of locations) {
    const where = `${location.path}:${location.line}`;
    if (!files.has(location.path)) files.set(location.path, await read(location.path).then((text) => text.split("\n"), () => null));
    const lines = files.get(location.path)!;
    const needle = location.quote.trim();
    if (!lines) { dropped.push(`${where}: file not found at the base`); continue; }
    if (!needle) { dropped.push(`${where}: empty quote`); continue; }
    const line = [0, -1, 1, -2, 2].map((delta) => location.line + delta).find((candidate) => candidate >= 1 && candidate <= lines.length && lines[candidate - 1]!.includes(needle));
    if (line === undefined) dropped.push(`${where}: quote not found near the line`);
    else verified.push({ ...location, line });
  }
  return { verified, dropped };
}
