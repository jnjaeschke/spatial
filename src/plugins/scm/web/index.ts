import type { WebPlugin } from "../../../web/plugin-api.ts";
import { ScmSessionView, ScmView } from "./ScmView.tsx";

export const scmWeb: WebPlugin = {
  id: "scm",
  phaseViews: {},
  repoViews: [{ id: "scm", label: "Git", Body: ScmView }],
  sessionViews: [{ id: "scm", label: "Git", available: () => true, Body: ScmSessionView }],
};
