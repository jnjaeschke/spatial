import type { ReactElement } from "react";
import { ErrorText, useAction } from "../../../web/plugin-api.ts";
import type { EngineMapping } from "../shared/types.ts";
import type { TraceCodeRef } from "../shared/types.ts";
import { mappingStepSite } from "../shared/trace-check.ts";
import { specClient } from "./client.ts";

const LETTER = { gecko: "G", blink: "B", webkit: "W" } as const;
/** Verified code references of a trace step as engine links. */
export function TraceCodeLinks({ refs, sessionId, algorithmRef, step, mappings }: { refs: (TraceCodeRef & { url: string })[]; sessionId: string; algorithmRef: string; step: string; mappings: Partial<Record<TraceCodeRef["engine"], Record<string, EngineMapping | null>>> }): ReactElement | null {
  if (!refs.length) return null;
  return <span className="trace-code-links">{refs.map((ref, index) => <CodeLink key={`${ref.engine}:${ref.path}:${ref.line}:${index}`} code={ref} sessionId={sessionId} algorithmRef={algorithmRef} step={step} mapping={mappings[ref.engine]?.[algorithmRef] ?? null} />)}</span>;
}

function CodeLink({ code, sessionId, algorithmRef, step, mapping }: { code: TraceCodeRef & { url: string }; sessionId: string; algorithmRef: string; step: string; mapping: EngineMapping | null }) {
  const action = useAction();
  const offer = mapping !== null && mappingStepSite(mapping, code, step) !== null;
  return <><a className={`spec-g-link engine-${code.engine}`} href={code.url} target="_blank" rel="noreferrer" aria-label={`${code.engine} source ${code.path}:${code.line}`} title={`${code.path}:${code.line}`} data-testid={`trace-code-${code.engine}`}>{LETTER[code.engine]}</a>{offer && <><button type="button" className="link-button" data-testid={`add-mapping-${code.engine}`} disabled={action.busy} onClick={() => void action.run(() => specClient.addMappingStep(sessionId, { ref: algorithmRef, step, code }))}>Add to {code.engine[0]!.toUpperCase() + code.engine.slice(1)} mapping</button><ErrorText error={action.error} /></>}</>;
}
