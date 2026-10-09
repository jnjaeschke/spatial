import type { SearchfoxCapability } from "./tasks.ts";

const SYMBOL = /^[A-Za-z_~][\w~]*(?:(?:::|\.)[A-Za-z_~][\w~]*)*(?:\(\))?$/;

export function classifyToken(token: string): { kind: "file"; path: string; line?: number } | { kind: "symbol"; symbol: string } | null {
  const file = /^([\w.\-/]+\.[A-Za-z0-9]+)(?::(\d+))?$/.exec(token);
  if (file) return { kind: "file", path: file[1]!, ...(file[2] ? { line: Number(file[2]) } : {}) };
  const symbol = SYMBOL.exec(token);
  if (!symbol || token.length < 3 || !(token.includes("::") || token.includes(".") || /[A-Z]/.test(token) || token.endsWith("()"))) return null;
  return { kind: "symbol", symbol: token.endsWith("()") ? token.slice(0, -2) : token };
}

/** Concurrent searchfox-cli lookups; each symbol costs two network calls. */
const CONCURRENCY = 6;

/** Resolves tokens to Searchfox permalinks at `rev`; `null` when a token has no link. Tokens whose lookup failed are left out, so a later request retries them. */
export async function resolveCodeLinks(deps: {
  git: (args: string[]) => Promise<string>;
  searchfox: Pick<SearchfoxCapability, "define">;
  repoBase: string;
  rev: string;
  diffPaths: string[];
}, tokens: string[]): Promise<Record<string, string | null>> {
  const url = (path: string, line?: number) => `${deps.repoBase}rev/${deps.rev}/${path}${line === undefined ? "" : `#${line}`}`;
  const exists = async (path: string) => {
    try { await deps.git(["cat-file", "-e", `${deps.rev}:${path}`]); return true; } catch { return false; }
  };
  let tree: Promise<string[]> | undefined;
  const treePaths = () => tree ??= deps.git(["ls-tree", "-r", "--name-only", deps.rev]).then((out) => out.split("\n").filter(Boolean));
  const filePath = async (path: string): Promise<string | null> => {
    if (path.includes("/")) return await exists(path) ? path : null;
    const dirs = [...new Set(deps.diffPaths.map((file) => file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""))];
    const contextual = (await Promise.all(dirs.map(async (dir) => { const candidate = dir ? `${dir}/${path}` : path; return await exists(candidate) ? candidate : null; }))).filter((candidate) => candidate !== null);
    if (contextual.length) return contextual.length === 1 ? contextual[0]! : null;
    const matches = (await treePaths()).filter((candidate) => candidate.slice(candidate.lastIndexOf("/") + 1) === path);
    return matches.length === 1 ? matches[0]! : null;
  };
  const symbolUrl = async (symbol: string): Promise<string | null> => {
    const definition = await deps.searchfox.define(symbol, new AbortController().signal);
    if (!definition || !await exists(definition.path)) return null;
    const lines = (await deps.git(["show", `${deps.rev}:${definition.path}`])).split("\n");
    const line = lines.flatMap((text, index) => text.trim() === definition.text.trim() ? [index + 1] : []).sort((a, b) => Math.abs(a - definition.line) - Math.abs(b - definition.line))[0];
    return line === undefined ? null : url(definition.path, line);
  };
  const resolve = async (token: string): Promise<string | null> => {
    const parsed = classifyToken(token);
    if (!parsed) return null;
    if (parsed.kind === "symbol") return symbolUrl(parsed.symbol);
    const path = await filePath(parsed.path);
    if (path) return url(path, parsed.line);
    // `window.open` looks like a file name; when no such file exists it may still name a symbol.
    return parsed.line === undefined && SYMBOL.test(token) ? symbolUrl(token) : null;
  };

  const out: Record<string, string | null> = {};
  const logged = new Set<string>();
  const queue = [...new Set(tokens)];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let token = queue.shift(); token !== undefined; token = queue.shift()) {
      try { out[token] = await resolve(token); }
      catch (error) {
        const message = (error as Error).message;
        if (!logged.has(message)) { logged.add(message); console.error(`code link lookup failed: ${message}`); }
      }
    }
  }));
  return out;
}
