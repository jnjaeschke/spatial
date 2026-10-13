import type { ReactNode } from "react";
import type { SessionState } from "../shared/types.ts";
import { webSessionProviders } from "../plugins/web.ts";
import { TextLinksContext } from "./text-links.ts";

/** Wraps a session or export view in the session's text-link rules and every plugin's session provider. */
export function SessionProviders({ state, readOnly, children }: { state: SessionState; readOnly: boolean; children: ReactNode }) {
  return <TextLinksContext.Provider value={state.textLinks}>{webSessionProviders.reduceRight((inner, Provider) => <Provider state={state} readOnly={readOnly}>{inner}</Provider>, children)}</TextLinksContext.Provider>;
}
