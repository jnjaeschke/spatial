import { createContext } from "react";

/** What a box's title needs to offer the Open button: whether the node opens a place, and opening it. */
export const OpenPlaceContext = createContext<{ can(nodeId: string): boolean; open(nodeId: string): void } | null>(null);
