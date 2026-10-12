import { createContext } from "react";
import type { TextLink } from "../shared/types.ts";

/** The session's rules for linking text such as bug references. */
export const TextLinksContext = createContext<TextLink[]>([]);
