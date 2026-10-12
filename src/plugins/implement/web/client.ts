import type { MemoryScope, MemoryView, SteerMemory } from "../shared/types.ts";
import { delJson, getJson, postJson, putJson } from "../../../web/plugin-api.ts";

/** HTTP calls of memories: the repo page panel and the thumbs on a memory notice. */
export const memoriesClient = {
  list: (repo: string) => getJson<MemoryView[]>(`/api/memories?repo=${encodeURIComponent(repo)}`),
  put: (repo: string, scope: MemoryScope, key: string, memory: SteerMemory, entryId?: string) => putJson<{ entryId: string }>("/api/memories", { repo, scope, key, memory, entryId }),
  move: (repo: string, from: MemoryScope, to: MemoryScope, key: string, entryId: string) => postJson<{ entryId: string }>("/api/memories/move", { repo, from, to, key, entryId }),
  remove: (repo: string, scope: MemoryScope, key: string) => delJson<void>("/api/memories", { repo, scope, key }),
  react: (sessionId: string, noticeId: string, reaction: "up" | "down") => postJson<{ artifactId: string }>("/api/memories/react", { sessionId, noticeId, reaction }),
};
