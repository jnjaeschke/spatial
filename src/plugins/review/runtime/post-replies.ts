import type { Artifact, Id, Runtime } from "../../../plugin-api.ts";
import type { PhabCommentData, PostedReplyData } from "../shared/types.ts";
import { latestDiff } from "../shared/diffs.ts";
import { commitRevision } from "../shared/phabricator.ts";
import { ConduitClient, readArcToken } from "./conduit.ts";

/** Creates a draft inline per reply on the commented line and records a `PostedReply`. Phabricator publishes drafts only when the user submits them; general comments have no draft replies. */
export async function postInlineReplies(rt: Pick<Runtime, "store" | "putArtifact" | "putLink" | "emit">, sessionId: Id, replies: { comment: Artifact<PhabCommentData>; body: string }[], opts: { makeConduit?: (host: string) => ConduitClient } = {}): Promise<{ posted: number; skipped: { comment: Id; reason: string }[] }> {
  const makeConduit = opts.makeConduit ?? ((host: string) => new ConduitClient(process.env.SPATIAL_CONDUIT_BASE_URL ?? host, readArcToken(host)));
  const diff = latestDiff(rt.store.listArtifacts(sessionId));
  const hosts = new Map((diff?.data.commits ?? []).flatMap((commit) => { const revision = commitRevision(commit); return revision ? [[revision.id, revision.host] as const] : []; }));
  const posted = rt.store.listArtifacts(sessionId, "PostedReply") as Artifact<PostedReplyData>[];
  const conduits = new Map<string, ConduitClient>();
  const skipped: { comment: Id; reason: string }[] = [];
  let count = 0;
  for (const { comment, body } of replies) {
    const data = comment.data;
    if (data.path === undefined || data.line === undefined || data.diffId === undefined || data.isNewFile === undefined) {
      skipped.push({ comment: comment.id, reason: "general comment: Phabricator has no draft replies for it" });
      continue;
    }
    if (posted.some((receipt) => receipt.data.comment === comment.id && receipt.data.body === body)) {
      skipped.push({ comment: comment.id, reason: "already posted" });
      continue;
    }
    const host = hosts.get(data.revision);
    if (!host) {
      skipped.push({ comment: comment.id, reason: `D${data.revision} is not in the session's stack` });
      continue;
    }
    let conduit = conduits.get(host);
    if (!conduit) {
      conduit = makeConduit(host);
      conduits.set(host, conduit);
    }
    const result = await conduit.call<{ id: number }>("differential.createinline", {
      revisionID: data.revision, diffID: data.diffId, filePath: data.path, isNewFile: data.isNewFile ? 1 : 0,
      lineNumber: data.line, lineLength: data.length ?? 0, content: body,
    });
    const receipt = rt.putArtifact<PostedReplyData>("runtime", { sessionId, type: "PostedReply", status: "verified", data: {
      comment: comment.id, body, revision: data.revision, diff: data.diffId, inlineId: result.id,
    }, provenance: { taskId: "runtime" } });
    rt.putLink("runtime", { sessionId, from: receipt.id, to: comment.id, kind: "about" });
    posted.push(receipt);
    count++;
  }
  return { posted: count, skipped };
}
