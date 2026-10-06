import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { createRuntime, defaultDbPath } from "../runtime/create.ts";
import { createHttpServer } from "./http.ts";
import { RevisionWatcher } from "../runtime/revision-watcher.ts";
import { PhabricatorSyncer } from "../runtime/phabricator-sync.ts";

const { values } = parseArgs({
  options: { port: { type: "string", default: "4177" }, db: { type: "string" }, static: { type: "string" } },
});
const dbPath = values.db ?? defaultDbPath();
mkdirSync(dirname(dbPath), { recursive: true });
const staticDir = values.static ?? (existsSync("dist/web/index.html") ? "dist/web" : undefined);
const rt = createRuntime({ dbPath, claudeBin: process.env.SPATIAL_CLAUDE_BIN, codexBin: process.env.SPATIAL_CODEX_BIN });
const watcher = new RevisionWatcher(rt);
watcher.start();
new PhabricatorSyncer(rt, watcher).start();
const port = Number(values.port);
createHttpServer(rt, { staticDir, watcher }).listen(port, "127.0.0.1", () => {
  console.log(`runtime on http://127.0.0.1:${port}${staticDir ? "" : " (no static UI; use `npm run web`)"}`);
});
