#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { LlmBackendId, PatchNarrativeData, WorkflowStartData } from "./shared/types.ts";
import { createRuntime, defaultDbPath, DEFAULT_LLM } from "./runtime/create.ts";
import { createSession, resolveRepo } from "./runtime/git.ts";
import { parseCommand } from "./workflows/registry.ts";
import { runWorkflow } from "./workflows/start.ts";
import { latestDiff, narrativeOf } from "./shared/diffs.ts";
import { DEFAULT_PORT, ensureServer, openBrowser, spawnServer, startScreenUrl, staleServerMessage, stopServer } from "./cli/launch.ts";

const USAGE = `usage:
  spatial [open [path]] [--port N] [--db PATH]   open the start screen of the repo at path (default: .), starting the server if needed
  spatial stop [--port N] [--force]              stop the server on the port
  spatial restart [--port N] [--db PATH] [--force] restart the server without opening a browser
  spatial review <repo> [<base>..<head> | D123 | <revision-url>] [--backend claude|codex] [--model M] [--effort E] [--db PATH]
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
        force: { type: "boolean" },
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
  if (cmd === "stop" || cmd === "restart") {
    const port = Number(values.port ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port <= 0) fail(`Invalid --port: ${values.port}`);
    const stopped = await stopServer({ port, force: values.force });
    if (cmd === "stop") console.log(stopped === "free" ? `No server running on port ${port}.` : `Stopped server on port ${port}.`);
    else {
      const root = fileURLToPath(new URL("..", import.meta.url));
      const health = await ensureServer({ port, startServer: () => spawnServer(root, port, values.db) });
      if (!health.ui) fail(`The server on port ${port} serves no UI (started with \`npm run server\`?). Build it with \`npm run build:web\`.`);
      console.log(`Restarted server on port ${port}.`);
    }
  } else if (cmd === undefined || cmd === "open") {
    const port = Number(values.port ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port <= 0) fail(`Invalid --port: ${values.port}`);
    const { worktree } = await resolveRepo(resolve(rest[0] ?? "."));
    const root = fileURLToPath(new URL("..", import.meta.url));
    const health = await ensureServer({ port, startServer: () => spawnServer(root, port, values.db) });
    let head: string | null;
    try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
    catch { head = null; }
    const warning = staleServerMessage(health.commit, head);
    if (warning) console.error(warning);
    if (!health.ui) fail(`The server on port ${port} serves no UI (started with \`npm run server\`?). Open the Vite dev server with ?path=${encodeURIComponent(worktree)}`);
    const url = startScreenUrl(port, worktree);
    console.log(url);
    openBrowser(url);
  } else if (cmd === "models") {
    const rt = runtime();
    console.log(JSON.stringify(await rt.llm.listModels(), null, 2));
  } else if (cmd === "review") {
    const rt = runtime();
    const [repo, target = ""] = rest;
    if (!repo) fail(USAGE);
    const command = parseCommand(rt.workflows.values(), "/review " + target);
    const parsed = command.ok ? { ok: true as const, params: command.params } : command;
    if (!parsed.ok) fail(`Expected <base>..<head>, a revision (D123 or its URL) or nothing, got "${target}"\n${USAGE}`);
    const backend = (values.backend ?? DEFAULT_LLM.backend) as LlmBackendId;
    if (backend !== "claude" && backend !== "codex") fail(`Unknown backend: ${backend}`);
    const llm = values.backend || values.model || values.effort
      ? { backend, model: values.model ?? (backend === DEFAULT_LLM.backend ? DEFAULT_LLM.model : fail("--model is required with --backend codex")), effort: values.effort ?? DEFAULT_LLM.effort }
      : undefined;

    const title = `/review ${target}`.trim();
    const session = await createSession(rt.store, repo, title, null);
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

    const start = rt.store.putArtifact<WorkflowStartData>({
      sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" },
      data: { via: "command", workflow: "review", params: parsed.params, title, prompt: target },
    });
    await runWorkflow(rt, session.id, start.id, llm);
    const diff = latestDiff(rt.store.listArtifacts(session.id));
    if (!diff) throw new Error("Review completed without an imported diff");
    const narrativeArtifact = narrativeOf(rt.store.listArtifacts(session.id), diff.id);
    if (!narrativeArtifact) throw new Error("Review completed without analysis");
    const diffId = diff.id;
    const narrativeId = narrativeArtifact.id;
    const narrative = rt.store.getArtifact<PatchNarrativeData>(narrativeId).data;
    console.log(JSON.stringify({ sessionId: session.id, diffId, narrativeId, narrative }, null, 2));
  } else {
    fail(USAGE);
  }
} catch (e) {
  fail((e as Error).message);
}
