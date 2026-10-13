[**spatial**](../README.md)

***

[spatial](../README.md) / plugin-api

# plugin-api

The server-side contract between core and plugins.

Core owns sessions, the artifact store, tasks, epochs, the LLM backends, chat and the HTTP shell.
Everything a user works on is a plugin; review and chat are the standard library in `src/plugins/`.

- A **plugin** (`Plugin`, built with `definePlugin`) bundles any of: workflows, phases, task
  definitions, artifact kinds, search kinds, chat context and reply fields, read-only session MCP tools (`Plugin.mcpTools`), data for the session snapshot (`Plugin.sessionState`), and a server part
  with HTTP routes and background services. Registered in `src/plugins/index.ts`.
- A **workflow** (`Workflow`) is what a user starts from the start screen or a slash command.
  It parses its arguments and runs phases. A workflow's optional `precheck` can ask the start box
  one question about the work tree before any session exists.
- A **phase** (`Phase`) is one step of a workflow. `Runtime.runPhase` runs it as a new
  **epoch**: a stored, numbered run of one phase in a session with its input, status and error.
  Tasks and artifacts created meanwhile carry that epoch. A failed or cancelled epoch reruns in
  place with `Runtime.retryPhase`. One phase runs per session at a time (`PhaseBusyError`).
- A **task** (`TaskDefinition`, built with `defineTask`) is a unit of work run by the runtime,
  usually one LLM call or one deterministic import, producing artifacts with provenance.
- A workflow with `next` is driven by decisions: `Runtime.advance` calls `next(view)` over the stored
  epochs and artifacts and either runs the returned phase or stores a **Decision** artifact (a question
  with options, answered by a rule or by the user through `POST /api/sessions/:id/decisions/:artifactId`),
  and repeats until `next` returns null (waiting for the user, or done). A failed epoch stops the loop;
  Retry reruns it and advances again.
  Before the workflow's `next`, `advance` asks the phase of the latest succeeded epoch for its own follow-up (`Phase.next`), so a phase can ask its own decisions and run its follow-up phases in any workflow.
- An **artifact kind** (`ArtifactKind`) tells core how to render, search and overview a
  plugin's artifact type without importing plugin code.
- A **repo profile** (`RepoProfile`, contributed through `Plugin.repoProfiles`) says how to work in a
  kind of repository: commit style, message rule, check and test commands, phases after Accept. Workflows
  pick one per session; any plugin can add one.
- The **knowledge store** (`Runtime.knowledge`, `Knowledge`) keeps plugin data across sessions in its own SQLite file (`knowledge.db` next to the session database): versioned entries by scope, namespace and key. A `null` value is a tombstone; nothing is deleted through any API. Tasks read it through `TaskContext.knowledge` (read-only); plugin runtime code writes.
- **Services** (`Plugin.services`, `Runtime.services`, `TaskContext.services`, `McpToolContext.services`): a plugin builds its capabilities (tool binaries) from the process environment once per process; the runtime and the session MCP server build them the same way, and `RuntimeOptions.services` overrides them per plugin id (tests). A plugin reads its own through a typed accessor such as `specServices`.

