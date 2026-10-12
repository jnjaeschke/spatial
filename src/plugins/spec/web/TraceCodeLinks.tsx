import type { ReactElement } from "react";
import type { TraceCodeRef } from "../shared/types.ts";

const LETTER = { gecko: "G", blink: "B", webkit: "W" } as const;
/** Verified code references of a trace step as engine links. */
export function TraceCodeLinks({ refs }: { refs: (TraceCodeRef & { url: string })[] }): ReactElement | null {
  if (!refs.length) return null;
  return <span className="trace-code-links">{refs.map((ref, index) => <a key={`${ref.engine}:${ref.path}:${ref.line}:${index}`} className={`spec-g-link engine-${ref.engine}`} href={ref.url} target="_blank" rel="noreferrer" aria-label={`${ref.engine} source ${ref.path}:${ref.line}`} title={`${ref.path}:${ref.line}`} data-testid={`trace-code-${ref.engine}`}>{LETTER[ref.engine]}</a>)}</span>;
}
