import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { McpServerSpec } from "./llm/types.ts";

export interface RepoSkill {
  name: string;
  description: string;
}

export interface RepoContext {
  mcpServers: Record<string, McpServerSpec>;
  requestableMcpServers: Record<string, McpServerSpec>;
  skills: RepoSkill[];
  instructions: string | null;
}

/**
 * Loads MCP servers, skills, and instructions from a repository root.
 * Servers named in `denied` are only requestable. Malformed files and unresolved instruction includes throw instead of being skipped.
 */
export function loadRepoContext(repoRoot: string, denied: readonly string[] = []): RepoContext {
  const all = loadMcpServers(repoRoot);
  const mcpServers = Object.fromEntries(Object.entries(all).filter(([name]) => !denied.includes(name)));
  const requestableMcpServers = Object.fromEntries(Object.entries(all).filter(([name]) => denied.includes(name)));
  return {
    mcpServers,
    requestableMcpServers,
    skills: loadSkills(repoRoot),
    instructions: loadInstructions(repoRoot),
  };
}

export function prependRepoContext(system: string, context: { repoInstructions: string | null; repoSkills: RepoSkill[] }): string {
  const parts: string[] = [];
  if (context.repoInstructions) parts.push(context.repoInstructions);
  if (context.repoSkills.length) {
    parts.push("# Available skills\n" + context.repoSkills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n"));
    parts.push("Use `read_skill(name)` on the `spatial` MCP server to retrieve the full skill instructions.");
  }
  return parts.length ? `${parts.join("\n\n")}\n\n${system}` : system;
}

/** Reads `path`, which must resolve (symlinks included) to a file inside `repoRoot`. */
function readInsideRepo(repoRoot: string, path: string): string {
  const real = realpathSync(path);
  const rel = relative(realpathSync(repoRoot), real);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${path} resolves outside the repository`);
  return readFileSync(real, "utf8");
}

/** Reads a skill only when its frontmatter name appears in the repo skill index. */
export function readRepoSkill(repoRoot: string, name: string): string {
  const base = join(repoRoot, ".agents", "skills");
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(base, entry.name, "SKILL.md");
      if (!existsSync(path)) continue;
      const content = readInsideRepo(repoRoot, path);
      const frontmatter = parseFrontmatter(path, content);
      if (frontmatter.name === name && frontmatter.description) return content;
    }
  }
  throw new Error(`Skill not found: ${name}`);
}

/** Loads and expands every repo MCP server spec before applying the denylist. */
function loadMcpServers(repoRoot: string): Record<string, McpServerSpec> {
  const path = join(repoRoot, ".mcp.json");
  if (!existsSync(path)) return {};

  const raw = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, unknown> };
  const out: Record<string, McpServerSpec> = {};
  for (const [name, spec] of Object.entries(raw.mcpServers ?? {})) {
    const server = spec as Record<string, unknown>;
    if (server.type === "http" && typeof server.url === "string") {
      out[name] = { type: "http", url: server.url };
    } else if (
      (server.type === "stdio" || server.type === undefined) &&
      typeof server.command === "string" &&
      Array.isArray(server.args)
    ) {
      out[name] = {
        type: "stdio",
        command: expandVars(server.command),
        args: (server.args as string[]).map(expandVars),
        ...(server.env ? { env: server.env as Record<string, string> } : {}),
      };
    } else {
      throw new Error(`Malformed MCP server spec for "${name}" in ${path}`);
    }
  }
  return out;
}

function loadSkills(repoRoot: string): RepoSkill[] {
  const base = join(repoRoot, ".agents", "skills");
  if (!existsSync(base)) return [];

  const skills: RepoSkill[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(base, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const content = readInsideRepo(repoRoot, skillPath);
    const frontmatter = parseFrontmatter(skillPath, content);
    if (!frontmatter.name || !frontmatter.description) {
      throw new Error(`SKILL.md at ${skillPath} missing name or description in frontmatter`);
    }
    skills.push({
      name: frontmatter.name,
      description: frontmatter.description.replace(/\s+/g, " ").trim(),
    });
  }
  return skills;
}

function parseFrontmatter(path: string, content: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) throw new Error(`No YAML frontmatter in ${path}`);

  const out: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    let value = match[2].trim();
    if (/^[>|][-+]?$/.test(value)) {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        block.push(lines[++i].trim());
      }
      value = block.join(" ");
    }
    out[match[1]] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** Expands `${VAR}` and `${VAR:-default}` from process.env, as `.mcp.json` allows. */
function expandVars(value: string): string {
  return value.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_match, name: string, fallback?: string) =>
    process.env[name] ?? fallback ?? "",
  );
}

function loadInstructions(repoRoot: string): string | null {
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    let content = readFileSync(path, "utf8").trim();
    if (/^@\S+$/.test(content)) {
      const included = join(repoRoot, content.slice(1));
      if (!existsSync(included)) {
        throw new Error(`${name} includes ${content} but ${included} does not exist`);
      }
      content = readInsideRepo(repoRoot, included).trim();
    }
    return content;
  }
  return null;
}
