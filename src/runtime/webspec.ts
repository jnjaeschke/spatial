import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedSpec } from "../shared/types.ts";
import { runProcess } from "./process.ts";
import type { StepCommentCheck, WebspecCapability } from "./tasks.ts";

interface AnalyzeOutput { scopes: { url: string; validations: { line: number; step: number[]; comment_text: string; result: StepCommentCheck["result"] }[] }[] }

export function makeWebspec(opts: { bin?: string } = {}): WebspecCapability {
  const bin = opts.bin ?? "webspec-index";
  return {
    effect: "read-only",
    async resolve(url, signal) {
      const { stdout, stderr, code } = await runProcess(bin, ["query", url, "--format", "json"], { stdin: "", signal });
      if (code === 1 && stderr.startsWith("Error:")) return { found: false, reason: stderr.replace(/^Error:\s*/, "").trim() };
      if (code !== 0) throw new Error(`webspec-index exited with code ${code}: ${stderr.trim().slice(-1000)}`);
      const r = JSON.parse(stdout);
      const spec: ResolvedSpec = { spec: r.spec, anchor: r.anchor, title: r.title, type: r.type, url: r.url, content: r.content };
      return { found: true, spec };
    },
    async analyze(name, text, signal) {
      // `analyze` reads files only; the base name keeps the extension it may look at.
      const dir = await mkdtemp(join(tmpdir(), "spatial-analyze-"));
      try {
        const file = join(dir, name);
        await writeFile(file, text);
        const { stdout, stderr, code } = await runProcess(bin, ["analyze", file, "--output-format", "json"], { stdin: "", signal });
        if (code !== 0) throw new Error(`webspec-index analyze exited with code ${code}: ${stderr.trim().slice(-1000)}`);
        if (!stdout.trim()) return [];
        const out = JSON.parse(stdout) as AnalyzeOutput;
        return out.scopes.flatMap((scope) => scope.validations.map((v) => ({ line: v.line + 1, step: v.step.join("."), text: v.comment_text, result: v.result, url: scope.url })));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
