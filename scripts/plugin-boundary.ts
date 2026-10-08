import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SKIP_WEB = true;
const COMPOSITION_ROOTS = new Set(["src/runtime/create.ts", "src/server/main.ts", "src/mcp/session-server.ts", "src/cli.ts", "src/web/App.tsx", "src/web/SessionView.tsx", "src/web/ExportView.tsx", "src/web/main.tsx"]);

export function resolveImport(file: string, specifier: string): string {
  return normalize(join(dirname(file), specifier)).replaceAll("\\", "/");
}

export function checkPluginBoundary(files: Map<string, string>): string[] {
  const errors: string[] = [];
  for (const [file, source] of files) {
    if (SKIP_WEB && file.startsWith("src/web/")) continue;
    const imports = /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.[^"']+)\1/g;
    for (const match of source.matchAll(imports)) {
      const specifier = match[2]!;
      const target = resolveImport(file, specifier).replace(/\.(?:tsx?|jsx?)$/, "");
      const importerPlugin = file.match(/^src\/plugins\/([^/]+)\//)?.[1];
      const targetPlugin = target.match(/^src\/plugins\/([^/]+)(?:\/|$)/)?.[1];
      if (!importerPlugin && targetPlugin && !(COMPOSITION_ROOTS.has(file) && ["src/plugins/index", "src/plugins/web"].includes(target))) errors.push(`${file} → ${specifier}`);
      if (importerPlugin && targetPlugin !== importerPlugin && !["src/plugin-api", "src/web/plugin-api"].includes(target)) errors.push(`${file} → ${specifier}`);
    }
  }
  return errors.sort();
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  }))).flat();
}

export async function checkFilesystem(): Promise<string[]> {
  const paths = await walk("src");
  const files = new Map(await Promise.all(paths.map(async (path) => [path, await readFile(join(ROOT, path), "utf8")] as const)));
  return checkPluginBoundary(files);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = await checkFilesystem();
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
}