The web side of a plugin registers phase views and canvas node kinds through
`src/web/plugin-api.ts`, and builds canvas graphs from `src/web/graph-api.ts`; its registry is
`src/plugins/web.ts`. A web plugin may also offer **session views** (`WebPlugin.sessionViews`):
projections of the session shown instead of the phase view when chosen in the topbar; the choice
is in the URL (`?view=`). A web plugin may offer **repo views** (`WebPlugin.repoViews`): pages for a
repository outside any session at `/repo/<view>?path=`, linked from the repo page.
A canvas model (`CanvasModel`) may split its graph into named **places**
(`CanvasModel.places`): core owns the current place, its history entries, persistence, breadcrumb and
drill-in/out keys, and the model defines each place's graph, node representation and guide steps.
Zoom only scales the canvas. Core shows an Open button in the title bar of every node that opens a place
(`places.open`), and a breadcrumb bar above the canvas: the place crumbs, then a focus segment labelled by
`CanvasModel.focusLabel` for the focused diff row or the selected node. A model may add controls to the
canvas panel next to Expand all and Reset layout (`CanvasModel.PanelExtras`, rendered inside the model's `Provider`).
A model may add colored inline-item lines to minimap nodes with `CanvasModel.minimapMarks`.

Boundary, checked by `scripts/plugin-boundary.ts` in `npm run check`: plugin code imports only its own
directory and these API modules. A plugin may also import the public API of another plugin it lists in
`Plugin.dependsOn`: only `src/plugins/<dep>/api.ts` (server and shared code) and
`src/plugins/<dep>/web/api.ts` (web code), never deeper modules; the registry rejects a missing
dependency and a cycle. Core imports no plugin code except the two registries, and only from
composition roots.

## Interfaces

- [GitWriter](interfaces/GitWriter.md)
- [PatchIdentity](interfaces/PatchIdentity.md)

## Type Aliases

- [Row](type-aliases/Row.md)

## Variables

- [runGit](variables/runGit.md)

## Functions

- [chosenDecision](functions/chosenDecision.md)
- [commandRunData](functions/commandRunData.md)
- [createSession](functions/createSession.md)
- [definePlugin](functions/definePlugin.md)
- [escapeRegex](functions/escapeRegex.md)
- [fileRows](functions/fileRows.md)
- [isActive](functions/isActive.md)
- [latestArtifact](functions/latestArtifact.md)
- [makeGit](functions/makeGit.md)
- [makeGitWriter](functions/makeGitWriter.md)
- [numberLines](functions/numberLines.md)
- [plainText](functions/plainText.md)
- [plural](functions/plural.md)
- [resolveRepo](functions/resolveRepo.md)
- [revisedText](functions/revisedText.md)
- [runChecked](functions/runChecked.md)
- [runProcess](functions/runProcess.md)
- [safeRepoPath](functions/safeRepoPath.md)
- [safeRevision](functions/safeRevision.md)
- [sessionProfile](functions/sessionProfile.md)
- [startProfile](functions/startProfile.md)
- [taskState](functions/taskState.md)

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

### BusyError

Re-exports [BusyError](../runtime/tasks/classes/BusyError.md)

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

### CommandRunData

Re-exports [CommandRunData](../shared/types/interfaces/CommandRunData.md)

***

### Commit

Re-exports [Commit](../shared/types/interfaces/Commit.md)

***

### CommitDetail

Re-exports [CommitDetail](../shared/types/interfaces/CommitDetail.md)

***

### CommitFileStat

Re-exports [CommitFileStat](../shared/types/interfaces/CommitFileStat.md)

***

### DecisionData

Re-exports [DecisionData](../shared/types/interfaces/DecisionData.md)

***

### DecisionOption

Re-exports [DecisionOption](../shared/types/interfaces/DecisionOption.md)

***

### defineMcpTool

Re-exports [defineMcpTool](../runtime/plugins/functions/defineMcpTool.md)

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

### diagramSchema

Re-exports [diagramSchema](../runtime/diagram/variables/diagramSchema.md)

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

### isDiagram

Re-exports [isDiagram](../runtime/diagram/functions/isDiagram.md)

***

### JsonSchema

Re-exports [JsonSchema](../runtime/structured/interfaces/JsonSchema.md)

***

### Knowledge

Re-exports [Knowledge](../runtime/knowledge/interfaces/Knowledge.md)

***

### KnowledgeEntry

Re-exports [KnowledgeEntry](../runtime/knowledge/interfaces/KnowledgeEntry.md)

***

### KnowledgeProvenance

Re-exports [KnowledgeProvenance](../runtime/knowledge/type-aliases/KnowledgeProvenance.md)

***

### KnowledgeRead

Re-exports [KnowledgeRead](../runtime/knowledge/type-aliases/KnowledgeRead.md)

***

### Link

Re-exports [Link](../shared/types/interfaces/Link.md)

***

### LinkKind

Re-exports [LinkKind](../shared/types/type-aliases/LinkKind.md)

***

### LlmActivity

Re-exports [LlmActivity](../shared/types/type-aliases/LlmActivity.md)

***

### LlmBackendId

Re-exports [LlmBackendId](../shared/types/type-aliases/LlmBackendId.md)

***

### LlmEvent

Re-exports [LlmEvent](../runtime/llm/types/type-aliases/LlmEvent.md)

***

### llmField

Re-exports [llmField](../server/http/functions/llmField.md)

***

### LlmOutputError

Re-exports [LlmOutputError](../runtime/llm/types/classes/LlmOutputError.md)

***

### LlmPrompt

Re-exports [LlmPrompt](../runtime/llm/types/interfaces/LlmPrompt.md)

***

### LlmSelection

Re-exports [LlmSelection](../shared/types/interfaces/LlmSelection.md)

***

### loadSchema

Re-exports [loadSchema](../runtime/structured/functions/loadSchema.md)

***

### LogRow

Re-exports [LogRow](../shared/types/interfaces/LogRow.md)

***

### LogScope

Re-exports [LogScope](../shared/types/type-aliases/LogScope.md)

***

### McpServerData

Re-exports [McpServerData](../shared/types/interfaces/McpServerData.md)

***

### McpTool

Re-exports [McpTool](../runtime/plugins/interfaces/McpTool.md)

***

### McpToolContext

Re-exports [McpToolContext](../runtime/plugins/interfaces/McpToolContext.md)

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

### parseUnifiedDiff

Re-exports [parseUnifiedDiff](../runtime/diff-parse/functions/parseUnifiedDiff.md)

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

### PrecheckQuestion

Re-exports [PrecheckQuestion](../runtime/plugins/interfaces/PrecheckQuestion.md)

***

### prependRepoContext

Re-exports [prependRepoContext](../runtime/repo-context/functions/prependRepoContext.md)

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

### readRepoSkill

Re-exports [readRepoSkill](../runtime/repo-context/functions/readRepoSkill.md)

***

### RecentRepo

Re-exports [RecentRepo](../shared/types/interfaces/RecentRepo.md)

***

### Ref

Re-exports [Ref](../shared/types/type-aliases/Ref.md)

***

### RefRow

Re-exports [RefRow](../shared/types/interfaces/RefRow.md)

***

### RepoInfo

Re-exports [RepoInfo](../shared/types/interfaces/RepoInfo.md)

***

### RepoProfile

Re-exports [RepoProfile](../runtime/plugins/interfaces/RepoProfile.md)

***

### requireArtifact

Re-exports [requireArtifact](../server/http/functions/requireArtifact.md)

***

### requireSession

Re-exports [requireSession](../server/http/functions/requireSession.md)

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

### runStructured

Re-exports [runStructured](../runtime/structured/functions/runStructured.md)

***

### Runtime

Re-exports [Runtime](../runtime/tasks/classes/Runtime.md)

***

### RuntimeEvent

Re-exports [RuntimeEvent](../shared/types/interfaces/RuntimeEvent.md)

***

### runWorkflow

Re-exports [runWorkflow](../workflows/start/functions/runWorkflow.md)

***

### schemaErrors

Re-exports [schemaErrors](../runtime/structured/functions/schemaErrors.md)

***

### SearchDoc

Re-exports [SearchDoc](../runtime/render-ref/interfaces/SearchDoc.md)

***

### searchDocs

Re-exports [searchDocs](../runtime/render-ref/functions/searchDocs.md)

***

### send

Re-exports [send](../server/http/functions/send.md)

***

### SequenceLane

Re-exports [SequenceLane](../shared/types/interfaces/SequenceLane.md)

***

### SequenceProposal

Re-exports [SequenceProposal](../runtime/diagram/type-aliases/SequenceProposal.md)

***

### SequenceStatus

Re-exports [SequenceStatus](../shared/types/type-aliases/SequenceStatus.md)

***

### SequenceStep

Re-exports [SequenceStep](../shared/types/interfaces/SequenceStep.md)

***

### SequenceStepProposal

Re-exports [SequenceStepProposal](../runtime/diagram/type-aliases/SequenceStepProposal.md)

***

### Session

Re-exports [Session](../shared/types/interfaces/Session.md)

***

### SessionListing

Re-exports [SessionListing](../shared/types/interfaces/SessionListing.md)

***

### SessionState

Re-exports [SessionState](../shared/types/interfaces/SessionState.md)

***

### sessionView

Re-exports [sessionView](../runtime/render-ref/functions/sessionView.md)

***

### SessionView

Re-exports [SessionView](../runtime/render-ref/interfaces/SessionView.md)

***

### StartInput

Re-exports [StartInput](../runtime/plugins/interfaces/StartInput.md)

***

### StartQuestion

Re-exports [StartQuestion](../shared/types/interfaces/StartQuestion.md)

***

### startTask

Re-exports [startTask](../server/http/functions/startTask.md)

***

### Step

Re-exports [Step](../runtime/plugins/type-aliases/Step.md)

***

### Store

Re-exports [Store](../runtime/store/classes/Store.md)

***

### str

Re-exports [str](../server/http/functions/str.md)

***

### StructuredPrompt

Re-exports [StructuredPrompt](../runtime/structured/interfaces/StructuredPrompt.md)

***

### TaskActivityResponse

Re-exports [TaskActivityResponse](../shared/types/interfaces/TaskActivityResponse.md)

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

### text

Re-exports [text](../server/http/functions/text.md)

***

### TextLink

Re-exports [TextLink](../shared/types/interfaces/TextLink.md)

***

### UsageRun

Re-exports [UsageRun](../shared/types/interfaces/UsageRun.md)

***

### verifyDiagramAtBase

Re-exports [verifyDiagramAtBase](../runtime/diagram/functions/verifyDiagramAtBase.md)

***

### verifySequence

Re-exports [verifySequence](../runtime/diagram/functions/verifySequence.md)

***

### Workflow

Re-exports [Workflow](../runtime/plugins/interfaces/Workflow.md)

***

### WorkflowContext

Re-exports [WorkflowContext](../runtime/plugins/interfaces/WorkflowContext.md)

***

### WorkflowId

Re-exports [WorkflowId](../shared/types/type-aliases/WorkflowId.md)

***

### WorkflowInfo

Re-exports [WorkflowInfo](../shared/types/interfaces/WorkflowInfo.md)

***

### WorkflowStartData

Re-exports [WorkflowStartData](../shared/types/interfaces/WorkflowStartData.md)

***

### workflowView

Re-exports [workflowView](../runtime/render-ref/functions/workflowView.md)

***

### WorkflowView

Re-exports [WorkflowView](../runtime/render-ref/interfaces/WorkflowView.md)

***

### WriteMode

Re-exports [WriteMode](../shared/types/type-aliases/WriteMode.md)
