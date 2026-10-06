import type { Artifact, Id, PhabCommentData } from "../shared/types.ts";
import { ConduitClient } from "./conduit.ts";
import { Store } from "./store.ts";
import { latestByPhid } from "../shared/phab-comments.ts";

export interface RemoteComment {
  phid: string; version: number; authorPHID: string; body: string; path?: string; line?: number; length?: number;
  diffId?: number; isNewFile?: boolean; isDone?: boolean; replyTo?: string; txId: number; dateCreated: number;
}

/** Parses the supported comment transactions returned by `transaction.search`. */
export function parseTransactions(result: unknown): { comments: RemoteComment[]; after: string | null } {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("transaction.search result must be an object");
  const value = result as Record<string, unknown>;
  if (!Array.isArray(value.data)) throw new Error("transaction.search result is missing data array");
  const cursor = value.cursor;
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) throw new Error("transaction.search result is missing cursor");
  const afterValue = (cursor as Record<string, unknown>).after;
  if (afterValue !== null && typeof afterValue !== "string") throw new Error("transaction.search cursor.after must be a string or null");
  const comments: RemoteComment[] = [];
  for (const raw of value.data) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("transaction.search data entry must be an object");
    const tx = raw as Record<string, any>;
    if (tx.type !== "inline" && tx.type !== "comment") continue;
    for (const comment of Array.isArray(tx.comments) ? tx.comments : []) {
      if (!comment || comment.removed) continue;
      if (typeof comment.phid !== "string" || !Number.isInteger(comment.version) || typeof comment.authorPHID !== "string" || typeof comment.content?.raw !== "string") throw new Error(`transaction ${tx.id} has a malformed comment`);
      const parsed: RemoteComment = {
        phid: comment.phid, version: comment.version, authorPHID: comment.authorPHID,
        body: comment.content?.raw, txId: tx.id, dateCreated: tx.dateCreated,
      };
      if (tx.type === "inline") {
        const fields = tx.fields;
        if (!fields || typeof fields.path !== "string") throw new Error("inline transaction missing fields.path");
        if (!Number.isInteger(fields.line)) throw new Error("inline transaction missing fields.line");
        if (!fields.diff || !Number.isInteger(fields.diff.id)) throw new Error("inline transaction missing fields.diff.id");
        Object.assign(parsed, { path: fields.path, line: fields.line, length: fields.length, diffId: fields.diff.id, isNewFile: fields.isNewFile, isDone: fields.isDone });
        if (fields.replyToCommentPHID) parsed.replyTo = fields.replyToCommentPHID;
      }
      comments.push(parsed);
    }
  }
  return { comments, after: afterValue as string | null };
}

/** Fetches every page of `transaction.search` for a revision. */
export async function fetchTransactions(conduit: ConduitClient, revisionPHID: string): Promise<RemoteComment[]> {
  const comments: RemoteComment[] = [];
  let after: string | null = null;
  do {
    const params: Record<string, unknown> = { objectIdentifier: revisionPHID };
    if (after !== null) params.after = after;
    const page = parseTransactions(await conduit.call("transaction.search", params));
    comments.push(...page.comments);
    after = page.after;
  } while (after !== null);
  return comments;
}

/** Stores new, edited, and done-toggled remote comments idempotently. */
export function storeRemoteComments(store: Store, sessionId: Id, revision: number, comments: RemoteComment[], authors: Map<string, string>, own: { phid: string; posted: { body: string; path: string | null }[] }): Artifact<PhabCommentData>[] {
  const latest = latestByPhid(store.listArtifacts(sessionId, "PhabComment"));
  const created: Artifact<PhabCommentData>[] = [];
  for (const comment of comments) {
    const done = comment.isDone ?? false;
    const previous = latest.get(comment.phid);
    // `comments` lists every version of a comment; only a newer version or a done toggle is new.
    if (previous && (comment.version < previous.data.version || (comment.version === previous.data.version && previous.data.done === done))) continue;
    const isOwnAuthor = comment.authorPHID === own.phid;
    const isOwn = isOwnAuthor && own.posted.some((item) => item.body === comment.body && (comment.path === undefined || item.path === comment.path));
    const author = authors.get(comment.authorPHID) ?? comment.authorPHID;
    const data: PhabCommentData = {
      revision, phid: comment.phid, version: comment.version, author, bot: /bot$/i.test(author),
      body: comment.body, ...(comment.path !== undefined ? { path: comment.path } : {}), ...(comment.line !== undefined ? { line: comment.line } : {}),
      ...(comment.length !== undefined ? { length: comment.length } : {}), ...(comment.diffId !== undefined ? { diffId: comment.diffId } : {}),
      ...(comment.isNewFile !== undefined ? { isNewFile: comment.isNewFile } : {}), ...(comment.replyTo ? { replyTo: comment.replyTo } : {}),
      own: isOwn, done, txId: comment.txId, dateCreated: comment.dateCreated,
    };
    const artifact = store.putArtifact({ sessionId, type: "PhabComment", status: "verified", data, provenance: { taskId: "runtime" } });
    if (previous) store.putLink({ sessionId, from: artifact.id, to: previous.id, kind: "revises" });
    created.push(artifact);
    latest.set(comment.phid, artifact);
  }
  return created;
}
