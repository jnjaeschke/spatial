[**spatial**](../../README.md)

***

[spatial](../../README.md) / web/plugin-api

# web/plugin-api

## Classes

- [RequestError](classes/RequestError.md)
- [RowPainter](classes/RowPainter.md)

## Interfaces

- [ActivityLogTarget](interfaces/ActivityLogTarget.md)
- [BoxProps](interfaces/BoxProps.md)
- [CanvasModel](interfaces/CanvasModel.md)
- [CanvasProps](interfaces/CanvasProps.md)
- [CanvasProviderProps](interfaces/CanvasProviderProps.md)
- [ChatActions](interfaces/ChatActions.md)
- [ChatNodeData](interfaces/ChatNodeData.md)
- [ClosedItem](interfaces/ClosedItem.md)
- [CodeRow](interfaces/CodeRow.md)
- [ComposerProps](interfaces/ComposerProps.md)
- [ConversationItemProps](interfaces/ConversationItemProps.md)
- [ConversationNodeData](interfaces/ConversationNodeData.md)
- [Draft](interfaces/Draft.md)
- [ExportDiff](interfaces/ExportDiff.md)
- [FileViewRequest](interfaces/FileViewRequest.md)
- [FocusedRow](interfaces/FocusedRow.md)
- [FreePosition](interfaces/FreePosition.md)
- [GraphEdge](interfaces/GraphEdge.md)
- [GraphNode](interfaces/GraphNode.md)
- [GuideStep](interfaces/GuideStep.md)
- [HunkRow](interfaces/HunkRow.md)
- [MarkdownRenderers](interfaces/MarkdownRenderers.md)
- [NodeKind](interfaces/NodeKind.md)
- [NoteNodeData](interfaces/NoteNodeData.md)
- [PhaseView](interfaces/PhaseView.md)
- [PhaseViewProps](interfaces/PhaseViewProps.md)
- [PlacedNode](interfaces/PlacedNode.md)
- [PluginRepoView](interfaces/PluginRepoView.md)
- [PluginSessionView](interfaces/PluginSessionView.md)
- [ReplyActionProps](interfaces/ReplyActionProps.md)
- [RepoPanelProps](interfaces/RepoPanelProps.md)
- [RepoViewProps](interfaces/RepoViewProps.md)
- [RootGraphParts](interfaces/RootGraphParts.md)
- [RowMark](interfaces/RowMark.md)
- [SearchfoxLinks](interfaces/SearchfoxLinks.md)
- [Segment](interfaces/Segment.md)
- [SequenceArrow](interfaces/SequenceArrow.md)
- [WebPlugin](interfaces/WebPlugin.md)

## Type Aliases

- [ConversationProps](type-aliases/ConversationProps.md)
- [CoreNodeData](type-aliases/CoreNodeData.md)
- [DiagramNodeData](type-aliases/DiagramNodeData.md)
- [Graph](type-aliases/Graph.md)
- [GraphNodeData](type-aliases/GraphNodeData.md)
- [HostedThread](type-aliases/HostedThread.md)
- [InlineState](type-aliases/InlineState.md)
- [InlineStates](type-aliases/InlineStates.md)
- [NodeProps](type-aliases/NodeProps.md)
- [PluginNodeData](type-aliases/PluginNodeData.md)
- [SelectionData](type-aliases/SelectionData.md)

## Variables

- [api](variables/api.md)
- [AskContext](variables/AskContext.md)
- [ChatActionsContext](variables/ChatActionsContext.md)
- [ClosedContext](variables/ClosedContext.md)
- [CollapseContext](variables/CollapseContext.md)
- [COMPOSER\_HINT](variables/COMPOSER_HINT.md)
- [DiagramStepContext](variables/DiagramStepContext.md)
- [draftTexts](variables/draftTexts.md)
- [FileViewContext](variables/FileViewContext.md)
- [InlineStatesContext](variables/InlineStatesContext.md)
- [NODE\_WIDTH](variables/NODE_WIDTH.md)
- [NodeKindsContext](variables/NodeKindsContext.md)
- [OpenActivityLogContext](variables/OpenActivityLogContext.md)
- [SATELLITE\_WIDTH](variables/SATELLITE_WIDTH.md)
- [SearchfoxContext](variables/SearchfoxContext.md)
- [StackContext](variables/StackContext.md)
- [TopbarSlot](variables/TopbarSlot.md)

