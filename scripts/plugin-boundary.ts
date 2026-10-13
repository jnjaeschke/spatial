import { readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
/** The registries list the plugins; only they import plugin manifests. */
const REGISTRIES = new Set(["src/plugins/index", "src/plugins/web"]);
const COMPOSITION_ROOTS = new Set(["src/runtime/create.ts", "src/server/main.ts", "src/mcp/session-server.ts", "src/cli.ts", "src/web/App.tsx", "src/web/SessionView.tsx", "src/web/ExportView.tsx", "src/web/main.tsx"]);

export function resolveImport(file: string, specifier: string): string {
  return normalize(join(dirname(file), specifier)).replaceAll("\\", "/");
}

/** The ids in the `dependsOn: [...]` literal of `src/plugins/<plugin>/index.ts`; none when the manifest is absent or declares none. */
export function declaredDependencies(files: Map<string, string>, plugin: string): string[] {
  const list = /\bdependsOn:\s*\[([^\]]*)\]/.exec(files.get(`src/plugins/${plugin}/index.ts`) ?? "")?.[1] ?? "";
  return [...list.matchAll(/["']([\w-]+)["']/g)].map((match) => match[1]!);
}

export function checkPluginBoundary(files: Map<string, string>): string[] {
  const errors: string[] = [];
  for (const [file, source] of files) {
    const imports = /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.[^"']+)\1/g;
    for (const match of source.matchAll(imports)) {
      const specifier = match[2]!;
      const target = resolveImport(file, specifier).replace(/\.(?:tsx?|jsx?)$/, "");
      const importerPlugin = file.match(/^src\/plugins\/([^/]+)\//)?.[1];
      const targetPlugin = target.match(/^src\/plugins\/([^/]+)(?:\/|$)/)?.[1];
      if (REGISTRIES.has(file.replace(/\.ts$/, ""))) continue;
      if (!importerPlugin && targetPlugin && !(COMPOSITION_ROOTS.has(file) && REGISTRIES.has(target))) errors.push(`${file} → ${specifier}`);
      if (importerPlugin && targetPlugin !== importerPlugin) {
        const core = ["src/plugin-api", "src/web/plugin-api", "src/web/graph-api"].includes(target);
        const dependencyApi = targetPlugin !== undefined && declaredDependencies(files, importerPlugin).includes(targetPlugin) && [`src/plugins/${targetPlugin}/api`, `src/plugins/${targetPlugin}/web/api`].includes(target);
        if (!core && !dependencyApi) errors.push(`${file} → ${specifier}`);
      }
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
