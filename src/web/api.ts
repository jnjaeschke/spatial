import { useEffect, useState } from "react";
import type { ChatThreadData, DirectoryListing, LlmSelection, ModelsResponse, NotifyPayload, Progress, RecentRepo, RepoInfo, RuntimeEvent, Session, SessionState, StartQuestion, WorkflowInfo, WriteMode } from "../shared/types.ts";
import { showDesktop } from "./notifications.ts";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const get = <T>(path: string) => fetch(path).then((r) => parse<T>(r));
const post = <T>(path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => parse<T>(r));
const put = <T>(path: string, body: unknown) =>
  fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => parse<T>(r));

export const api = {
  sessions: () => get<Session[]>("/api/sessions"),
  repos: () => get<RecentRepo[]>("/api/repos"),
  dirs: (path?: string) => get<DirectoryListing>(`/api/dirs${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  repo: (path: string) => get<RepoInfo>(`/api/repo?path=${encodeURIComponent(path)}`),
  workflows: () => get<WorkflowInfo[]>("/api/workflows"),
  start: (path: string, text: string, llm: LlmSelection, opts: { writeMode?: WriteMode; answer?: number } = {}) => post<Session | StartQuestion>("/api/start", { path, text, llm, ...opts }),
  state: (id: string) => get<SessionState>(`/api/sessions/${id}/state`),
  narrate: (id: string, body: { llm: LlmSelection }) => post<{}>(`/api/sessions/${id}/narrate`, body),
  runAction: (path: string) => {
    if (!path.startsWith("/api/sessions/")) return Promise.reject(new Error("Invalid action path"));
    return post<unknown>(path, {});
  },
  models: () => get<ModelsResponse>("/api/llm/models"),
  turn: (sessionId: string, body: { threadId?: string; anchor?: string; text: string; llm: LlmSelection; quote?: string; lines?: ChatThreadData["lines"] }) =>
    post<{ taskId: string }>(`/api/sessions/${sessionId}/turns`, body),
  answerSelector: (sessionId: string, text: string, llm: LlmSelection) => post<{ artifactId: string }>(`/api/sessions/${sessionId}/selector-answer`, { text, llm }),
  note: (sessionId: string, body: string) => post<{ artifactId: string }>(`/api/sessions/${sessionId}/notes`, { body }),
  enableMcpServer: (sessionId: string, threadId: string, server: string) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/threads/${threadId}/enable-mcp-server`, { server }),
  decide: (sessionId: string, findingId: string, decision: "accepted" | "dismissed", llm?: LlmSelection) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/decide`, { decision, llm }),
  setReviewed: (sessionId: string, narrativeId: string, changeId: string, reviewed: boolean) =>
    post<{ artifactId: string }>(`/api/sessions/${sessionId}/narratives/${narrativeId}/changes/${changeId}/reviewed`, { reviewed }),
  saveComment: (sessionId: string, findingId: string, body: string) =>
    put<{ artifactId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/comment`, { body }),
  mapSpecSteps: (sessionId: string, specId: string, llm: LlmSelection) => post<{ taskId: string }>(`/api/sessions/${sessionId}/specs/${specId}/map`, { llm }),
  regenerateComment: (sessionId: string, findingId: string, llm?: LlmSelection) =>
    post<{ taskId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/comment/regenerate`, { llm }),
  postDrafts: (sessionId: string) => post<{ posted: number; skipped: { finding: string; reason: string }[]; revision: string }>(`/api/sessions/${sessionId}/post-drafts`, {}),
  cancel: (taskId: string) => post<void>(`/api/tasks/${taskId}/cancel`, {}),
};

/** Snapshot plus refetch on events. Progress events are kept client-side only. */
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

export function useModels(): ModelsResponse | null {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  useEffect(() => { api.models().then(setModels, (e: Error) => console.error(e)); }, []);
  return models;
}
