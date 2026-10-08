import type { WebPlugin } from "../web/plugin-api.ts";
import { chatWeb } from "./chat/web/index.ts";
import { reviewWeb } from "./review/web/index.ts";

export const webPlugins: WebPlugin[] = [reviewWeb, chatWeb];
