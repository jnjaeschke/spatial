import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { CodeLinksContext, postJson, type SessionState } from "../../../web/plugin-api.ts";
import { searchfoxCodeLinks } from "./searchfox-url.ts";

/** Provides Searchfox links for the session's code tokens; tokens a component asks for are resolved in one batched request per tick. A read-only view resolves nothing. */
export function SearchfoxProvider({ state, readOnly, children }: { state: SessionState; readOnly: boolean; children: ReactNode }) {
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const scheduled = useRef(false);
  const sessionId = state.session.id;
  const request = useCallback((tokens: string[]) => {
    if (readOnly) return;
    for (const token of tokens) {
      if (requested.current.has(token)) continue;
      requested.current.add(token);
      pending.current.add(token);
    }
    if (scheduled.current || !pending.current.size) return;
    scheduled.current = true;
    queueMicrotask(() => {
      scheduled.current = false;
      const batch = [...pending.current];
      pending.current.clear();
      void postJson<{ links: Record<string, string | null> }>(`/api/sessions/${sessionId}/code-links`, { tokens: batch }).then(({ links }) => setResolved((current) => ({ ...current, ...links })), (error: unknown) => console.error(error));
    });
  }, [sessionId, readOnly]);
  const value = useMemo(() => searchfoxCodeLinks(state, resolved, request), [state, request, resolved]);
  return <CodeLinksContext.Provider value={value}>{children}</CodeLinksContext.Provider>;
}
