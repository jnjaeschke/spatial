import type { ReactElement } from "react";
import { ErrorText, useAction } from "../../../web/plugin-api.ts";
import { ENGINE_LABEL } from "../shared/engines.ts";
import type { EngineMapping } from "../shared/types.ts";
import type { TraceCodeRef } from "../shared/types.ts";
import { mappingStepSite } from "../shared/trace-check.ts";
import { specClient } from "./client.ts";
import { CodePeek } from "./CodePeek.tsx";

/** Verified code references of a trace step as engine links, each offering to add its step to that engine's mapping unless `readOnly`. */
export function TraceCodeLinks({ refs, sessionId, algorithmRef, step, mappings, readOnly }: { refs: (TraceCodeRef & { url: string })[]; sessionId: string; algorithmRef: string; step: string; mappings: Partial<Record<TraceCodeRef["engine"], Record<string, EngineMapping | null>>>; readOnly: boolean }): ReactElement | null {
  if (!refs.length) return null;
  return <span className="trace-code-links">{refs.map((ref, index) => <CodeLink key={`${ref.engine}:${ref.path}:${ref.line}:${index}`} code={ref} sessionId={sessionId} algorithmRef={algorithmRef} step={step} mapping={readOnly ? null : mappings[ref.engine]?.[algorithmRef] ?? null} />)}</span>;
}

function CodeLink({ code, sessionId, algorithmRef, step, mapping }: { code: TraceCodeRef & { url: string }; sessionId: string; algorithmRef: string; step: string; mapping: EngineMapping | null }) {
  const action = useAction();
  const offer = mapping !== null && mappingStepSite(mapping, code, step) !== null;
  return <><CodePeek sessionId={sessionId} engine={code.engine} path={code.path} line={code.line} quote={code.quote} note="Cited by the trace."><a className={`spec-g-link engine-${code.engine}`} href={code.url} target="_blank" rel="noreferrer" aria-label={`${ENGINE_LABEL[code.engine]} source ${code.path}:${code.line}`} data-testid={`trace-code-${code.engine}`}>{ENGINE_LABEL[code.engine]}</a></CodePeek>{offer && <><button type="button" className="link-button" data-testid={`add-mapping-${code.engine}`} disabled={action.busy} onClick={() => void action.run(() => specClient.addMappingStep(sessionId, { ref: algorithmRef, step, code }))}>Add to {ENGINE_LABEL[code.engine]} mapping</button><ErrorText error={action.error} /></>}</>;
}
