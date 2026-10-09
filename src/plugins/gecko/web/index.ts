import type { WebPlugin } from "../../../web/plugin-api.ts";
import { TryProposalView, TryView } from "./TryViews.tsx";

export const geckoWeb: WebPlugin = { id: "gecko", phaseViews: { try: { Body: TryProposalView }, tryPush: { Body: TryView } } };
