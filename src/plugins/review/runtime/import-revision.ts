import type { Id } from "../../../shared/types.ts";
import type { GitCapability } from "../../../runtime/tasks.ts";
import type { PhabRevision } from "../shared/phabricator.ts";
import type { Runtime } from "../../../runtime/tasks.ts";
import { ConduitClient, readArcToken } from "./conduit.ts";
import { fetchStack, readOnly, StackShapeError, type StackEntry, type Conduit } from "./phab-revision.ts";
import { makeGitWriter } from "../../../runtime/git.ts";

const IDENTITY = { name: "Spatial Review", email: "spatial-review@localhost" };

/** `precondition`: local configuration or repository state cannot satisfy the request. `remote`: Conduit failed or answered unexpectedly. */
export class ImportRevisionError extends Error {
  kind: "precondition" | "remote";

  constructor(message: string, kind: "precondition" | "remote") {
    super(message);
    this.name = "ImportRevisionError";
    this.kind = kind;
  }
}

function defaultConduit(host: string): Conduit {
  let token: string;
  try {
    token = readArcToken(host);
  } catch (e) {
    throw new ImportRevisionError((e as Error).message, "precondition");
  }
  return new ConduitClient(process.env.SPATIAL_CONDUIT_BASE_URL ?? host, token);
}

/**
 * Rebuilds a Phabricator revision stack as commits and returns the range to review.
 * Only reads Conduit and writes objects plus refs under `refs/spatial/`; it never
 * changes the work tree, index, HEAD, or branches, and never fetches.
 */
export async function importRevision(
  rt: Runtime,
  sessionId: Id,
  rev: PhabRevision,
  opts: { conduit?: Conduit } = {},
): Promise<{ base: string; head: string }> {
  const session = rt.store.getSession(sessionId);
  return importRevisionInto(session.worktree, rt.gitFor(sessionId), rev, opts);
}

/** `importRevision` for a repo and its read-only git capability; the session-free core also used by the `importRevision` task. */
export async function importRevisionInto(
  repo: string,
  git: Pick<GitCapability, "resolve">,
  rev: PhabRevision,
  opts: { conduit?: Conduit } = {},
): Promise<{ base: string; head: string }> {
  const host = rev.host.replace(/\/+$/, "");
  const conduit = readOnly(opts.conduit ?? defaultConduit(host));
  let stack: StackEntry[];
  const raws: string[] = [];
  try {
    stack = await fetchStack(conduit, rev.id);
    for (const { diff } of stack) raws.push(await conduit.call<string>("differential.getrawdiff", { diffID: diff.id }));
  } catch (e) {
    throw new ImportRevisionError((e as Error).message, e instanceof StackShapeError ? "precondition" : "remote");
  }

  const root = stack[0]!;
  let base: string;
  try {
    base = await git.resolve(root.diff.base);
  } catch {
    throw new ImportRevisionError(
      `Base commit ${root.diff.base} of D${root.revision.id} (diff ${root.diff.id}) is not in ${repo}. Fetch it (for example "git fetch <remote> ${root.diff.base}") and try again; spatial never fetches on its own.`,
      "precondition",
    );
  }

  const writer = makeGitWriter(repo);
  const refs: [string, string][] = [];
  let parent = base;
  for (const [i, { revision, diff }] of stack.entries()) {
    const message = `${revision.title}\n\nDifferential Revision: ${host}/D${revision.id}`;
    let sha: string;
    try {
      sha = await writer.commitPatch(parent, raws[i]!, message, { ...IDENTITY, time: diff.dateCreated });
    } catch (e) {
      throw new ImportRevisionError(`D${revision.id} (diff ${diff.id}): ${(e as Error).message}`, "precondition");
    }
    refs.push([`refs/spatial/D${revision.id}/${diff.id}-${sha.slice(0, 12)}`, sha]);
    parent = sha;
  }
  for (const [ref, sha] of refs) await writer.updateRef(ref, sha);
  return { base, head: parent };
}
