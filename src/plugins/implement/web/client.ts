import type { MemoryScope, MemoryView, SteerMemory } from "../shared/types.ts";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

/** HTTP calls of memories: the repo page panel and the thumbs on a memory notice. */
export const memoriesClient = {
  list: (repo: string) => call<MemoryView[]>("GET", `/api/memories?repo=${encodeURIComponent(repo)}`),
  put: (repo: string, scope: MemoryScope, key: string, memory: SteerMemory, entryId?: string) => call<{ entryId: string }>("PUT", "/api/memories", { repo, scope, key, memory, entryId }),
  move: (repo: string, from: MemoryScope, to: MemoryScope, key: string, entryId: string) => call<{ entryId: string }>("POST", "/api/memories/move", { repo, from, to, key, entryId }),
  remove: (repo: string, scope: MemoryScope, key: string) => call<void>("DELETE", "/api/memories", { repo, scope, key }),
  react: (sessionId: string, noticeId: string, reaction: "up" | "down") => call<{ artifactId: string }>("POST", "/api/memories/react", { sessionId, noticeId, reaction }),
};
