import type { SearchfoxCapability } from "./tasks.ts";

export function classifyToken(token: string): { kind: "file"; path: string; line?: number } | { kind: "symbol"; symbol: string } | null {
  const file = /^([\w.\-/]+\.[A-Za-z0-9]+)(?::(\d+))?$/.exec(token);
  if (file) return { kind: "file", path: file[1]!, ...(file[2] ? { line: Number(file[2]) } : {}) };
  const symbol = /^[A-Za-z_~][\w~]*(?:(?:::|\.)[A-Za-z_~][\w~]*)*(?:\(\))?$/.exec(token);
  if (!symbol || token.length < 3 || !(token.includes("::") || token.includes(".") || /[A-Z]/.test(token) || token.endsWith("()"))) return null;
  return { kind: "symbol", symbol: token.endsWith("()") ? token.slice(0, -2) : token };
}

export async function resolveCodeLinks(deps: {
  git: (args: string[]) => Promise<string>;
  searchfox: Pick<SearchfoxCapability, "define">;
  repoBase: string;
  rev: string;
  diffPaths: string[];
}, tokens: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const loggedErrors = new Set<string>();
  let treePaths: string[] | undefined;
  const exists = async (path: string) => {
    try { await deps.git(["cat-file", "-e", `${deps.rev}:${path}`]); return true; } catch { return false; }
  };
  const tree = async () => treePaths ??= (await deps.git(["ls-tree", "-r", "--name-only", deps.rev])).split("\n").filter(Boolean);
  for (const token of new Set(tokens)) {
    const parsed = classifyToken(token);
    if (!parsed) { out[token] = null; continue; }
    try {
      let path: string | null = null;
      let line: number | undefined;
      if (parsed.kind === "file") {
        line = parsed.line;
        if (parsed.path.includes("/")) path = await exists(parsed.path) ? parsed.path : null;
        else {
          const dirs = [...new Set(deps.diffPaths.map((file) => file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""))];
          const contextual: string[] = [];
          for (const dir of dirs) {
            const candidate = dir ? `${dir}/${parsed.path}` : parsed.path;
            if (await exists(candidate)) contextual.push(candidate);
          }
          if (contextual.length === 1) path = contextual[0]!;
          else if (contextual.length === 0) {
            const matches = (await tree()).filter((candidate) => candidate.slice(candidate.lastIndexOf("/") + 1) === parsed.path);
            if (matches.length === 1) path = matches[0]!;
          }
        }
      } else {
        const definition = await deps.searchfox.define(parsed.symbol, new AbortController().signal);
        if (definition && await exists(definition.path)) {
          const content = await deps.git(["show", `${deps.rev}:${definition.path}`]);
          const lines = content.split("\n");
          const matches = lines.flatMap((text, index) => text.trim() === definition.text.trim() ? [index + 1] : []);
          line = matches.sort((a, b) => Math.abs(a - definition.line) - Math.abs(b - definition.line))[0];
          if (line !== undefined) path = definition.path;
        }
      }
      out[token] = path ? `${deps.repoBase}rev/${deps.rev}/${path}${line === undefined ? "" : `#${line}`}` : null;
    } catch (error) {
      const message = (error as Error).message;
      if (!loggedErrors.has(message)) { loggedErrors.add(message); console.error(message); }
      out[token] = null;
    }
  }
  return out;
}
