import { createContext } from "react";
import type { Commit } from "../../shared/types.ts";

export const StackContext = createContext<Commit[] | null>(null);
