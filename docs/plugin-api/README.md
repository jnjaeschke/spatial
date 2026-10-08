[**spatial-ide**](../README.md)

***

[spatial-ide](../README.md) / plugin-api

# plugin-api

Plugins package workflows, phases, tasks, artifact kinds and optional server services.
A workflow starts phases; each phase run is stored as an epoch, and its tasks and artifacts inherit that epoch.
Artifact kinds teach core how to search and render plugin artifacts without importing plugin code.
Plugin code should import core contracts from this module and otherwise stay inside its plugin directory.
Standard plugins live in `src/plugins/` and are registered in `src/plugins/index.ts`.

## Functions

- [definePlugin](functions/definePlugin.md)

## References

### Actor

Re-exports [Actor](../shared/types/type-aliases/Actor.md)

***

### Artifact

Re-exports [Artifact](../shared/types/interfaces/Artifact.md)

***

### ArtifactKind

Re-exports [ArtifactKind](../runtime/plugins/interfaces/ArtifactKind.md)

***

### ArtifactStatus

Re-exports [ArtifactStatus](../shared/types/type-aliases/ArtifactStatus.md)

***

### BackendModels

Re-exports [BackendModels](../shared/types/type-aliases/BackendModels.md)

***

### BlameEntry

Re-exports [BlameEntry](../runtime/tasks/interfaces/BlameEntry.md)

***

### ChangeReviewData

Re-exports [ChangeReviewData](../shared/types/interfaces/ChangeReviewData.md)

***

### ChangeStatus

Re-exports [ChangeStatus](../shared/types/type-aliases/ChangeStatus.md)

***

### ChatMessageData

Re-exports [ChatMessageData](../shared/types/interfaces/ChatMessageData.md)

***

### ChatReplyField

Re-exports [ChatReplyField](../runtime/plugins/interfaces/ChatReplyField.md)

***

### ChatThreadData

Re-exports [ChatThreadData](../shared/types/interfaces/ChatThreadData.md)

***

### Commit

Re-exports [Commit](../shared/types/interfaces/Commit.md)

***

### defineTask

Re-exports [defineTask](../runtime/tasks/functions/defineTask.md)

***

### DiagramCite

Re-exports [DiagramCite](../shared/types/interfaces/DiagramCite.md)

***

### DiagramData

Re-exports [DiagramData](../shared/types/interfaces/DiagramData.md)

***

### DiffData

Re-exports [DiffData](../shared/types/interfaces/DiffData.md)

***

### DiffFile

Re-exports [DiffFile](../shared/types/interfaces/DiffFile.md)

***

### DiffLine

Re-exports [DiffLine](../shared/types/interfaces/DiffLine.md)

***

### DirectoryListing

Re-exports [DirectoryListing](../shared/types/interfaces/DirectoryListing.md)

***

### Epoch

Re-exports [Epoch](../shared/types/interfaces/Epoch.md)

***

### EpochStatus

Re-exports [EpochStatus](../shared/types/type-aliases/EpochStatus.md)

***

### FileStatus

Re-exports [FileStatus](../shared/types/type-aliases/FileStatus.md)

***

### FindingCarryData

Re-exports [FindingCarryData](../shared/types/interfaces/FindingCarryData.md)

***

### FindingDecisionData

Re-exports [FindingDecisionData](../shared/types/interfaces/FindingDecisionData.md)

***

### FindingVerdictData

Re-exports [FindingVerdictData](../shared/types/interfaces/FindingVerdictData.md)

***

### FindingVerdictValue

Re-exports [FindingVerdictValue](../shared/types/type-aliases/FindingVerdictValue.md)

***

### GeckoSpecRef

Re-exports [GeckoSpecRef](../shared/types/interfaces/GeckoSpecRef.md)

***

### GitCapability

Re-exports [GitCapability](../runtime/tasks/interfaces/GitCapability.md)

***

### HealthResponse

Re-exports [HealthResponse](../shared/types/interfaces/HealthResponse.md)