## Functions

- [addChats](functions/addChats.md)
- [addNotes](functions/addNotes.md)
- [AnswerMarkdown](functions/AnswerMarkdown.md)
- [Box](functions/Box.md)
- [Canvas](functions/Canvas.md)
- [cascade](functions/cascade.md)
- [changeStarts](functions/changeStarts.md)
- [ChatBody](functions/ChatBody.md)
- [ChatItem](functions/ChatItem.md)
- [closeChat](functions/closeChat.md)
- [commitColors](functions/commitColors.md)
- [commitLabel](functions/commitLabel.md)
- [Composer](functions/Composer.md)
- [composerKey](functions/composerKey.md)
- [Conversation](functions/Conversation.md)
- [conversationGraph](functions/conversationGraph.md)
- [conversationNode](functions/conversationNode.md)
- [delJson](functions/delJson.md)
- [diagramsByMessage](functions/diagramsByMessage.md)
- [diagramSize](functions/diagramSize.md)
- [Dialog](functions/Dialog.md)
- [DiffRows](functions/DiffRows.md)
- [DiffView](functions/DiffView.md)
- [ErrorText](functions/ErrorText.md)
- [FileDiff](functions/FileDiff.md)
- [FilePanel](functions/FilePanel.md)
- [fileUrl](functions/fileUrl.md)
- [getJson](functions/getJson.md)
- [HoverCard](functions/HoverCard.md)
- [IconButton](functions/IconButton.md)
- [InlineItem](functions/InlineItem.md)
- [InlineText](functions/InlineText.md)
- [isCoreKind](functions/isCoreKind.md)
- [isSatellite](functions/isSatellite.md)
- [latestStart](functions/latestStart.md)
- [layout](functions/layout.md)
- [lines](functions/lines.md)
- [linkTitle](functions/linkTitle.md)
- [loadFileLines](functions/loadFileLines.md)
- [Markdown](functions/Markdown.md)
- [mergedCodeLinks](functions/mergedCodeLinks.md)
- [placeSatellites](functions/placeSatellites.md)
- [postJson](functions/postJson.md)
- [promiseCache](functions/promiseCache.md)
- [putJson](functions/putJson.md)
- [rootGraph](functions/rootGraph.md)
- [rootThread](functions/rootThread.md)
- [rowSegments](functions/rowSegments.md)
- [searchfoxLinks](functions/searchfoxLinks.md)
- [Segmented](functions/Segmented.md)
- [SequenceDiagram](functions/SequenceDiagram.md)
- [SidePanel](functions/SidePanel.md)
- [subgraph](functions/subgraph.md)
- [TaskControls](functions/TaskControls.md)
- [threadContent](functions/threadContent.md)
- [TopbarExtras](functions/TopbarExtras.md)
- [useAction](functions/useAction.md)
- [useClosed](functions/useClosed.md)
- [useDraftInlineStates](functions/useDraftInlineStates.md)
- [useDraftText](functions/useDraftText.md)
- [useHoverCard](functions/useHoverCard.md)
- [useInlineState](functions/useInlineState.md)
- [useInlineStates](functions/useInlineStates.md)
- [useUrlParam](functions/useUrlParam.md)

## References

### Actor

Re-exports [Actor](../../shared/types/type-aliases/Actor.md)

***

### Artifact

Re-exports [Artifact](../../shared/types/interfaces/Artifact.md)

***

### ArtifactStatus

