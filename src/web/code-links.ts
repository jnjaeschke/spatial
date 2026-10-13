import { createContext, useContext, useEffect } from "react";

/** Links from code to the repository's browsable source, offered by a plugin's session provider. */
export interface CodeLinks {
  /** A link to `path` (at `line`) on the given diff side; null when that side has no link. `side` defaults to `"old"`. */
  fileUrl(path: string, line?: number, side?: "old" | "new"): string | null;
  /** The resolved link of a code token; null while it is pending and when it has none. */
  tokenUrl(token: string): string | null;
  /** Asks for the links of unresolved tokens. */
  request(tokens: string[]): void;
  /** Text of a hunk's file link. */
  label: string;
  /** Tooltip of the links. */
  title: string;
}

/** Null when no plugin provides code links for the session. */
export const CodeLinksContext = createContext<CodeLinks | null>(null);

/** The link of a code token, requesting it when unresolved; null while pending, when it has no link, and for a null token. */
export function useCodeLinkUrl(token: string | null): string | null {
  const links = useContext(CodeLinksContext);
  useEffect(() => {
    if (token !== null) links?.request([token]);
  }, [links, token]);
  return token === null ? null : links?.tokenUrl(token) ?? null;
}
