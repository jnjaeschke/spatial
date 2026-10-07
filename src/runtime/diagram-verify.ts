import type { DiagramData, DiagramEdge, DiagramNode, DiffData } from "../shared/types.ts";

export type DiagramProposal = { commit: number; mode: "map" | "flow"; title: string; nodes: Omit<DiagramNode, "verified">[]; edges: Omit<DiagramEdge, "verified">[] };

/** Checks every citation of a proposed diagram against the commit's tree (parent's for removed nodes). */
export async function verifyDiagram(
  proposal: DiagramProposal,
  diff: Pick<DiffData, "baseSha" | "commits">,
  show: (sha: string, path: string) => Promise<string>,
): Promise<{ ok: true; data: DiagramData } | { ok: false; error: string }> {
  if (!Number.isInteger(proposal.commit) || proposal.commit < 1 || proposal.commit > diff.commits.length) return { ok: false, error: `commit must be between 1 and ${diff.commits.length}` };
  if (proposal.nodes.length > 40 || proposal.edges.length > 80) return { ok: false, error: "diagram exceeds the limit of 40 nodes or 80 edges" };
  const ids = new Set<string>();
  for (const node of proposal.nodes) {
    if (ids.has(node.id)) return { ok: false, error: `duplicate node id: ${node.id}` };
    ids.add(node.id);
  }
  for (const edge of proposal.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return { ok: false, error: `edge references unknown node: ${!ids.has(edge.from) ? edge.from : edge.to}` };
  }

  const commitIndex = proposal.commit - 1;
  const commit = diff.commits[commitIndex]!;
  const parentSha = commitIndex === 0 ? diff.baseSha : diff.commits[commitIndex - 1]!.sha;
  const cache = new Map<string, Promise<string | null>>();
  const lineAt = (sha: string, path: string, line: number): Promise<string | null> => {
    if (!Number.isInteger(line) || line < 1) return Promise.resolve(null);
    const key = `${sha}\0${path}`;
    let contents = cache.get(key);
    if (!contents) {
      contents = Promise.resolve().then(() => show(sha, path)).catch(() => null);
      cache.set(key, contents);
    }
    return contents.then((text) => text?.split(/\r?\n/)[line - 1] ?? null);
  };
  const containsIdentifier = (text: string | null, identifier: string): boolean => {
    if (text === null || identifier.length === 0) return false;
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before = /\w/.test(identifier[0]!) ? "(?<!\\w)" : "";
    const last = identifier[identifier.length - 1]!;
    const after = /\w/.test(last) ? "(?!\\w)" : "";
    return new RegExp(`${before}${escaped}${after}`).test(text);
  };
  const nodes: DiagramNode[] = await Promise.all(proposal.nodes.map(async (node) => {
    const sha = node.status === "removed" ? parentSha : commit.sha;
    return { ...node, verified: containsIdentifier(await lineAt(sha, node.cite.path, node.cite.line), node.identifier) };
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: DiagramEdge[] = await Promise.all(proposal.edges.map(async (edge) => {
    const target = byId.get(edge.to)!;
    return { ...edge, verified: containsIdentifier(await lineAt(commit.sha, edge.cite.path, edge.cite.line), target.identifier) };
  }));
  return { ok: true, data: { commit: commit.sha, commitIndex, mode: proposal.mode, title: proposal.title, nodes, edges } };
}
