import { ENGINES, HttpError, putUserArtifact, readJson, requireArtifact, requireSession, send, text, type Artifact, type Engine, type Id, type Route, type Runtime } from "../../../plugin-api.ts";
import type { SpecHop } from "../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecExploreRequestData, SpecOpenedData, SpecTraceData } from "../shared/types.ts";
import { openSpec } from "../runtime/open.ts";
import { summaryKey, summaryViews } from "../runtime/summaries.ts";
import { isSpecQuery } from "../shared/refs.ts";
import { SpecNotFoundError } from "../tasks/load-spec-algorithm/task.ts";
import { pathOpens } from "../shared/effect-path.ts";
import { decideProposal, searchRunning, startSearch, storedMapping, storedMappings } from "../runtime/mappings.ts";
import { siteKey } from "../shared/engine.ts";

const isString = (value: unknown): value is string => typeof value === "string";

function parseFrom(value: unknown): SpecOpenedData["from"] {
  if (value === null) return null;
  const from = value as { anchor?: unknown; step?: unknown } | undefined;
  if (typeof from !== "object" || !isString(from.anchor) || !from.anchor || !isString(from.step)) throw new HttpError(400, "from must be null or { anchor, step }");
  return { anchor: from.anchor, step: from.step };
}

function parseTrace(value: unknown): SpecTraceData {
  const trace = value as Partial<SpecTraceData> | null | undefined;
  if (typeof trace !== "object" || trace === null || !isString(trace.traceId) || !trace.traceId || !isString(trace.title) || !Array.isArray(trace.entries)
    || !trace.entries.every((entry) => typeof entry === "object" && entry !== null && isString(entry.anchor) && isString(entry.step) && isString(entry.note))) throw new HttpError(400, "trace must be { traceId, title, entries: { anchor, step, note }[] }");
  return { traceId: trace.traceId, title: trace.title, entries: trace.entries.map(({ anchor, step, note }) => ({ anchor, step, note })) };
}

const isOpen = (rt: Runtime, sessionId: string, anchor: string) => rt.store.listArtifacts(sessionId, "SpecOpened").some((a) => (a.data as SpecOpenedData).anchor === anchor);
const lookupStatus = (error: unknown) => (error as Error).cause instanceof SpecNotFoundError ? 404 : 502;

/** An engine named in a request. */
export function parseEngine(value: unknown): Engine {
  if (typeof value !== "string" || !(ENGINES as readonly string[]).includes(value)) throw new HttpError(400, "engine must be gecko, blink or webkit");
  return value as Engine;
}

/** The latest algorithm artifact for `ref`; 404 when it has never been opened. */
export function requireAlgorithm(rt: Runtime, sessionId: Id, ref: string): Artifact<SpecAlgorithmData> {
  const algorithm = rt.store.listArtifacts(sessionId, "SpecAlgorithm").findLast((a) => (a.data as SpecAlgorithmData).ref === ref) as Artifact<SpecAlgorithmData> | undefined;
  if (!algorithm) throw new HttpError(404, `Unknown algorithm: ${ref}`);
  return algorithm;
}

