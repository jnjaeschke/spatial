import { createContext } from "react";
import type { Commit } from "../../../web/plugin-api.ts";

export const StackContext = createContext<Commit[] | null>(null);