Re-exports [ArtifactStatus](../../shared/types/type-aliases/ArtifactStatus.md)

***

### BackendModels

Re-exports [BackendModels](../../shared/types/type-aliases/BackendModels.md)

***

### ChatMessageData

Re-exports [ChatMessageData](../../shared/types/interfaces/ChatMessageData.md)

***

### ChatThreadData

Re-exports [ChatThreadData](../../shared/types/interfaces/ChatThreadData.md)

***

### CodeLinksData

Re-exports [CodeLinksData](../../shared/types/interfaces/CodeLinksData.md)

***

### CommandRunData

Re-exports [CommandRunData](../../shared/types/interfaces/CommandRunData.md)

***

### Commit

Re-exports [Commit](../../shared/types/interfaces/Commit.md)

***

### CommitDetail

Re-exports [CommitDetail](../../shared/types/interfaces/CommitDetail.md)

***

### CommitFileStat

Re-exports [CommitFileStat](../../shared/types/interfaces/CommitFileStat.md)

***

### DecisionData

Re-exports [DecisionData](../../shared/types/interfaces/DecisionData.md)

***

### DecisionOption

Re-exports [DecisionOption](../../shared/types/interfaces/DecisionOption.md)

***

### DiagramCite

Re-exports [DiagramCite](../../shared/types/interfaces/DiagramCite.md)

***

### DiagramData

Re-exports [DiagramData](../../shared/types/interfaces/DiagramData.md)

***

### DiffData

Re-exports [DiffData](../../shared/types/interfaces/DiffData.md)

***

### DiffFile

Re-exports [DiffFile](../../shared/types/interfaces/DiffFile.md)

***

### DiffLine

Re-exports [DiffLine](../../shared/types/interfaces/DiffLine.md)

***

### DirectoryListing

Re-exports [DirectoryListing](../../shared/types/interfaces/DirectoryListing.md)

***

### Epoch

Re-exports [Epoch](../../shared/types/interfaces/Epoch.md)

***

### EpochStatus

Re-exports [EpochStatus](../../shared/types/type-aliases/EpochStatus.md)

***

### escapeRegex

Re-exports [escapeRegex](../../plugin-api/functions/escapeRegex.md)

***

### fileRows

Re-exports [fileRows](../../plugin-api/functions/fileRows.md)

***

### FileStatus

Re-exports [FileStatus](../../shared/types/type-aliases/FileStatus.md)

***

### HealthResponse

Re-exports [HealthResponse](../../shared/types/interfaces/HealthResponse.md)

***

### Hunk

Re-exports [Hunk](../../shared/types/interfaces/Hunk.md)

***

### Id

Re-exports [Id](../../shared/types/type-aliases/Id.md)

***

### isActive

Re-exports [isActive](../../plugin-api/functions/isActive.md)

***

### latestArtifact

Re-exports [latestArtifact](../../plugin-api/functions/latestArtifact.md)

***

### Link

Re-exports [Link](../../shared/types/interfaces/Link.md)

***

### LinkKind

Re-exports [LinkKind](../../shared/types/type-aliases/LinkKind.md)

***

### LlmActivity

Re-exports [LlmActivity](../../shared/types/type-aliases/LlmActivity.md)

***

### LlmBackendId

Re-exports [LlmBackendId](../../shared/types/type-aliases/LlmBackendId.md)

***

### LlmSelection

Re-exports [LlmSelection](../../shared/types/interfaces/LlmSelection.md)

***

### LogRow

Re-exports [LogRow](../../shared/types/interfaces/LogRow.md)

***

### LogScope

Re-exports [LogScope](../../shared/types/type-aliases/LogScope.md)

***

### McpServerData

Re-exports [McpServerData](../../shared/types/interfaces/McpServerData.md)

***

### ModelInfo

Re-exports [ModelInfo](../../shared/types/interfaces/ModelInfo.md)

***

### ModelsResponse

