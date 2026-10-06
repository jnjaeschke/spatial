import type { ConduitClient } from "./conduit.ts";

export type Conduit = Pick<ConduitClient, "call">;

export interface RemoteRevision {
  id: number;
  phid: string;
  title: string;
  closed: boolean;
  stackGraph: Record<string, string[]>;
}

export interface RemoteDiff {
  id: number;
  base: string;
  dateCreated: number;
}

export interface StackEntry {
  revision: RemoteRevision;
  diff: RemoteDiff;
}

/** A stack that cannot be reviewed as a linear chain. */
export class StackShapeError extends Error {}

/** Conduit methods permitted for remote review. */
export const READ_ONLY_METHODS: ReadonlySet<string> = new Set([
  "differential.revision.search",
  "differential.diff.search",
  "differential.getrawdiff",
]);

function object(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Malformed Conduit response: ${what}`);
  }
  return value as Record<string, unknown>;
}

function malformed(what: string): never {
  throw new Error(`Malformed Conduit response: ${what}`);
}

export function readOnly(conduit: Conduit): Conduit {
  return {
    call: async (method, params) => {
      if (!READ_ONLY_METHODS.has(method)) throw new Error(`Refusing Conduit method ${method}: remote review is read-only`);
      return conduit.call(method, params);
    },
  };
}

export function parseRevisions(result: unknown): RemoteRevision[] {
  const root = object(result, "revision search result");
  if (!Array.isArray(root.data)) malformed("revision search data");
  return root.data.map((raw, index) => {
    const item = object(raw, `revision ${index}`);
    const fields = object(item.fields, `revision ${index} fields`);
    const status = object(fields.status, `revision ${index} status`);
    if (!Number.isSafeInteger(item.id) || typeof item.phid !== "string" || typeof fields.title !== "string" || typeof status.closed !== "boolean") {
      malformed(`revision ${index} fields`);
    }
    const stackGraph: Record<string, string[]> = {};
    if (fields.stackGraph !== undefined) {
      const graph = object(fields.stackGraph, `revision ${index} stackGraph`);
      for (const [phid, parents] of Object.entries(graph)) {
        if (!Array.isArray(parents) || parents.some((parent) => typeof parent !== "string")) malformed(`revision ${index} stackGraph`);
        stackGraph[phid] = parents as string[];
      }
    }
    return { id: item.id as number, phid: item.phid, title: fields.title, closed: status.closed, stackGraph };
  });
}

export function parseNewestDiff(result: unknown, id: number): RemoteDiff {
  const root = object(result, `diff search for D${id}`);
  if (!Array.isArray(root.data)) malformed(`diff search data for D${id}`);
  if (root.data.length === 0) throw new Error(`No diffs found on D${id}`);
  const item = object(root.data[0], `newest diff on D${id}`);
  const fields = object(item.fields, `newest diff fields on D${id}`);
  if (!Number.isSafeInteger(item.id)) malformed(`newest diff id on D${id}`);
  if (typeof fields.dateCreated !== "number" || !Number.isFinite(fields.dateCreated)) malformed(`dateCreated on D${id}`);
  if (!Array.isArray(fields.refs)) malformed(`refs on D${id}`);
  const baseRef = fields.refs.map((ref) => object(ref, `diff ref on D${id}`)).find((ref) => ref.type === "base");
  const base = baseRef?.identifier;
  if (typeof base !== "string" || !/^[a-f0-9]{7,64}$/.test(base)) throw new Error(`Diff on D${id} records no base commit`);
  return { id: item.id as number, base, dateCreated: fields.dateCreated };
}

/** Returns the open stack ancestors in root-first order. */
export function stackOrder(head: RemoteRevision, byPhid: ReadonlyMap<string, RemoteRevision>): RemoteRevision[] {
  const order: RemoteRevision[] = [];
  const seen = new Set<string>();
  for (let current = head; ;) {
    if (seen.has(current.phid)) throw new StackShapeError(`Stack of D${head.id} has a cycle at D${current.id}`);
    seen.add(current.phid);
    order.unshift(current);
    const parents = (head.stackGraph[current.phid] ?? []).map((phid) => {
      const parent = byPhid.get(phid);
      if (!parent) throw new Error(`Parent ${phid} of D${current.id} was not returned by Conduit`);
      return parent;
    }).filter((parent) => !parent.closed);
    if (parents.length === 0) return order;
    if (parents.length > 1) throw new StackShapeError(`D${current.id} has several open parent revisions (${parents.map((parent) => `D${parent.id}`).join(", ")}); only linear stacks can be reviewed`);
    current = parents[0]!;
  }
}

export async function fetchStack(conduit: Conduit, id: number): Promise<StackEntry[]> {
  const first = parseRevisions(await conduit.call("differential.revision.search", { constraints: { ids: [id] } }));
  const head = first.find((revision) => revision.id === id);
  if (!head) throw new Error(`D${id} not found`);
  const otherPhids = Object.keys(head.stackGraph).filter((phid) => phid !== head.phid);
  const others = otherPhids.length
    ? parseRevisions(await conduit.call("differential.revision.search", { constraints: { phids: otherPhids }, limit: 100 }))
    : [];
  const byPhid = new Map([head, ...others].map((revision) => [revision.phid, revision]));
  const ordered = stackOrder(head, byPhid);
  const entries: StackEntry[] = [];
  for (const revision of ordered) {
    const result = await conduit.call("differential.diff.search", {
      constraints: { revisionPHIDs: [revision.phid] }, order: "newest", limit: 1,
    });
    entries.push({ revision, diff: parseNewestDiff(result, revision.id) });
  }
  return entries;
}
