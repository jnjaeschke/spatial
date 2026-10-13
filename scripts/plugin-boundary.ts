import { readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PLUGIN_KIND_ALLOWLIST: { file: string; name: string; reason: string }[] = [
  { file: "src/runtime/plugins.ts", name: "investigate", reason: "Workflow's default phase id is consumed by the core runtime contract." },
  { file: "src/shared/types.ts", name: "Diff", reason: "The Diff data shape is currently shared with core runtime and UI." },
  { file: "src/web/SessionView.tsx", name: "comment", reason: "The shared canvas represents comment drafts with this draft kind." },
  { file: "src/web/chat-context.ts", name: "comment", reason: "The shared chat context exposes review comment drafts." },
  { file: "src/web/graph.ts", name: "comment", reason: "The shared graph omits comment drafts from chat nodes." },
];
/** The registries list the plugins; only they import plugin manifests. */
const REGISTRIES = new Set(["src/plugins/index", "src/plugins/web"]);
const COMPOSITION_ROOTS = new Set(["src/runtime/create.ts", "src/server/main.ts", "src/mcp/session-server.ts", "src/cli.ts", "src/web/App.tsx", "src/web/SessionView.tsx", "src/web/ExportView.tsx", "src/web/SessionProviders.tsx", "src/web/main.tsx"]);

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

export function checkPluginKindReferences(files: Map<string, string>, kinds: { name: string; plugin: string }[], allowlist: { file: string; name: string; reason: string }[] = PLUGIN_KIND_ALLOWLIST): string[] {
  const errors: string[] = [];
  for (const [file, source] of files) {
    if (file.startsWith("src/plugins/")) continue;
    for (const { name, plugin } of kinds) {
      if (allowlist.some((entry) => entry.file === file && entry.name === name)) continue;
      const literal = new RegExp(`(["'\\x60])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "g");
      for (const match of source.matchAll(literal)) {
        const line = source.slice(0, match.index).split("\n").length;
        errors.push(`${file}:${line} → "${name}" (${plugin})`);
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
  const { plugins } = await import("../src/plugins/index.ts");
  const kinds = plugins.flatMap((plugin) => [
    ...Object.keys(plugin.artifactKinds ?? {}).map((name) => ({ name, plugin: plugin.id })),
    ...(plugin.tasks ?? []).map((task) => ({ name: task.kind, plugin: plugin.id })),
  ]);
  return [...checkPluginBoundary(files), ...checkPluginKindReferences(files, kinds)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = await checkFilesystem();
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
}
