import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { SessionState } from "../shared/types.ts";
import { api } from "./api.ts";
import { SearchfoxContext, searchfoxLinks } from "./searchfox-url.ts";

/** Provides Searchfox links for the session's code tokens; tokens a component asks for are resolved in one batched request per tick. A read-only view resolves nothing. */
export function SearchfoxProvider({ state, readOnly, children }: { state: SessionState; readOnly: boolean; children: ReactNode }) {
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const scheduled = useRef(false);
  const sessionId = state.session.id;
  const request = useCallback((token: string) => {
    if (readOnly || requested.current.has(token)) return;
    requested.current.add(token);
    pending.current.add(token);
    if (scheduled.current) return;
    scheduled.current = true;
    queueMicrotask(() => {
      scheduled.current = false;
      const tokens = [...pending.current];
      pending.current.clear();
      void api.codeLinks(sessionId, tokens).then(({ links }) => setResolved((current) => ({ ...current, ...links })), (error: unknown) => console.error(error));
    });
  }, [sessionId, readOnly]);
  const value = useMemo(() => {
    const links = searchfoxLinks(state, request);
    return links && { ...links, links: { ...links.links, ...resolved } };
  }, [state, request, resolved]);
  return <SearchfoxContext.Provider value={value}>{children}</SearchfoxContext.Provider>;
}
