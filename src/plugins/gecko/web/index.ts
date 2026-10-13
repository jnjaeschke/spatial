import "./styles.css";
import type { WebPlugin } from "../../../web/plugin-api.ts";
import { TryProposalView, TryView } from "./TryViews.tsx";
import { PhabSubmitView, SubmitView } from "./SubmitViews.tsx";
import { SearchfoxProvider } from "./SearchfoxProvider.tsx";

export const geckoWeb: WebPlugin = { id: "gecko", phaseViews: { try: { Body: TryProposalView }, tryPush: { Body: TryView }, submit: { Body: SubmitView }, phabSubmit: { Body: PhabSubmitView } }, sessionProviders: [SearchfoxProvider] };
