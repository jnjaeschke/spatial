import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedSpec, SpecEffect, SpecEffectsStatus, SpecSite, SpecSearchResult } from "../shared/types.ts";
import { runChecked, runProcess } from "./process.ts";
import type { StepCommentCheck, WebspecCapability } from "./tasks.ts";

interface AnalyzeOutput { scopes: { url: string; validations: { line: number; step: number[]; comment_text: string; result: StepCommentCheck["result"] }[] }[] }
interface QueryOutput { spec: string; anchor: string; title: string; type: string; url: string; content: string; outgoing_refs?: { total: number }; effects?: SpecEffect[]; effects_status?: SpecEffectsStatus; sha?: string }
type RawSite = SpecSite & Record<string, unknown>;
interface EffectsOutput { effects: SpecEffect[]; explanations: { effect_id: string; witnesses: { hops: { from: RawSite; to: RawSite; site: { subject: RawSite } }[] }[] }[] }
const site = (s: RawSite): SpecSite => ({ spec: s.spec, anchor: s.anchor, ...(s.step_path ? { step_path: s.step_path } : {}) });

export function makeWebspec(opts: { bin?: string } = {}): WebspecCapability {
  const bin = opts.bin ?? "webspec-index";
  const runQuery = async (ref: string, signal: AbortSignal): Promise<{ found: true; out: QueryOutput } | { found: false; reason: string }> => {
    const { stdout, stderr, code } = await runProcess(bin, ["query", ref, "--format", "json"], { stdin: "", signal });
    if (code === 1 && stderr.startsWith("Error:")) return { found: false, reason: stderr.replace(/^Error:\s*/, "").trim() };
    if (code !== 0) throw new Error(`webspec-index exited with code ${code}: ${stderr.trim().slice(-1000)}`);
    return { found: true, out: JSON.parse(stdout) as QueryOutput };
  };
  return {
    effect: "read-only",
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
      const { stdout } = await runChecked(bin, ["search", phrase, "--format", "json"], { stdin: "", signal, label: "webspec-index search" });
      return (JSON.parse(stdout) as { results: SpecSearchResult[] }).results.map(({ spec, anchor, title, type, snippet }) => ({ spec, anchor, title, type, snippet }));
    },
    async effectPaths(ref, effectId, signal) {
      const { stdout } = await runChecked(bin, ["effects", ref, ...(effectId ? ["--effect-id", effectId] : [])], { stdin: "", signal, label: "webspec-index effects" });
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
