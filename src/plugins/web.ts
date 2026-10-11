import type { ComponentType } from "react";
import type { ReplyActionProps, WebPlugin } from "../web/plugin-api.ts";
import { chatWeb } from "./chat/web/index.ts";
import { reviewWeb } from "./review/web/index.ts";
import { implementWeb } from "./implement/web/index.ts";
import { geckoWeb } from "./gecko/web/index.ts";
import { coreNodeKinds } from "../web/canvas-kinds.ts";
import { specWeb } from "./spec/web/index.ts";

export const webPlugins: WebPlugin[] = [reviewWeb, chatWeb, implementWeb, geckoWeb, specWeb];
export const webNodeKinds = Object.assign({}, coreNodeKinds, ...webPlugins.map((plugin) => plugin.nodeKinds ?? {}));
export const webReplyActions: Record<string, ComponentType<ReplyActionProps>> = Object.assign({}, ...webPlugins.map((plugin) => plugin.replyActions ?? {}));
