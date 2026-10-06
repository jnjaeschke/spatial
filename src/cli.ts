#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { LlmBackendId, PatchNarrativeData } from "./shared/types.ts";
import { createRuntime, defaultDbPath, DEFAULT_LLM } from "./runtime/create.ts";
import { createSession, resolveRepo } from "./runtime/git.ts";
import { narratePatch } from "./workflows/narrate-patch.ts";
import { parsePhabRevisionUrl } from "./shared/phabricator.ts";
import { importRevision } from "./runtime/import-revision.ts";
import { DEFAULT_PORT, ensureServer, openBrowser, spawnServer, startScreenUrl } from "./cli/launch.ts";

const USAGE = `usage:
  spatial [open [path]] [--port N] [--db PATH]   open the start screen of the repo at path (default: .), starting the server if needed
  spatial narrate <repo> <base>..<head> [--backend claude|codex] [--model M] [--effort E] [--db PATH]
  spatial phab <repo> <revision-url> [--backend claude|codex] [--model M] [--effort E] [--db PATH]
  spatial models [--db PATH]`;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function parseCli() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        backend: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        db: { type: "string" },
        port: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    fail(`${(e as Error).message}\n${USAGE}`);
  }
}

const { positionals, values } = parseCli();
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

function runtime() {
  const dbPath = values.db ?? defaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  return createRuntime({ dbPath, claudeBin: process.env.SPATIAL_CLAUDE_BIN, codexBin: process.env.SPATIAL_CODEX_BIN });
}

const [cmd, ...rest] = positionals;
try {
  if (cmd === undefined || cmd === "open") {
    const port = Number(values.port ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port <= 0) fail(`Invalid --port: ${values.port}`);
    const { worktree } = await resolveRepo(resolve(rest[0] ?? "."));
    const root = fileURLToPath(new URL("..", import.meta.url));
    const health = await ensureServer({ port, startServer: () => spawnServer(root, port, values.db) });
    if (!health.ui) fail(`The server on port ${port} serves no UI (started with \`npm run server\`?). Open the Vite dev server with ?path=${encodeURIComponent(worktree)}`);
    const url = startScreenUrl(port, worktree);
    console.log(url);
    openBrowser(url);
  } else if (cmd === "models") {
    const rt = runtime();
    console.log(JSON.stringify(await rt.llm.listModels(), null, 2));
  } else if (cmd === "narrate" || cmd === "phab") {
    const rt = runtime();
    const [repo, target] = rest;
    if (!repo || !target) fail(USAGE);
    const revision = cmd === "phab" ? parsePhabRevisionUrl(target) : null;
    if (cmd === "phab" && !revision) fail(`Revision must be a URL like https://phab.example.com/D123, got "${target}"\n${USAGE}`);
    const match = cmd === "narrate" ? /^(.+?)\.\.(.+)$/.exec(target) : null;
    if (cmd === "narrate" && !match) fail(`Range must be <base>..<head>, got "${target}"\n${USAGE}`);
    const backend = (values.backend ?? DEFAULT_LLM.backend) as LlmBackendId;
    if (backend !== "claude" && backend !== "codex") fail(`Unknown backend: ${backend}`);
    const llm = values.backend || values.model || values.effort
      ? { backend, model: values.model ?? (backend === DEFAULT_LLM.backend ? DEFAULT_LLM.model : fail("--model is required with --backend codex")), effort: values.effort ?? DEFAULT_LLM.effort }
      : undefined;

    const session = await createSession(rt.store, repo, target, "review");
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

    const range = cmd === "phab"
      ? await importRevision(rt, session.id, revision!)
      : { base: match![1]!, head: match![2]! };
    const { diffId, narrativeId } = await narratePatch(rt, session.id, { ...range, llm });
    const narrative = rt.store.getArtifact<PatchNarrativeData>(narrativeId).data;
    console.log(JSON.stringify({ sessionId: session.id, diffId, narrativeId, narrative }, null, 2));
  } else {
    fail(USAGE);
  }
} catch (e) {
  fail((e as Error).message);
}
