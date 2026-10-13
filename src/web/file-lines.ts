import { exported } from "./exported.ts";
import { promiseCache } from "./promise-cache.ts";
import { get } from "./api.ts";

const cached = promiseCache<string[]>();

export function loadFileLines(sessionId: string, diffId: string, path: string): Promise<string[]> {
  if (exported) {
    const lines = exported.diffId === diffId ? exported.files[path] : undefined;
    return lines ? Promise.resolve(lines) : Promise.reject(new Error(lines === null ? "File too large for this export" : "Not included in this export"));
  }
  return cached(`${sessionId}\0${diffId}\0${path}`, () => get<{ lines: string[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/diffs/${encodeURIComponent(diffId)}/file?path=${encodeURIComponent(path)}`).then((body) => body.lines));
}