***

### HttpError

Re-exports [HttpError](../server/http/classes/HttpError.md)

***

### HttpRouteContext

Re-exports [HttpRouteContext](../server/http/type-aliases/HttpRouteContext.md)

***

### Hunk

Re-exports [Hunk](../shared/types/interfaces/Hunk.md)

***

### Id

Re-exports [Id](../shared/types/type-aliases/Id.md)

***

### InterdiffData

Re-exports [InterdiffData](../shared/types/interfaces/InterdiffData.md)

***

### LineRange

Re-exports [LineRange](../shared/types/interfaces/LineRange.md)

***

### Link

Re-exports [Link](../shared/types/interfaces/Link.md)

***

### LinkKind

Re-exports [LinkKind](../shared/types/type-aliases/LinkKind.md)

***

### LlmBackendId

Re-exports [LlmBackendId](../shared/types/type-aliases/LlmBackendId.md)

***

### LlmSelection

Re-exports [LlmSelection](../shared/types/interfaces/LlmSelection.md)

***

### McpServerData

Re-exports [McpServerData](../shared/types/interfaces/McpServerData.md)

***

### ModelInfo

Re-exports [ModelInfo](../shared/types/interfaces/ModelInfo.md)

***

### ModelsResponse

Re-exports [ModelsResponse](../shared/types/interfaces/ModelsResponse.md)

***

### NoteData

Re-exports [NoteData](../shared/types/interfaces/NoteData.md)

***

### NotifyPayload

Re-exports [NotifyPayload](../shared/types/interfaces/NotifyPayload.md)

***

### ParseResult

Re-exports [ParseResult](../runtime/plugins/type-aliases/ParseResult.md)

***

### PatchNarrativeData

Re-exports [PatchNarrativeData](../shared/types/interfaces/PatchNarrativeData.md)

***

### PhabCommentData

Re-exports [PhabCommentData](../shared/types/interfaces/PhabCommentData.md)

***

### PhabSyncData

Re-exports [PhabSyncData](../shared/types/interfaces/PhabSyncData.md)

***

### Phase

Re-exports [Phase](../runtime/tasks/interfaces/Phase.md)

***

### PhaseBusyError

Re-exports [PhaseBusyError](../runtime/tasks/classes/PhaseBusyError.md)

***

### Plugin

Re-exports [Plugin](../runtime/plugins/interfaces/Plugin.md)

***

### PluginRegistry

Re-exports [PluginRegistry](../runtime/plugins/interfaces/PluginRegistry.md)

***

### PluginServer

Re-exports [PluginServer](../runtime/plugins/interfaces/PluginServer.md)

***

### PostedCommentData

Re-exports [PostedCommentData](../shared/types/interfaces/PostedCommentData.md)

***

### Progress

Re-exports [Progress](../shared/types/type-aliases/Progress.md)

***

### Provenance

Re-exports [Provenance](../shared/types/interfaces/Provenance.md)

***

### putUserArtifact

Re-exports [putUserArtifact](../server/http/functions/putUserArtifact.md)

***

### readJson

Re-exports [readJson](../server/http/functions/readJson.md)

***

### RecentRepo

Re-exports [RecentRepo](../shared/types/interfaces/RecentRepo.md)

***

### Ref

Re-exports [Ref](../shared/types/type-aliases/Ref.md)

***

### RepoInfo

Re-exports [RepoInfo](../shared/types/interfaces/RepoInfo.md)

***

### requireArtifact

Re-exports [requireArtifact](../server/http/functions/requireArtifact.md)

***

### requireSession

Re-exports [requireSession](../server/http/functions/requireSession.md)

***

### ResolvedSpec

Re-exports [ResolvedSpec](../shared/types/interfaces/ResolvedSpec.md)

***

### ReviewCommentData

Re-exports [ReviewCommentData](../shared/types/interfaces/ReviewCommentData.md)

***

### ReviewFindingData