Re-exports [ModelsResponse](../../shared/types/interfaces/ModelsResponse.md)

***

### NoteData

Re-exports [NoteData](../../shared/types/interfaces/NoteData.md)

***

### NotifyPayload

Re-exports [NotifyPayload](../../shared/types/interfaces/NotifyPayload.md)

***

### numberLines

Re-exports [numberLines](../../plugin-api/functions/numberLines.md)

***

### plainText

Re-exports [plainText](../../plugin-api/functions/plainText.md)

***

### plural

Re-exports [plural](../../plugin-api/functions/plural.md)

***

### Progress

Re-exports [Progress](../../shared/types/type-aliases/Progress.md)

***

### Provenance

Re-exports [Provenance](../../shared/types/interfaces/Provenance.md)

***

### RecentRepo

Re-exports [RecentRepo](../../shared/types/interfaces/RecentRepo.md)

***

### Ref

Re-exports [Ref](../../shared/types/type-aliases/Ref.md)

***

### RefRow

Re-exports [RefRow](../../shared/types/interfaces/RefRow.md)

***

### RepoInfo

Re-exports [RepoInfo](../../shared/types/interfaces/RepoInfo.md)

***

### repoName

Re-exports [repoName](../../shared/repos/functions/repoName.md)

***

### RevisionData

Re-exports [RevisionData](../../shared/types/interfaces/RevisionData.md)

***

### Rewrite

Re-exports [Rewrite](../../shared/types/interfaces/Rewrite.md)

***

### routeUrl

Re-exports [routeUrl](../routes/functions/routeUrl.md)

***

### Row

Re-exports [Row](../../plugin-api/type-aliases/Row.md)

***

### RuntimeEvent

Re-exports [RuntimeEvent](../../shared/types/interfaces/RuntimeEvent.md)

***

### SequenceLane

Re-exports [SequenceLane](../../shared/types/interfaces/SequenceLane.md)

***

### sequenceLayout

Re-exports [sequenceLayout](../sequence-layout/functions/sequenceLayout.md)

***

### SequenceStatus

Re-exports [SequenceStatus](../../shared/types/type-aliases/SequenceStatus.md)

***

### SequenceStep

Re-exports [SequenceStep](../../shared/types/interfaces/SequenceStep.md)

***

### Session

Re-exports [Session](../../shared/types/interfaces/Session.md)

***

### SessionListing

Re-exports [SessionListing](../../shared/types/interfaces/SessionListing.md)

***

### SessionState

Re-exports [SessionState](../../shared/types/interfaces/SessionState.md)

***

### showSessionView

Re-exports [showSessionView](../routes/functions/showSessionView.md)

***

### StartQuestion

Re-exports [StartQuestion](../../shared/types/interfaces/StartQuestion.md)

***

### TaskActivityResponse

Re-exports [TaskActivityResponse](../../shared/types/interfaces/TaskActivityResponse.md)

***

### TaskRecord

Re-exports [TaskRecord](../../shared/types/interfaces/TaskRecord.md)

***

### taskState

Re-exports [taskState](../../plugin-api/functions/taskState.md)

***

### TaskStatus

Re-exports [TaskStatus](../../shared/types/type-aliases/TaskStatus.md)

***

### TextLink

Re-exports [TextLink](../../shared/types/interfaces/TextLink.md)

***

### UsageRun

Re-exports [UsageRun](../../shared/types/interfaces/UsageRun.md)

***

### WorkflowId

Re-exports [WorkflowId](../../shared/types/type-aliases/WorkflowId.md)

***

### WorkflowInfo

Re-exports [WorkflowInfo](../../shared/types/interfaces/WorkflowInfo.md)

***

### WorkflowStartData

Re-exports [WorkflowStartData](../../shared/types/interfaces/WorkflowStartData.md)

***

### WriteMode

Re-exports [WriteMode](../../shared/types/type-aliases/WriteMode.md)
