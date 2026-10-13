/** Browser-safe parts of the review plugin that dependent plugins may use from code that also runs in the web bundle. */
export { latestByPhid } from "../shared/phab-comments.ts";
export type { PhabCommentData, PatchNarrativeData, SemanticChange, ChangeStatus, PostedCommentData } from "../shared/types.ts";