Re-exports [ReviewFindingData](../shared/types/interfaces/ReviewFindingData.md)

***

### RevisionData

Re-exports [RevisionData](../shared/types/interfaces/RevisionData.md)

***

### Rewrite

Re-exports [Rewrite](../shared/types/interfaces/Rewrite.md)

***

### Route

Re-exports [Route](../server/http/type-aliases/Route.md)

***

### Runtime

Re-exports [Runtime](../runtime/tasks/classes/Runtime.md)

***

### RuntimeEvent

Re-exports [RuntimeEvent](../shared/types/interfaces/RuntimeEvent.md)

***

### SearchDoc

Re-exports [SearchDoc](../runtime/render-ref/interfaces/SearchDoc.md)

***

### SearchfoxCapability

Re-exports [SearchfoxCapability](../runtime/tasks/interfaces/SearchfoxCapability.md)

***

### SelectorAnswerData

Re-exports [SelectorAnswerData](../shared/types/interfaces/SelectorAnswerData.md)

***

### SelectorQuestionData

Re-exports [SelectorQuestionData](../shared/types/interfaces/SelectorQuestionData.md)

***

### SemanticChange

Re-exports [SemanticChange](../shared/types/interfaces/SemanticChange.md)

***

### send

Re-exports [send](../server/http/functions/send.md)

***

### SequenceLane

Re-exports [SequenceLane](../shared/types/interfaces/SequenceLane.md)

***

### SequenceStatus

Re-exports [SequenceStatus](../shared/types/type-aliases/SequenceStatus.md)

***

### SequenceStep

Re-exports [SequenceStep](../shared/types/interfaces/SequenceStep.md)

***

### Session

Re-exports [Session](../shared/types/interfaces/Session.md)

***

### SessionState

Re-exports [SessionState](../shared/types/interfaces/SessionState.md)

***

### SessionView

Re-exports [SessionView](../runtime/render-ref/interfaces/SessionView.md)

***

### SpecReferenceData

Re-exports [SpecReferenceData](../shared/types/interfaces/SpecReferenceData.md)

***

### SpecStepMapData

Re-exports [SpecStepMapData](../shared/types/interfaces/SpecStepMapData.md)

***

### StartInput

Re-exports [StartInput](../runtime/plugins/interfaces/StartInput.md)

***

### StepCommentCheck

Re-exports [StepCommentCheck](../runtime/tasks/interfaces/StepCommentCheck.md)

***

### StepLink

Re-exports [StepLink](../shared/types/interfaces/StepLink.md)

***

### StepLinkKind

Re-exports [StepLinkKind](../shared/types/type-aliases/StepLinkKind.md)

***

### str

Re-exports [str](../server/http/functions/str.md)

***

### TaskContext

Re-exports [TaskContext](../runtime/tasks/interfaces/TaskContext.md)

***

### TaskDefinition

Re-exports [TaskDefinition](../runtime/tasks/interfaces/TaskDefinition.md)

***

### TaskRecord

Re-exports [TaskRecord](../shared/types/interfaces/TaskRecord.md)

***

### TaskStatus

Re-exports [TaskStatus](../shared/types/type-aliases/TaskStatus.md)

***

### UnmappedLines

Re-exports [UnmappedLines](../shared/types/interfaces/UnmappedLines.md)

***

### UnmappedReason

Re-exports [UnmappedReason](../shared/types/type-aliases/UnmappedReason.md)

***

### WebspecCapability

Re-exports [WebspecCapability](../runtime/tasks/interfaces/WebspecCapability.md)

***

### Workflow

Re-exports [Workflow](../runtime/plugins/interfaces/Workflow.md)

***

### WorkflowId

Re-exports [WorkflowId](../shared/types/type-aliases/WorkflowId.md)

***

### WorkflowInfo

Re-exports [WorkflowInfo](../shared/types/interfaces/WorkflowInfo.md)

***

### WorkflowStartData

Re-exports [WorkflowStartData](../shared/types/interfaces/WorkflowStartData.md)
