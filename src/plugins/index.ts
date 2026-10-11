import type { Plugin } from "../plugin-api.ts";
import { reviewPlugin } from "./review/index.ts";
import { chatPlugin } from "./chat/index.ts";
import { geckoPlugin } from "./gecko/index.ts";
import { implementPlugin } from "./implement/index.ts";
import { specPlugin } from "./spec/index.ts";

export const plugins: Plugin[] = [reviewPlugin, chatPlugin, geckoPlugin, implementPlugin, specPlugin];
