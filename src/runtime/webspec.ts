import type { ResolvedSpec } from "../shared/types.ts";
import { runProcess } from "./process.ts";
import type { WebspecCapability } from "./tasks.ts";

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
  };
}
