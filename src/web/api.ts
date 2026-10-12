import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ChatThreadData, DirectoryListing, LlmActivity, LlmSelection, ModelsResponse, NotifyPayload, Progress, RecentRepo, RepoInfo, RuntimeEvent, Session, SessionState, StartQuestion, TaskActivityResponse, WorkflowInfo, WriteMode } from "../shared/types.ts";
import { showDesktop } from "./notifications.ts";
import { readLastUsed, subscribeLastUsed, withLastUsed } from "./llm-choice.ts";

/** A failed request to the runtime: the server's error message and the HTTP status. */
export class RequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new RequestError(body.error ?? `${res.status} ${res.statusText}`, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** GET a runtime route as JSON; rejects with `RequestError`. */
export const get = <T>(path: string) => fetch(path).then((r) => parse<T>(r));
/** POST JSON to a runtime route; rejects with `RequestError`. */
export const post = <T>(path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => parse<T>(r));
/** PUT JSON to a runtime route; rejects with `RequestError`. */
export const put = <T>(path: string, body: unknown) =>
  fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => parse<T>(r));
/** DELETE JSON to a runtime route; rejects with `RequestError`. */
export const del = <T>(path: string, body: unknown) =>
  fetch(path, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => parse<T>(r));

export const api = {
  sessions: () => get<Session[]>("/api/sessions"),
  repos: () => get<RecentRepo[]>("/api/repos"),
  dirs: (path?: string) => get<DirectoryListing>(`/api/dirs${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  repo: (path: string) => get<RepoInfo>(`/api/repo?path=${encodeURIComponent(path)}`),
  workflows: () => get<WorkflowInfo[]>("/api/workflows"),
  start: (path: string, text: string, llm: LlmSelection, writeMode: WriteMode) => post<Session | StartQuestion>("/api/start", { path, text, llm, writeMode }),
  answerStart: (question: string, answer: number | string) => post<Session | StartQuestion>("/api/start", { question, answer }),
  state: (id: string) => get<SessionState>(`/api/sessions/${id}/state`),
  narrate: (id: string, body: { llm: LlmSelection }) => post<{}>(`/api/sessions/${id}/narrate`, body),
  runAction: (path: string) => {
    if (!path.startsWith("/api/sessions/")) return Promise.reject(new Error("Invalid action path"));
    return post<unknown>(path, {});
  },
  models: () => get<ModelsResponse>("/api/llm/models"),
  turn: (sessionId: string, body: { threadId?: string; anchor?: string; text: string; llm: LlmSelection; quote?: string; lines?: ChatThreadData["lines"] }) =>
    post<{ taskId: string }>(`/api/sessions/${sessionId}/turns`, body),
  note: (sessionId: string, body: string) => post<{ artifactId: string }>(`/api/sessions/${sessionId}/notes`, { body }),
  enableMcpServer: (sessionId: string, threadId: string, server: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/threads/${threadId}/enable-mcp-server`, { server }),
  setReviewed: (sessionId: string, narrativeId: string, changeId: string, reviewed: boolean) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/narratives/${narrativeId}/changes/${changeId}/reviewed`, { reviewed }),
  codeLinks: (sessionId: string, tokens: string[]) => post<{ links: Record<string, string | null> }>(`/api/sessions/${sessionId}/code-links`, { tokens }),
  saveComment: (sessionId: string, findingId: string, body: string) =>
    put<{ artifactId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/comment`, { body }),
  createComment: (sessionId: string, diffId: string, lines: NonNullable<ChatThreadData["lines"]>, body: string, replyTo?: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/comments`, { diffId, lines, body, replyTo }),
  editComment: (sessionId: string, stableId: string, body: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/comments/${stableId}`, { body }),
  deleteComment: (sessionId: string, stableId: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/comments/${stableId}`, { deleted: true }),
  saveReviewDraft: (sessionId: string, revision: number, body: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/review-draft`, { revision, body }),
  replyInGeneralComment: (sessionId: string, replyTo: string, body: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/review-draft/reply`, { replyTo, body }),
  draftPhabReply: (sessionId: string, anchorId: string, threadId: string, llm?: LlmSelection) =>
    post<{ replyId: string; body: string }>(`/api/sessions/${sessionId}/phab-threads/${anchorId}/draft-reply`, { threadId, llm }),
  followSpecRef: (sessionId: string, ref: string) => post<{ specId: string }>(`/api/sessions/${sessionId}/spec-refs`, { ref }),
  mapSpecSteps: (sessionId: string, specId: string, llm: LlmSelection) => post<{ taskId: string }>(`/api/sessions/${sessionId}/specs/${specId}/map`, { llm }),
  regenerateComment: (sessionId: string, findingId: string, llm?: LlmSelection) =>
    post<{ taskId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/comment/regenerate`, { llm }),
  submitReview: (sessionId: string, body: { revision: number; action: "comment" | "accept" | "request-changes"; body: string }) =>
    post<{ inlines: number; skipped: { source: string; reason: string }[]; revision: string }>(`/api/sessions/${sessionId}/review-submit`, body),
  cancel: (taskId: string) => post<void>(`/api/tasks/${taskId}/cancel`, {}),
  taskActivity: (sessionId: string, taskId: string) => get<TaskActivityResponse>(`/api/sessions/${sessionId}/tasks/${taskId}/activity`),
  /** `live`: hand the text to the running agent instead of stopping and rerunning it. */
  steer: (sessionId: string, text: string, live = false) => post<{ steerId: string }>(`/api/sessions/${sessionId}/steer`, { text, ...(live ? { live } : {}) }),
  decide: (sessionId: string, decisionId: string, option: string, body: { text?: string; llm?: LlmSelection } = {}) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/decisions/${decisionId}`, { option, ...body }),
  decideFinding: (sessionId: string, findingId: string, decision: "accepted" | "dismissed", llm?: LlmSelection) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/decide`, { decision, llm }),
  triageComment: (sessionId: string, commentId: string, action: "address" | "reply" | "ignore", text?: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/reviewer-comments/${commentId}/triage`, { action, ...(text ? { text } : {}) }),
  postReplies: (sessionId: string) =>
    post<{ posted: number; skipped: { comment: string; reason: string }[] }>(`/api/sessions/${sessionId}/reviewer-comments/post-replies`, {}),
  retry: (sessionId: string) => post<{}>(`/api/sessions/${sessionId}/retry`, {}),
};

/** Snapshot plus refetch on events. Progress events are kept client-side only; activity events are left to `useTaskActivity`. */
export function useSessionState(id: string) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [notices, setNotices] = useState<NotifyPayload[]>([]);
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => api.state(id).then((s) => !cancelled && setState(s), (e: Error) => !cancelled && setError(e.message));
    api.state(id).then((s) => {
      if (cancelled) return;
      setState(s);
      es = new EventSource(`/api/sessions/${id}/events?after=${s.lastEventId}`);
      es.addEventListener("runtime", (m) => {
        const e = JSON.parse((m as MessageEvent).data) as RuntimeEvent;
        if (e.type === "task.progress") {
          const p = e.payload as { taskId: string; progress: Progress };
          setProgress((x) => ({ ...x, [p.taskId]: p.progress }));
          return;
        }
        if (e.type === "task.activity") return;
        if (e.type === "notify") {
          const notice = e.payload as NotifyPayload;
          setNotices((current) => current.some((n) => n.id === notice.id) ? current : [...current, notice]);
          showDesktop(notice);
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(refetch, 100);
      });
    }, (e: Error) => setError(e.message));
    return () => { cancelled = true; es?.close(); clearTimeout(timer); };
  }, [id]);
  const dismissNotice = (noticeId: string) => setNotices((current) => current.filter((n) => n.id !== noticeId));
  return { state, error, progress, notices, dismissNotice };
}

/** `taskId`'s LLM activity so far, growing while it runs; null while loading. */
export function useTaskActivity(sessionId: string, taskId: string): { activity: LlmActivity[] | null; error: string | null } {
  const [state, setState] = useState<{ activity: LlmActivity[] | null; error: string | null }>({ activity: null, error: null });
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | undefined;
    setState({ activity: null, error: null });
    api.taskActivity(sessionId, taskId).then(({ activity, lastEventId }) => {
      if (cancelled) return;
      setState({ activity, error: null });
      es = new EventSource(`/api/sessions/${sessionId}/events?after=${lastEventId}`);
      es.addEventListener("runtime", (m) => {
        const e = JSON.parse((m as MessageEvent).data) as RuntimeEvent;
        const p = e.payload as { taskId: string; activity: LlmActivity };
        if (e.type === "task.activity" && p.taskId === taskId) setState((s) => ({ activity: [...s.activity ?? [], p.activity], error: null }));
      });
    }, (e: Error) => !cancelled && setState({ activity: null, error: e.message }));
    return () => { cancelled = true; es?.close(); };
  }, [sessionId, taskId]);
  return state;
}

/** The configured models with the last-used selection (`rememberLlm`) as `default`; `error` when they could not be loaded, both null while loading. */
export function useModels(): { models: ModelsResponse | null; error: string | null } {
  const [state, setState] = useState<{ models: ModelsResponse | null; error: string | null }>({ models: null, error: null });
  useEffect(() => { api.models().then((models) => setState({ models, error: null }), (e: Error) => setState({ models: null, error: e.message })); }, []);
  const lastUsed = useSyncExternalStore(subscribeLastUsed, readLastUsed);
  const models = useMemo(() => state.models && withLastUsed(state.models, lastUsed), [state.models, lastUsed]);
  return { models, error: state.error };
}
