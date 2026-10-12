import { isAbsolute } from "node:path";
import { HttpError, putUserArtifact, readJson, requireArtifact, requireSession, send, str, type Route, type Runtime } from "../../../plugin-api.ts";
import type { MemoryNoticeData, MemoryReactionData, MemoryScope, SteerMemory } from "../shared/types.ts";
import { MEMORY_NAMESPACE, confirmedKey, currentMemories, isSlug, memoryKey, memoryProblems, scopeId } from "../runtime/memories.ts";

const repoOf = (value: unknown): string => {
  const repo = str(value, "repo");
  if (!isAbsolute(repo)) throw new HttpError(400, "repo must be an absolute path");
  return repo;
};
const scopeOf = (value: unknown): MemoryScope => {
  if (value !== "repo" && value !== "global") throw new HttpError(400, "scope must be repo or global");
  return value;
};
const slugOf = (value: unknown): string => {
  const key = str(value, "key");
  if (!isSlug(key)) throw new HttpError(400, "key must match ^[a-z0-9-]{3,60}$");
  return key;
};

/** Routes of the memories panel and of the thumbs on a memory notice. */
export function memoryRoutes(rt: Runtime): Route[] {
  return [
    ["GET", /^\/api\/memories$/, async ({ url }) => currentMemories(rt.knowledge, repoOf(url.searchParams.get("repo") ?? undefined))],
    ["PUT", /^\/api\/memories$/, async ({ req, res }) => {
      const body = await readJson(req);
      const repo = repoOf(body.repo), scope = scopeOf(body.scope), key = slugOf(body.key);
      if (body.entryId !== undefined && typeof body.entryId !== "string") throw new HttpError(400, "entryId must be a string");
      const id = scopeId(scope, repo), current = rt.knowledge.get(id, MEMORY_NAMESPACE, memoryKey(key));
      if (body.entryId !== undefined && (current.state !== "current" || current.entry.id !== body.entryId)) throw new HttpError(409, `The memory ${key} changed since it was opened`);
      const problems = memoryProblems(body.memory);
      const source = (body.memory as { source?: Partial<SteerMemory["source"]> } | null)?.source;
      if (current.state !== "current" && (typeof source?.sessionId !== "string" || typeof source.steer !== "string" || !Number.isInteger(source.epoch))) problems.push("source must be { sessionId, epoch, steer }");
      if (problems.length) throw new HttpError(400, problems.join("; "));
      const m = body.memory as SteerMemory;
      const origin = current.state === "current" ? (current.entry.value as SteerMemory).source : m.source;
      const value: SteerMemory = { situation: m.situation, observed: m.observed, wanted: m.wanted, why: m.why, phases: m.phases, kinds: m.kinds, source: { sessionId: origin.sessionId, epoch: origin.epoch, steer: origin.steer } };
      const entry = rt.knowledge.put(id, MEMORY_NAMESPACE, memoryKey(key), value, { by: "user", sessionId: value.source.sessionId });
      send(res, 201, { entryId: entry.id });
    }],
    ["POST", /^\/api\/memories\/move$/, async ({ req, res }) => {
      const body = await readJson(req);
      const repo = repoOf(body.repo), from = scopeOf(body.from), to = scopeOf(body.to), key = slugOf(body.key);
      const entryId = str(body.entryId, "entryId");
      const fromId = scopeId(from, repo), toId = scopeId(to, repo), keyName = memoryKey(key);
      const source = rt.knowledge.get(fromId, MEMORY_NAMESPACE, keyName);
      if (source.state !== "current" || source.entry.id !== entryId) throw new HttpError(409, `The memory ${key} changed since it was opened`);
      if (rt.knowledge.get(toId, MEMORY_NAMESPACE, keyName).state === "current") throw new HttpError(409, `The memory ${key} already exists in ${to} scope`);
      const value = source.entry.value as SteerMemory;
      const provenance = { by: "user", sessionId: value.source.sessionId } as const;
      const moved = rt.knowledge.put(toId, MEMORY_NAMESPACE, keyName, value, provenance);
      rt.knowledge.put(fromId, MEMORY_NAMESPACE, keyName, null, provenance);
      send(res, 201, { entryId: moved.id });
    }],
    ["DELETE", /^\/api\/memories$/, async ({ req, res }) => {
      const body = await readJson(req);
      const repo = repoOf(body.repo), scope = scopeOf(body.scope), key = slugOf(body.key);
      const read = rt.knowledge.get(scopeId(scope, repo), MEMORY_NAMESPACE, memoryKey(key));
      if (read.state !== "current") throw new HttpError(409, `No current memory ${key} in ${scope} scope`);
      rt.knowledge.put(scopeId(scope, repo), MEMORY_NAMESPACE, memoryKey(key), null, { by: "user", sessionId: (read.entry.value as SteerMemory).source.sessionId });
      send(res, 204);
    }],
    ["POST", /^\/api\/memories\/react$/, async ({ req, res }) => {
      const body = await readJson(req);
      if (body.reaction !== "up" && body.reaction !== "down") throw new HttpError(400, "reaction must be up or down");
      const session = requireSession(rt, str(body.sessionId, "sessionId"));
      const notice = requireArtifact(rt, session.id, str(body.noticeId, "noticeId"), "MemoryNotice", "notice");
      const { key, scope, entryId } = notice.data as MemoryNoticeData;
      const id = scopeId(scope, session.repoDir, session.id);
      const read = rt.knowledge.get(id, MEMORY_NAMESPACE, memoryKey(key));
      if (read.state !== "current" || read.entry.id !== entryId) throw new HttpError(409, "The memory changed since this notice");
      const by = { by: "user", sessionId: session.id } as const;
      if (body.reaction === "up") rt.knowledge.put(id, MEMORY_NAMESPACE, confirmedKey(key), { entryId }, by);
      else rt.knowledge.put(id, MEMORY_NAMESPACE, memoryKey(key), null, by);
      const reaction = putUserArtifact(rt, session.id, "MemoryReaction", { notice: notice.id, reaction: body.reaction } satisfies MemoryReactionData, notice.id);
      send(res, 201, { artifactId: reaction.id });
    }],
  ];
}
