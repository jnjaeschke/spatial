import { repoName, type PhaseViewProps, type RepoViewProps } from "../../../web/plugin-api.ts";
import { GraphView } from "./GraphView.tsx";

/** The Git page of a repository. */
export function ScmView({ worktree }: RepoViewProps) {
  return <GraphView worktree={worktree} />;
}

/** The Git view inside a session: the session's work tree. */
export function ScmSessionView({ state }: PhaseViewProps) {
  return <ScmView worktree={state.session.worktree} repoDir={state.session.repoDir} name={repoName(state.session.repoDir)} />;
}
