import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { LlmBackendId, PatchNarrativeData } from "./shared/types.ts";
import { createRuntime, defaultDbPath, DEFAULT_LLM } from "./runtime/create.ts";
import { createSession } from "./runtime/git.ts";
import { narratePatch } from "./workflows/narrate-patch.ts";

const USAGE = `usage:
  node src/cli.ts narrate <repo> <base>..<head> [--backend claude|codex] [--model M] [--effort E] [--db PATH]
  node src/cli.ts models [--db PATH]`;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    backend: { type: "string" },
    model: { type: "string" },
    effort: { type: "string" },
    db: { type: "string" },
  },
});

const dbPath = values.db ?? defaultDbPath();
mkdirSync(dirname(dbPath), { recursive: true });
const rt = createRuntime({ dbPath, claudeBin: process.env.SPATIAL_CLAUDE_BIN, codexBin: process.env.SPATIAL_CODEX_BIN });

const [cmd, ...rest] = positionals;
try {
  if (cmd === "models") {
    console.log(JSON.stringify(await rt.llm.listModels(), null, 2));
  } else if (cmd === "narrate") {
    const [repo, range] = rest;
    if (!repo || !range) fail(USAGE);
    const m = /^(.+?)\.\.(.+)$/.exec(range);
    if (!m) fail(`Range must be <base>..<head>, got "${range}"\n${USAGE}`);
    const backend = (values.backend ?? DEFAULT_LLM.backend) as LlmBackendId;
    if (backend !== "claude" && backend !== "codex") fail(`Unknown backend: ${backend}`);
    const llm = values.backend || values.model || values.effort
      ? { backend, model: values.model ?? (backend === DEFAULT_LLM.backend ? DEFAULT_LLM.model : fail("--model is required with --backend codex")), effort: values.effort ?? DEFAULT_LLM.effort }
      : undefined;

    const session = await createSession(rt.store, repo, range);
    rt.onEvent((e) => {
      if (e.type === "task.started" || e.type === "task.progress" || e.type === "task.failed") {
        console.error(`[${e.type}] ${JSON.stringify(e.payload)}`);
      }
    });
    let current: string | undefined;
    rt.onEvent((e) => {
      if (e.type === "task.started") current = (e.payload as { taskId: string }).taskId;
    });
    process.on("SIGINT", () => {
      try {
        if (current) rt.cancel(current);
        else process.exit(130);
      } catch {
        process.exit(130); // task already finished between events
      }
    });

    const { diffId, narrativeId } = await narratePatch(rt, session.id, { base: m[1], head: m[2], llm });
    const narrative = rt.store.getArtifact<PatchNarrativeData>(narrativeId).data;
    console.log(JSON.stringify({ sessionId: session.id, diffId, narrativeId, narrative }, null, 2));
  } else {
    fail(USAGE);
  }
} catch (e) {
  fail((e as Error).message);
}
