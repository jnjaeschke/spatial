const cache = new Map<string, Promise<string[]>>();

export function loadFileLines(sessionId: string, diffId: string, path: string): Promise<string[]> {
  const key = `${sessionId}\0${diffId}\0${path}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetch(`/api/sessions/${encodeURIComponent(sessionId)}/diffs/${encodeURIComponent(diffId)}/file?path=${encodeURIComponent(path)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        return body.lines as string[];
      });
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return promise;
}
