/** A searchfox permalink: `path` at revision `rev` of the repository at `repoBase`, at `line` when given. */
export function fileUrl(sf: { repoBase: string; rev: string }, path: string, line?: number): string {
  return `${sf.repoBase}rev/${sf.rev}/${path}${line === undefined ? "" : `#${line}`}`;
}
