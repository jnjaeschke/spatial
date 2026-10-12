import type { Engine } from "./types.ts";

/** The browser engines code search covers, in display order. */
export const ENGINES: readonly Engine[] = ["gecko", "blink", "webkit"];
/** An engine's display name. */
export const ENGINE_LABEL: Readonly<Record<Engine, string>> = { gecko: "Gecko", blink: "Blink", webkit: "WebKit" };
