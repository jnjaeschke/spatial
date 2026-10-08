import type { Plugin } from "../plugin-api.ts";
import { reviewPlugin } from "./review/index.ts";
import { chatPlugin } from "./chat/index.ts";

export const plugins: Plugin[] = [reviewPlugin, chatPlugin];
