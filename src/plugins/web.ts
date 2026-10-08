import type { WebPlugin } from "../web/plugin-api.ts";
import { chatWeb } from "./chat/web/index.ts";
import { reviewWeb } from "./review/web/index.ts";
import { implementWeb } from "./implement/web/index.ts";
import { coreNodeKinds } from "../web/canvas-kinds.ts";

export const webPlugins: WebPlugin[] = [reviewWeb, chatWeb, implementWeb];
export const webNodeKinds = Object.assign({}, coreNodeKinds, ...webPlugins.map((plugin) => plugin.nodeKinds ?? {}));
