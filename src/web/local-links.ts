const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|mailto:)/i;
const FILE = /^[\w.\-/]+\.[A-Za-z0-9]+$/;

/** The `path` or `path:line` code token a markdown link to a local file stands for: `href` is an absolute path inside `worktree` or a repo-relative path, with an optional `:line[:column]` or `#Lline[-Lline]` suffix. Null for any other link. */
export function localLinkToken(href: string | undefined, worktree: string | undefined): string | null {
  if (!href || EXTERNAL.test(href)) return null;
  const match = /^(.*?)(?:#L(\d+)(?:-L?\d+)?|:(\d+)(?::\d+)?)?$/.exec(href);
  const line = match?.[2] ?? match?.[3];
  let path = match?.[1] ?? "";
  if (path.startsWith("/")) {
    const root = worktree?.replace(/\/+$/, "");
    if (!root || !path.startsWith(`${root}/`)) return null;
    path = path.slice(root.length + 1);
  } else if (path.startsWith("./")) path = path.slice(2);
  if (!FILE.test(path) || path.split("/").some((part) => part === ".." || part === "")) return null;
  return line ? `${path}:${line}` : path;
}
