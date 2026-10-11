import { HttpError, putUserArtifact, readJson, requireSession, send, text, type Route, type Runtime } from "../../../plugin-api.ts";
import type { SpecOpenedData, SpecTraceData } from "../shared/types.ts";
import { openSpec } from "../runtime/open.ts";
import { isSpecQuery } from "../shared/refs.ts";
import { SpecNotFoundError } from "../tasks/load-spec-algorithm/task.ts";

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

/** HTTP routes of the spec explorer: user actions stored as user artifacts. */
export function specRoutes(rt: Runtime): Route[] {
  return [
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/open$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const anchor = text(body, "anchor");
      if (!isSpecQuery(anchor)) throw new HttpError(400, "anchor must be SPEC#anchor or a spec URL with a fragment");
      const from = parseFrom(body.from);
      if (from && !rt.store.listArtifacts(session.id, "SpecOpened").some((a) => (a.data as SpecOpenedData).anchor === from.anchor)) throw new HttpError(409, `${from.anchor} is not open`);
      let result;
      try { result = await openSpec(rt, session.id, anchor, from); }
      catch (error) { throw new HttpError((error as Error).cause instanceof SpecNotFoundError ? 404 : 502, (error as Error).message); }
      send(res, 201, { openedId: result.opened.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/spec\/traces$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const trace = parseTrace((await readJson(req)).trace);
      const start = rt.store.listArtifacts(session.id, "WorkflowStart").at(-1);
      if (!start) throw new HttpError(409, "Session has no start request");
      send(res, 201, { artifactId: putUserArtifact(rt, session.id, "SpecTrace", trace, start.id).id });
    }],
  ];
}