/** HTTP routes of the spec explorer: user actions stored as user artifacts. */
export function specRoutes(rt: Runtime): Route[] {
  return [
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/open$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const anchor = text(body, "anchor");
      if (!isSpecQuery(anchor)) throw new HttpError(400, "anchor must be SPEC#anchor or a spec URL with a fragment");
      const from = parseFrom(body.from);
      if (from && !isOpen(rt, session.id, from.anchor)) throw new HttpError(409, `${from.anchor} is not open`);
      let result;
      try { result = await openSpec(rt, session.id, anchor, from); }
      catch (error) { throw new HttpError(lookupStatus(error), (error as Error).message); }
      send(res, 201, { openedId: result.opened.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/explore$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const request = requireArtifact(rt, session.id, text(await readJson(req), "requestId"), "SpecExploreRequest", "explore request");
      const { anchors } = request.data as SpecExploreRequestData;
      try { for (const anchor of anchors) await openSpec(rt, session.id, anchor, null); }
      catch (error) { throw new HttpError(lookupStatus(error), (error as Error).message); }
      send(res, 201, { opened: anchors.length });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/traces$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const trace = parseTrace((await readJson(req)).trace);
      const start = rt.store.listArtifacts(session.id, "WorkflowStart").at(-1);
      if (!start) throw new HttpError(409, "Session has no start request");
      for (const { anchor } of trace.entries) if (!isOpen(rt, session.id, anchor)) throw new HttpError(409, `${anchor} is not open`);
      send(res, 201, { artifactId: putUserArtifact(rt, session.id, "SpecTrace", trace, start.id).id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/effect-path$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const ref = text(body, "ref"), effectId = text(body, "effectId");
      if (!isSpecQuery(ref)) throw new HttpError(400, "ref must be SPEC#anchor or a spec URL with a fragment");
      if (!isOpen(rt, session.id, ref)) throw new HttpError(409, `${ref} is not open`);
      let hops: SpecHop[];
      try { ({ hops } = await rt.run<{ hops: SpecHop[] }>(session.id, "loadEffectPath", { ref, effectId })); }
      catch (error) { throw new HttpError(lookupStatus(error), (error as Error).message); }
      const opens = pathOpens(hops);
      if (!opens.length) throw new HttpError(409, "The witness path stays in this algorithm");
      try {
        await Promise.all([...new Set(opens.map((open) => open.anchor))].map((anchor) => rt.run(session.id, "loadSpecAlgorithm", { ref: anchor })));
        for (const open of opens) await openSpec(rt, session.id, open.anchor, open.from);
      } catch (error) { throw new HttpError(lookupStatus(error), (error as Error).message); }
      send(res, 201, { opened: opens.length });
    }],
    ["GET", /^\/api\/sessions\/([^/]+)\/spec\/summaries$/, async ({ params }) => summaryViews(rt, requireSession(rt, params[0]!).id)],
    ["GET", /^\/api\/sessions\/([^/]+)\/spec\/mappings$/, async ({ params, url }) => storedMappings(rt, requireSession(rt, params[0]!).id, parseEngine(url.searchParams.get("engine")))],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/mappings\/find$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const algorithm = requireAlgorithm(rt, session.id, text(body, "ref"));
      const ref = algorithm.data.ref;
      const engine = parseEngine(body.engine);
      const staleKey = body.stale === undefined || body.stale === null ? null : text(body, "stale");
      const mapping = storedMapping(rt.knowledge, engine, ref);
      if (!mapping) throw new HttpError(409, `${ref} has no ${engine} mapping yet`);
      const stale = staleKey === null ? null : mapping.sites.find((site) => site.stale && siteKey(site) === staleKey);
      if (stale === undefined) throw new HttpError(404, `No stale site ${staleKey} in ${ref}`);
      if (searchRunning(rt, engine, ref)) throw new HttpError(409, `A ${engine} search for ${ref} is running`);
      send(res, 202, { taskId: startSearch(rt, session.id, engine, algorithm, stale).taskId });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/mappings\/decide$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const ref = requireAlgorithm(rt, session.id, text(body, "ref")).data.ref, key = text(body, "key"), decision = text(body, "decision");
      const engine = parseEngine(body.engine);
      if (decision !== "confirm" && decision !== "reject") throw new HttpError(400, "decision must be confirm or reject");
      const entry = decideProposal(rt, session.id, engine, ref, key, decision);
      if (!entry) throw new HttpError(404, `No proposal ${key} in ${ref}`);
      send(res, 201, { entryId: entry.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/summaries\/flag$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const ref = text(await readJson(req), "ref");
      const algorithm = rt.store.listArtifacts(session.id, "SpecAlgorithm").findLast((a) => (a.data as SpecAlgorithmData).ref === ref);
      if (!algorithm) throw new HttpError(404, `Unknown algorithm: ${ref}`);
      const read = rt.knowledge.get("global", "spec", summaryKey(algorithm.data as SpecAlgorithmData));
      if (read.state !== "current") throw new HttpError(409, `${ref} has no current summary`);
      const entry = rt.knowledge.put("global", "spec", summaryKey(algorithm.data as SpecAlgorithmData), null, { by: "user", sessionId: session.id });
      rt.emit(session.id, "user", "spec.summary", { ref });
      send(res, 201, { entryId: entry.id });
    }],
  ];
}
