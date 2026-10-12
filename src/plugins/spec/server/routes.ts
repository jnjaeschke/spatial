import { ENGINES, HttpError, putUserArtifact, readJson, requireArtifact, requireSession, send, text, type Artifact, type Engine, type Id, type Route, type Runtime } from "../../../plugin-api.ts";
import type { SpecHop } from "../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecExploreRequestData, SpecOpenedData, SpecTraceData } from "../shared/types.ts";
import { openSpec } from "../runtime/open.ts";
import { summaryKey, summaryViews } from "../runtime/summaries.ts";
import { isSpecQuery } from "../shared/refs.ts";
import { SpecNotFoundError } from "../tasks/load-spec-algorithm/task.ts";
import { pathOpens } from "../shared/effect-path.ts";
import { decideProposal, ensureMapping, searchRunning, startSearch, storedMapping, storedMappings } from "../runtime/mappings.ts";
import { siteKey, usedSites } from "../shared/engine.ts";
import { alignRunning, startAlign } from "../runtime/align.ts";
import { compareRunning, flagDifference, startCompare } from "../runtime/compare.ts";
import { implementationsData } from "../runtime/implementations.ts";
import { randomUUID } from "node:crypto";
import { isSpecRef } from "../shared/refs.ts";
import { traceStatus } from "../shared/traces.ts";
import { generateTrace, openTraceBoxes, traceCheckRunning, type TraceRequest } from "../runtime/traces.ts";
import { loadTraceFacts } from "../tasks/check-trace/task.ts";
import { TRACE_HOPS, type TraceQuestion } from "../shared/types.ts";

const isString = (value: unknown): value is string => typeof value === "string";
const HOPS = new Set<string>(TRACE_HOPS);
const isMode = (value: unknown): value is TraceQuestion["mode"] => value === "claim" || value === "scenario";
const log = (what: string) => (error: unknown) => console.error(`${what} failed: ${(error as Error).message}`);

function parseAsk(rt: Runtime, sessionId: string, body: Record<string, unknown>): Omit<TraceRequest, "traceId"> {
  if (!isMode(body.mode)) throw new HttpError(400, 'mode must be "claim" or "scenario"');
  const question = text(body, "question", "Question").trim();
  const { anchors, contextTraceId } = body;
  if (!Array.isArray(anchors) || !anchors.every((anchor) => typeof anchor === "string" && isSpecRef(anchor))) throw new HttpError(400, "anchors must be SPEC#anchor refs");
  if (contextTraceId !== null && typeof contextTraceId !== "string") throw new HttpError(400, "contextTraceId must be a trace id or null");
  if (typeof contextTraceId === "string" && !rt.store.listArtifacts(sessionId, "SpecTrace").some((a) => (a.data as SpecTraceData).traceId === contextTraceId)) throw new HttpError(404, `Unknown trace: ${contextTraceId}`);
  return { mode: body.mode, question, anchors: anchors as string[], contextTraceId };
}

function requireTrace(rt: Runtime, sessionId: string, traceId: string) {
  const status = traceStatus([...rt.store.listArtifacts(sessionId, "SpecTrace"), ...rt.store.listArtifacts(sessionId, "SpecTraceCheck")], traceId);
  if (!status) throw new HttpError(404, `Unknown trace: ${traceId}`);
  return status;
}

function parseFrom(value: unknown): SpecOpenedData["from"] {
  if (value === null) return null;
  const from = value as { anchor?: unknown; step?: unknown } | undefined;
  if (typeof from !== "object" || !isString(from.anchor) || !from.anchor || !isString(from.step)) throw new HttpError(400, "from must be null or { anchor, step }");
  return { anchor: from.anchor, step: from.step };
}

