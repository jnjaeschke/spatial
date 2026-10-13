import { postJson, putJson, type ChatThreadData, type LlmSelection } from "../../../web/plugin-api.ts";

/** HTTP calls owned by the review plugin. */
export const reviewClient = {
  narrate: (id: string, body: { llm: LlmSelection }) => postJson<{}>(`/api/sessions/${id}/narrate`, body),
  narrateRound: (sessionId: string, diffId: string, llm: LlmSelection) => postJson<{}>(`/api/sessions/${sessionId}/rounds/${diffId}/narrate`, { llm }),
  setReviewed: (sessionId: string, narrativeId: string, changeId: string, reviewed: boolean) =>
    postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/narratives/${narrativeId}/changes/${changeId}/reviewed`, { reviewed }),
  saveComment: (sessionId: string, findingId: string, body: string) => putJson<{ artifactId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/comment`, { body }),
  createComment: (sessionId: string, diffId: string, lines: NonNullable<ChatThreadData["lines"]>, body: string, replyTo?: string) =>
    postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/comments`, { diffId, lines, body, replyTo }),
  editComment: (sessionId: string, stableId: string, body: string) => postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/comments/${stableId}`, { body }),
  deleteComment: (sessionId: string, stableId: string) => postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/comments/${stableId}`, { deleted: true }),
  saveReviewDraft: (sessionId: string, revision: number, body: string) => postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/review-draft`, { revision, body }),
  replyInGeneralComment: (sessionId: string, replyTo: string, body: string) => postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/review-draft/reply`, { replyTo, body }),
  draftPhabReply: (sessionId: string, anchorId: string, threadId: string, llm?: LlmSelection) => postJson<{ replyId: string; body: string }>(`/api/sessions/${sessionId}/phab-threads/${anchorId}/draft-reply`, { threadId, llm }),
  followSpecRef: (sessionId: string, ref: string) => postJson<{ specId: string }>(`/api/sessions/${sessionId}/spec-refs`, { ref }),
  mapSpecSteps: (sessionId: string, specId: string, llm: LlmSelection) => postJson<{ taskId: string }>(`/api/sessions/${sessionId}/specs/${specId}/map`, { llm }),
  regenerateComment: (sessionId: string, findingId: string, llm?: LlmSelection) => postJson<{ taskId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/comment/regenerate`, { llm }),
  submitReview: (sessionId: string, body: { revision: number; action: "comment" | "accept" | "request-changes"; body: string }) => postJson<{ inlines: number; skipped: { source: string; reason: string }[]; revision: string }>(`/api/sessions/${sessionId}/review-submit`, body),
  decideFinding: (sessionId: string, findingId: string, decision: "accepted" | "dismissed", llm?: LlmSelection) => postJson<{ artifactId: string }>(`/api/sessions/${sessionId}/findings/${findingId}/decide`, { decision, llm }),
};
