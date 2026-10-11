import { createContext } from "react";
import type { Artifact, DiagramData, SequenceStep } from "../shared/types.ts";

/** Click-through of diagram steps: a handler that shows where a step happens, or null when the step has no target. Provided by canvases that can show the cited code. */
export const DiagramStepContext = createContext<{ onStep(diagram: Artifact<DiagramData>, step: SequenceStep): (() => void) | null } | null>(null);
