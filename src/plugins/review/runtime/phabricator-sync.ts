import type { PhabCommentData, PhabSyncData, ReviewCommentData, ReviewFindingData } from "../shared/types.ts";
import type { PostedCommentData } from "../../../plugin-api.ts";
import { type Artifact, type DiffData, type DiffFile, type Id, type NotifyPayload, sessionView, searchDocs, type Runtime } from "../../../plugin-api.ts";
import { latestDiff } from "../shared/diffs.ts";
import { commitRevision, phabRevision } from "../shared/phabricator.ts";
import { parseUnifiedDiff } from "./diff-parse.ts";
import { latestPhabSync } from "../shared/phab-anchor.ts";
import { checkDrift } from "./drift.ts";
import { ConduitClient, readArcToken } from "./conduit.ts";
import { fetchTransactions, quoteLine, storeRemoteComments } from "./phab-transactions.ts";
import type { RevisionWatcher } from "./revision-watcher.ts";

type DiffInfo = { id: number; phid: string };
type WhoAmI = { phid: string; userName: string };

/** Slow poll of the Phabricator revision of watched sessions. Imports comments, announces newer diffs. Never touches git or the checkout. */
export class PhabricatorSyncer {
  #rt: Runtime;
  #watcher: Pick<RevisionWatcher, "watchedSessions">;
  #intervalMs: number;
  #makeConduit: (host: string) => ConduitClient;
  #conduits = new Map<string, ConduitClient>();
  #revisionPHIDs = new Map<string, string | null>();
  #rawDiffs = new Map<string, string>();
  #parsedDiffs = new Map<string, DiffFile[]>();
  #whoami = new Map<string, WhoAmI>();
  #authors = new Map<string, Map<string, string>>();
  #announced = new Map<string, number>();
  #highWater = new Map<string, number>();
  #errors = new Map<Id, string>();
  #missingToken = new Set<Id>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;

  constructor(rt: Runtime, watcher: Pick<RevisionWatcher, "watchedSessions">, opts: { intervalMs?: number; makeConduit?: (host: string) => ConduitClient } = {}) {
    this.#rt = rt;
    this.#watcher = watcher;
    this.#intervalMs = opts.intervalMs ?? 60_000;
    this.#makeConduit = opts.makeConduit ?? ((host) => new ConduitClient(process.env.SPATIAL_CONDUIT_BASE_URL ?? host, readArcToken(host)));
  }

