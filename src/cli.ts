#!/usr/bin/env node
import { mkdirSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { LlmBackendId } from "./shared/types.ts";
import { createRuntime, defaultDbPath, DEFAULT_LLM } from "./runtime/create.ts";
import { resolveRepo } from "./runtime/git/read.ts";
import { parseCommand } from "./workflows/registry.ts";
import { begin } from "./workflows/start.ts";
import { sessionOverview, sessionView } from "./runtime/render-ref.ts";
import { DEFAULT_PORT, ensureServer, openBrowser, spawnServer, startScreenUrl, staleServerMessage, stopServer } from "./cli/launch.ts";

const USAGE = `usage:
  spatial [open [path]] [--port N] [--db PATH]   open the start screen of the repo at path (default: .), starting the server if needed
  spatial stop [--port N] [--force]              stop the server on the port
  spatial restart [--port N] [--db PATH] [--force] restart the server without opening a browser
  spatial run <repo> <workflow command…> [--backend claude|codex] [--model M] [--effort E] [--db PATH]
  spatial models [--db PATH]`;

function fail(msg: string): never {
  writeSync(2, `${msg}\n`);
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
    if (!health.ui) fail(`The server on port ${port} serves no UI (started with \`npm run server\`?). Open the Vite dev server with /repo?path=${encodeURIComponent(worktree)}`);
    const url = startScreenUrl(port, worktree);
    console.log(url);
    openBrowser(url);
  } else if (cmd === "models") {
    const rt = runtime();
    console.log(JSON.stringify(await rt.llm.listModels(), null, 2));
  } else if (cmd === "run") {
    const rt = runtime();
    const [repo, ...commandParts] = rest;
    if (!repo || !commandParts.length) fail(USAGE);
    const commandText = commandParts.join(" ");
    const parsed = parseCommand(rt.workflows.values(), commandText);
    if (!parsed.ok) fail(parsed.error);
    const backend = (values.backend ?? DEFAULT_LLM.backend) as LlmBackendId;
    if (backend !== "claude" && backend !== "codex") fail(`Unknown backend: ${backend}`);
    const llm = values.backend || values.model || values.effort
      ? { backend, model: values.model ?? (backend === DEFAULT_LLM.backend ? DEFAULT_LLM.model : fail("--model is required with --backend codex")), effort: values.effort ?? DEFAULT_LLM.effort }
      : undefined;

    const { worktree } = await resolveRepo(resolve(repo));
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

    const title = commandText.slice(0, 80);
    const session = await begin(rt, { path: worktree, worktree, ...(llm ? { llm } : {}) }, { via: "command", workflow: parsed.workflow, params: parsed.params, title, prompt: parsed.prompt }, undefined, true);
    console.log(sessionOverview(rt.plugins, sessionView(rt.store, session.id)).join("\n\n"));
  } else {
    fail(USAGE);
  }
} catch (e) {
  fail((e as Error).message);
}