function parseTrace(value: unknown): SpecTraceData {
  const trace = value as Partial<SpecTraceData> | null | undefined;
  if (typeof trace !== "object" || trace === null || !isString(trace.traceId) || !trace.traceId || !isString(trace.title) || !Array.isArray(trace.entries)
    || !trace.entries.every((entry) => typeof entry === "object" && entry !== null && isString(entry.anchor) && isString(entry.step) && isString(entry.note) && (entry.hop === undefined || HOPS.has(entry.hop as string)) && (entry.code === undefined || Array.isArray(entry.code) && entry.code.every((ref) => typeof ref === "object" && ref !== null && ["gecko", "blink", "webkit"].includes(ref.engine as string) && isString(ref.path) && Number.isInteger(ref.line) && (ref.line as number) >= 1 && isString(ref.quote))))) throw new HttpError(400, "trace must be { traceId, title, entries: { anchor, step, note, hop?, code? }[] }");
  if (trace.question !== undefined) {
    const q = trace.question as { mode?: unknown; text?: unknown } | null;
    if (typeof q !== "object" || q === null || !isMode(q.mode) || !isString(q.text)) throw new HttpError(400, "trace.question must be { mode, text }");
  }
  return { traceId: trace.traceId, title: trace.title, entries: trace.entries.map(({ anchor, step, note, hop, code }) => ({ anchor, step, note, ...(hop ? { hop } : {}), ...(code ? { code } : {}) })), ...(trace.question ? { question: { mode: trace.question.mode, text: trace.question.text } } : {}) };
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
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/ask$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const request = { traceId: randomUUID(), ...parseAsk(rt, session.id, await readJson(req)) };
      void generateTrace(rt, session.id, request).catch(log(`trace ${request.traceId}`));
      send(res, 202, { traceId: request.traceId });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/traces\/([^/]+)\/check$/, async ({ res, params }) => {
      const session = requireSession(rt, params[0]!);
      const { trace } = requireTrace(rt, session.id, params[1]!);
      if (traceCheckRunning(rt, session.id, trace.data.traceId)) throw new HttpError(409, `A check of trace ${trace.data.traceId} is running`);
      void rt.run(session.id, "checkTrace", { traceId: trace.data.traceId, traceArtifactId: trace.id }).catch(log(`check of trace ${trace.data.traceId}`));
      send(res, 202, { traceArtifactId: trace.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/traces\/([^/]+)\/open$/, async ({ res, params }) => {
      const session = requireSession(rt, params[0]!);
      const { trace } = requireTrace(rt, session.id, params[1]!);
      let facts;
      try { facts = await loadTraceFacts({ run: (kind, input) => rt.run(session.id, kind, input), artifacts: { get: (id) => rt.store.getArtifact(id) } }, trace.data.entries); }
      catch (error) { throw new HttpError(lookupStatus(error), (error as Error).message); }
      send(res, 201, { opened: await openTraceBoxes(rt, session.id, trace.data, facts.algorithms) });
    }],
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
      const { anchors, question } = request.data as SpecExploreRequestData;
      try { for (const anchor of anchors) await openSpec(rt, session.id, anchor, null); }
      catch (error) { throw new HttpError(lookupStatus(error), (error as Error).message); }
      const traceId = question ? randomUUID() : null;
      if (question && traceId) void generateTrace(rt, session.id, { traceId, mode: question.mode, question: question.text, anchors, contextTraceId: null }).catch(log(`trace ${traceId}`));
      send(res, 201, { opened: anchors.length, traceId });
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
    ["GET", /^\/api\/sessions\/([^/]+)\/spec\/implementations$/, async ({ params, url }) => {
      const session = requireSession(rt, params[0]!);
      const ref = url.searchParams.get("ref");
      if (!ref) throw new HttpError(400, "Missing query parameter: ref");
      return implementationsData(rt, requireAlgorithm(rt, session.id, ref));
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/mappings\/ensure$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const algorithm = requireAlgorithm(rt, session.id, text(await readJson(req), "ref"));
      for (const engine of ENGINES) void ensureMapping(rt, session.id, engine, algorithm).catch((error) => console.error(`${engine} mapping of ${algorithm.data.ref} failed: ${(error as Error).message}`));
      send(res, 202, {});
    }],
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
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/mappings\/align$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const algorithm = requireAlgorithm(rt, session.id, text(body, "ref"));
      const engine = parseEngine(body.engine);
      const key = text(body, "key");
      if (!usedSites(storedMapping(rt.knowledge, engine, algorithm.data.ref)).some((site) => siteKey(site) === key)) throw new HttpError(404, `No site ${key} in ${algorithm.data.ref}`);
      if (alignRunning(rt, engine, algorithm.data.ref)) throw new HttpError(409, `A ${engine} alignment for ${algorithm.data.ref} is running`);
      send(res, 202, { taskId: startAlign(rt, session.id, engine, algorithm, key).taskId });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/mappings\/compare$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const algorithm = requireAlgorithm(rt, session.id, text(await readJson(req), "ref"));
      if (ENGINES.filter((engine) => usedSites(storedMapping(rt.knowledge, engine, algorithm.data.ref)).length).length < 2) throw new HttpError(409, "Compare needs sites in at least two engines");
      if (compareRunning(rt, algorithm.data.ref)) throw new HttpError(409, `A comparison of ${algorithm.data.ref} is running`);
      let run;
      try { run = await startCompare(rt, session.id, algorithm); } catch (error) { throw new HttpError(502, (error as Error).message); }
      send(res, 202, { taskId: run.taskId });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/mappings\/compare\/flag$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req), ref = requireAlgorithm(rt, session.id, text(body, "ref")).data.ref;
      try { flagDifference(rt, session.id, ref, text(body, "entryId"), body.index as number); }
      catch (error) { throw new HttpError(error instanceof RangeError ? 400 : 409, (error as Error).message); }
      rt.emit(session.id, "user", "spec.compare", { ref });
      send(res, 201, {});
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