  async tick(): Promise<void> {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      for (const sessionId of this.#watcher.watchedSessions()) {
        try {
          await this.#poll(sessionId);
          this.#errors.delete(sessionId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message !== this.#errors.get(sessionId)) {
            console.error(`Phabricator sync failed for session ${sessionId}: ${message}`);
            this.#errors.set(sessionId, message);
          }
        }
      }
    } finally {
      this.#ticking = false;
    }
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async #poll(sessionId: Id): Promise<void> {
    const artifacts = this.#rt.store.listArtifacts(sessionId);
    const diff = latestDiff(artifacts);
    if (!diff) return;
    const ranges: { revision: NonNullable<ReturnType<typeof commitRevision>>; base: string; head: string }[] = [];
    let start = diff.data.baseSha;
    for (const commit of diff.data.commits) {
      const revision = commitRevision(commit);
      if (!revision) continue;
      const existing = ranges.find((range) => range.revision.host === revision.host && range.revision.id === revision.id);
      if (existing) existing.head = commit.sha;
      else ranges.push({ revision, base: start, head: commit.sha });
      start = commit.sha;
    }
    for (const range of ranges) await this.#pollRevision(sessionId, diff, range);
  }

  async #pollRevision(sessionId: Id, diff: Artifact<DiffData>, range: { revision: NonNullable<ReturnType<typeof commitRevision>>; base: string; head: string }): Promise<void> {
    const revision = range.revision;
    const artifacts = this.#rt.store.listArtifacts(sessionId);
    if (this.#missingToken.has(sessionId)) return;
    let conduit = this.#conduits.get(revision.host);
    if (!conduit) {
      try {
        conduit = this.#makeConduit(revision.host);
      } catch (error) {
        if (error instanceof Error && error.message.includes("arcrc token")) {
          this.#missingToken.add(sessionId);
          return;
        }
        throw error;
      }
      this.#conduits.set(revision.host, conduit);
    }

    const revKey = `${revision.host}:D${revision.id}`;
    let revisionPHID = this.#revisionPHIDs.get(revKey);
    if (revisionPHID === undefined) {
      const result = await conduit.call<{ data?: { phid?: string }[] }>("differential.revision.search", { constraints: { ids: [revision.id] } });
      revisionPHID = result.data?.[0]?.phid ?? null;
      this.#revisionPHIDs.set(revKey, revisionPHID);
    }
    if (!revisionPHID) throw new Error(`Phabricator revision D${revision.id} was not found`);

    const diffResult = await conduit.call<{ data?: { id: number }[] }>("differential.diff.search", { constraints: { revisionPHIDs: [revisionPHID] }, order: "newest", limit: 20 });
    const diffs: DiffInfo[] = (diffResult.data ?? []).filter((item) => Number.isInteger(item.id)).map((item) => ({ id: item.id, phid: "" })).sort((a, b) => b.id - a.id);
    const localText = await this.#rt.gitFor(sessionId).diff(range.base, range.head);
    let matchingDiffId: number | null = null;
    for (const item of diffs) {
      const key = `${revision.host}:${item.id}`;
      let raw = this.#rawDiffs.get(key);
      if (raw === undefined) {
        raw = await conduit.call<string>("differential.getrawdiff", { diffID: item.id });
        this.#rawDiffs.set(key, raw);
      }
      if (checkDrift(localText, raw) === null) { matchingDiffId = item.id; break; }
    }
    const newestDiffId = diffs[0]?.id ?? null;
    const previousSync = latestPhabSync(artifacts, diff.id, revision.id);
    if (!previousSync || previousSync.data.matchingDiffId !== matchingDiffId || previousSync.data.latestDiffId !== newestDiffId) {
      const sync = this.#rt.store.putArtifact<PhabSyncData>({ sessionId, type: "PhabSync", status: "verified", data: { revision: revision.id, matchingDiffId, latestDiffId: newestDiffId, localDiff: diff.id }, provenance: { taskId: "runtime" } });
      this.#rt.emit(sessionId, "runtime", "artifact.created", { artifactId: sync.id, type: sync.type });
    }
    const revisionKey = `${sessionId}:${revision.host}:D${revision.id}`;
    if (matchingDiffId !== null && newestDiffId !== null && newestDiffId > matchingDiffId && this.#announced.get(revisionKey) !== newestDiffId) {
      this.#announced.set(revisionKey, newestDiffId);
      const position = [...diffs].sort((a, b) => a.id - b.id).findIndex((item) => item.id === newestDiffId) + 1;
      const payload: NotifyPayload = { id: `phab-diff:D${revision.id}:${newestDiffId}`, title: `D${revision.id} has a new diff (Diff ${position})`, body: `Run \`moz-phab patch D${revision.id}\` to fetch it (diff ${newestDiffId})` };
      this.#rt.emit(sessionId, "runtime", "notify", payload);
    }

    const comments = await fetchTransactions(conduit, revisionPHID);
    for (const comment of comments) {
      if (!comment.path || comment.line === undefined || comment.diffId === undefined || comment.isNewFile === undefined) continue;
      const key = `${revision.host}:${comment.diffId}`;
      let files = this.#parsedDiffs.get(key);
      if (!files) {
        let raw = this.#rawDiffs.get(key);
        if (raw === undefined) {
          raw = await conduit.call<string>("differential.getrawdiff", { diffID: comment.diffId });
          this.#rawDiffs.set(key, raw);
        }
        try { files = parseUnifiedDiff(raw); } catch { files = []; }
        this.#parsedDiffs.set(key, files);
      }
      comment.quote = quoteLine(files, comment.path, comment.line, comment.isNewFile);
    }
    let whoami = this.#whoami.get(revision.host);
    if (!whoami) {
      whoami = await conduit.call<WhoAmI>("user.whoami", {});
      this.#whoami.set(revision.host, whoami);
    }
    let authors = this.#authors.get(revision.host);
    if (!authors) { authors = new Map(); this.#authors.set(revision.host, authors); }
    const unknown = [...new Set(comments.map((comment) => comment.authorPHID).filter((phid) => !authors!.has(phid)))];
    if (unknown.length) {
      const users = await conduit.call<{ data?: { phid: string; fields?: { username?: string } }[] }>("user.search", { constraints: { phids: unknown } });
      for (const user of users.data ?? []) if (user.fields?.username) authors.set(user.phid, user.fields.username);
    }
    const current = this.#rt.store.listArtifacts(sessionId);
    const posted = postedComments(current, this.#rt.store.listLinks(sessionId));
    const beforeLinks = new Set(this.#rt.store.listLinks(sessionId).map((link) => link.id));
    const created = storeRemoteComments(this.#rt.store, sessionId, revision.id, comments, authors, { phid: whoami.phid, posted });
    const newLinks = this.#rt.store.listLinks(sessionId).filter((link) => !beforeLinks.has(link.id));
    const view = sessionView(this.#rt.store, sessionId);
    for (const artifact of created) {
      this.#rt.emit(sessionId, "runtime", "artifact.created", { artifactId: artifact.id, type: artifact.type });
      for (const link of newLinks.filter((item) => item.from === artifact.id)) this.#rt.emit(sessionId, "runtime", "link.created", { linkId: link.id, from: link.from, to: link.to, kind: link.kind });
      this.#rt.store.putSearchDocs(sessionId, artifact.id, searchDocs(this.#rt.plugins.artifactKinds, view, artifact));
      const old = newLinks.find((item) => item.from === artifact.id && item.kind === "revises");
      if (old) this.#rt.store.putSearchDocs(sessionId, old.to, []);
    }
    const maxTxId = comments.reduce((max, comment) => Math.max(max, comment.txId), 0);
    const previousHighWater = this.#highWater.get(revisionKey);
    this.#highWater.set(revisionKey, maxTxId);
    const announce = previousHighWater === undefined ? [] : created.filter((item) => {
      if (item.data.own || item.data.txId <= previousHighWater) return false;
      const previous = newLinks.find((link) => link.from === item.id && link.kind === "revises");
      return !previous || (this.#rt.store.getArtifact<PhabCommentData>(previous.to).data.version < item.data.version);
    });
    if (announce.length) {
      const authors = [...new Set(announce.map((item) => item.data.author))];
      const payload: NotifyPayload = {
        id: `phab-comments:D${revision.id}:${Math.max(...announce.map((item) => item.data.txId))}`,
        title: `D${revision.id}: ${announce.length} new comment${announce.length === 1 ? "" : "s"}`,
        body: authors.length > 1 ? `${authors[0]} and ${authors.length - 1} others` : authors[0],
      };
      this.#rt.emit(sessionId, "runtime", "notify", payload);
    }
  }
}

function postedComments(artifacts: Artifact[], links: { from: string; to: string; kind: string }[]): { body: string; path: string | null }[] {
  const posted = artifacts.filter((item) => item.type === "PostedComment") as Artifact<PostedCommentData>[];
  const comments = artifacts.filter((item) => item.type === "ReviewComment") as Artifact<ReviewCommentData>[];
  const findings = artifacts.filter((item) => item.type === "ReviewFinding") as Artifact<ReviewFindingData>[];
  return posted.flatMap((receipt) => {
    if (!links.some((link) => link.from === receipt.id && link.to === receipt.data.comment && link.kind === "about")) return [];
    const comment = comments.find((item) => item.id === receipt.data.comment);
    if (!comment) return [];
    const findingLink = links.find((link) => link.from === comment.id && link.kind === "about");
    const finding = findings.find((item) => item.id === findingLink?.to);
    return [{ body: comment.data.body, path: finding?.data.lines?.path ?? null }];
  });
}
