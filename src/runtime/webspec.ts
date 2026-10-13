import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedSpec, SpecEffect, SpecEffectsStatus, SpecSite, SpecSearchResult } from "../shared/types.ts";
import { runChecked, runProcess } from "./process.ts";
import type { StepCommentCheck, WebspecCapability, WebspecLookup } from "./tasks.ts";

interface AnalyzeOutput { scopes: { url: string; validations: { line: number; step: number[]; comment_text: string; result: StepCommentCheck["result"] }[] }[] }
interface QueryOutput { spec: string; anchor: string; title: string; type: string; url: string; content: string; outgoing_refs?: { total: number }; effects?: SpecEffect[]; effects_status?: SpecEffectsStatus; sha?: string }
type RawSite = SpecSite & Record<string, unknown>;
interface EffectsOutput { effects: SpecEffect[]; explanations: { effect_id: string; witnesses: { hops: { from: RawSite; to: RawSite; site: { subject: RawSite } }[] }[] }[] }
const site = (s: RawSite): SpecSite => ({ spec: s.spec, anchor: s.anchor, ...(s.step_path ? { step_path: s.step_path } : {}) });

function lookupArgs(request: WebspecLookup): string[] {
  switch (request.command) {
    case "query": return ["query", ...(request.steps ? ["--steps", request.steps] : []), "--format", "markdown", "--", request.ref];
    case "refs": return ["refs", "-d", request.direction, "-l", String(request.limit), "--", request.ref];
    case "effects": return ["effects", ...(request.step ? ["--step", request.step] : []), "--compact", "--", request.ref];
    case "flow": return ["flow", "--flow-format", "mermaid", "--", request.ref];
    case "state": return ["state", "--format", "markdown", "--", request.selector];
  }
}

export function makeWebspec(opts: { bin?: string } = {}): WebspecCapability {
  const bin = opts.bin ?? "webspec-index";
  const runQuery = async (ref: string, signal: AbortSignal): Promise<{ found: true; out: QueryOutput } | { found: false; reason: string }> => {
    const { stdout, stderr, code } = await runProcess(bin, ["query", "--format", "json", "--", ref], { stdin: "", signal });
    if (code === 1 && stderr.startsWith("Error:")) return { found: false, reason: stderr.replace(/^Error:\s*/, "").trim() };
    if (code !== 0) throw new Error(`webspec-index exited with code ${code}: ${stderr.trim().slice(-1000)}`);
    return { found: true, out: JSON.parse(stdout) as QueryOutput };
  };
  return {
    effect: "read-only",
    async lookup(request, signal) { return (await runChecked(bin, lookupArgs(request), { stdin: "", signal, label: `webspec-index ${request.command}` })).stdout; },
    async resolve(url, signal) {
      const r = await runQuery(url, signal);
      if (!r.found) return r;
      const out = r.out;
      const spec: ResolvedSpec = { spec: out.spec, anchor: out.anchor, title: out.title, type: out.type, url: out.url, content: out.content };
      return { found: true, spec };
    },
    async query(ref, signal) {
      const r = await runQuery(ref, signal);
      if (!r.found) return r;
      const { spec, anchor, title, type, url, content, outgoing_refs, effects, effects_status, sha } = r.out;
      if (typeof sha !== "string" || !Array.isArray(effects) || !effects_status || !outgoing_refs) throw new Error(`webspec-index query output for ${ref} lacks sha, effects or outgoing_refs`);
      return { found: true, section: { spec, anchor, title, type, url, content, outgoingRefs: outgoing_refs.total, effects, effectsStatus: effects_status, sha } };
    },
    async search(phrase, signal) {
      const { stdout } = await runChecked(bin, ["search", "--format", "json", "--", phrase], { stdin: "", signal, label: "webspec-index search" });
      return (JSON.parse(stdout) as { results: SpecSearchResult[] }).results.map(({ spec, anchor, title, type, snippet }) => ({ spec, anchor, title, type, snippet }));
    },
    async refs(ref, signal) {
      const { stdout } = await runChecked(bin, ["refs", "--kind", "step", "--", ref], { stdin: "", signal, label: "webspec-index refs" });
      const match = (JSON.parse(stdout) as { matches: { incoming?: { spec: string; anchor: string }[]; outgoing?: { spec: string; anchor: string }[] }[] }).matches[0];
      const refsOf = (sites: { spec: string; anchor: string }[] = []) => [...new Set(sites.map((site) => `${site.spec}#${site.anchor}`))];
      return { incoming: refsOf(match?.incoming), outgoing: refsOf(match?.outgoing) };
    },
    async idl(query, signal) {
      const { stdout } = await runChecked(bin, ["idl", "--format", "json", "--", query], { stdin: "", signal, label: "webspec-index idl" });
      return (JSON.parse(stdout) as { matches: { spec: string; anchor: string; kind: string; name: string; owner: string; canonical_name: string }[] }).matches.map(({ spec, anchor, kind, name, owner, canonical_name }) => ({ spec, anchor, kind, name, owner, canonicalName: canonical_name }));
    },
    async effectPaths(ref, effectId, signal) {
      const { stdout } = await runChecked(bin, ["effects", ...(effectId ? ["--effect-id", effectId] : []), "--", ref], { stdin: "", signal, label: "webspec-index effects" });
      const out = JSON.parse(stdout) as EffectsOutput;
      return { effects: out.effects, explanations: out.explanations.map((e) => ({ effectId: e.effect_id, witnesses: e.witnesses.map((w) => w.hops.map((hop) => ({ from: site(hop.from), to: site(hop.to), site: site(hop.site.subject) }))) })) };
    },
    async analyze(name, text, signal) {
      // `analyze` reads files only; the base name keeps the extension it may look at.
      const dir = await mkdtemp(join(tmpdir(), "spatial-analyze-"));
      try {
        const file = join(dir, name);
        await writeFile(file, text);
        const { stdout } = await runChecked(bin, ["analyze", file, "--output-format", "json"], { stdin: "", signal, label: "webspec-index analyze" });
        if (!stdout.trim()) return [];
        const out = JSON.parse(stdout) as AnalyzeOutput;
        return out.scopes.flatMap((scope) => scope.validations.map((v) => ({ line: v.line + 1, step: v.step.join("."), text: v.comment_text, result: v.result, url: scope.url })));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
