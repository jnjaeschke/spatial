import type { DiffData, SemanticChange } from "../../shared/types.ts";

/** Deterministic checks the LLM cannot be trusted with. Returns human-readable errors; empty = valid. */
export function validateNarrative(json: unknown, diff: DiffData): string[] {
  const n = json as { summary?: unknown; changes?: unknown };
  if (typeof n !== "object" || n === null || typeof n.summary !== "string" || !Array.isArray(n.changes)) {
    return ["Narrative must be an object with string summary and array changes"];
  }
  const changes = n.changes as SemanticChange[];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const c of changes) {
    if (ids.has(c.id)) errors.push(`Duplicate change id ${c.id}`);
    ids.add(c.id);
    if (c.hunkIds.length === 0) errors.push(`Change ${c.id} has no hunks`);
  }

  const known = new Set(diff.files.flatMap((f) => f.hunks.map((h) => h.id)));
  const owners = new Map<string, string[]>();
  for (const c of changes) {
    for (const h of c.hunkIds) {
      if (!known.has(h)) errors.push(`Unknown hunk id ${h} in change ${c.id}`);
      else owners.set(h, [...(owners.get(h) ?? []), c.id]);
    }
  }
  for (const h of known) {
    const o = owners.get(h);
    if (!o) errors.push(`Hunk ${h} not assigned to any change`);
    else if (o.length > 1) errors.push(`Hunk ${h} assigned to multiple changes: ${o.join(", ")}`);
  }

  for (const c of changes) {
    for (const d of c.dependsOn) if (!ids.has(d)) errors.push(`Change ${c.id} depends on unknown change ${d}`);
  }
  errors.push(...findCycles(changes, ids));
  return errors;
}

// Tarjan SCC; every SCC with more than one node, or a self-loop, is a cycle.
function findCycles(changes: SemanticChange[], ids: Set<string>): string[] {
  const edges = new Map(changes.map((c) => [c.id, c.dependsOn.filter((d) => ids.has(d))]));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[] = [];
  let i = 0;
  const visit = (v: string) => {
    index.set(v, i);
    low.set(v, i++);
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || (edges.get(v) ?? []).includes(v)) out.push(`Dependency cycle involving: ${scc.sort().join(", ")}`);
    }
  };
  for (const id of edges.keys()) if (!index.has(id)) visit(id);
  return out;
}
