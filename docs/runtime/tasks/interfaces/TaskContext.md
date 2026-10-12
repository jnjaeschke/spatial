[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / TaskContext

# Interface: TaskContext

Everything a task may touch. Tasks get capabilities only through this.

## Properties

### artifacts

> **artifacts**: `object`

#### get()

> **get**\<`T`\>(`id`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

##### Type Parameters

###### T

`T`

##### Parameters

###### id

`string`

##### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

#### linkedTo()

> **linkedTo**(`to`, `kind`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

##### Parameters

###### to

`string`

###### kind

[`LinkKind`](../../../shared/types/type-aliases/LinkKind.md)

##### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

#### overview()

> **overview**(): `string`

##### Returns

`string`

#### put()

> **put**\<`T`\>(`type`, `status`, `data`, `llm?`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

##### Type Parameters

###### T

`T`

##### Parameters

###### type

`string`

###### status

[`ArtifactStatus`](../../../shared/types/type-aliases/ArtifactStatus.md)

###### data

`T`

###### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

##### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

#### render()

> **render**(`ref`): `string`

##### Parameters

###### ref

`string`

##### Returns

`string`

#### view()

> **view**(): [`SessionView`](../../render-ref/interfaces/SessionView.md)

##### Returns

[`SessionView`](../../render-ref/interfaces/SessionView.md)

***

### chat

> **chat**: `object`

#### replyFields

> **replyFields**: [`ChatReplyField`](../../plugins/interfaces/ChatReplyField.md)[]

#### context()

> **context**(`view`): `string`[]

##### Parameters

###### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

##### Returns

`string`[]

***

### codeSearch

> **codeSearch**: `Record`\<[`Engine`](../../../shared/types/type-aliases/Engine.md), [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)\>

Read-only code search per engine.

***

### epoch

> **epoch**: `number` \| `null`

The epoch the task started in; null outside a phase run.

***

### events

> **events**: `object`

#### recent()

> **recent**(`taskId`, `limit`): `string`[]

The last `limit` progress lines task `taskId` of this session reported, oldest first.

##### Parameters

###### taskId

`string`

###### limit

`number`

##### Returns

`string`[]

***

### git

> **git**: [`GitCapability`](GitCapability.md)

***

### knowledge

> **knowledge**: `Pick`\<[`Knowledge`](../../knowledge/interfaces/Knowledge.md), `"get"` \| `"list"`\>

The knowledge store, read-only: tasks return proposals, plugin runtime code writes them.

***

### links

> **links**: `object`

#### put()

> **put**(`from`, `to`, `kind`): [`Link`](../../../shared/types/interfaces/Link.md)

##### Parameters

###### from

`string`

###### to

`string`

###### kind

[`LinkKind`](../../../shared/types/type-aliases/LinkKind.md)

##### Returns

[`Link`](../../../shared/types/interfaces/Link.md)

***

### llm

> **llm**: `object`

#### defaultSelection

> `readonly` **defaultSelection**: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

#### run()

> **run**(`prompt`, `selection?`): `Promise`\<[`LlmRunResult`](../../llm/types/interfaces/LlmRunResult.md)\>

##### Parameters

###### prompt

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md)

###### selection?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

##### Returns

`Promise`\<[`LlmRunResult`](../../llm/types/interfaces/LlmRunResult.md)\>

***

### repo

> **repo**: `string`

***

### repoDir

> **repoDir**: `string`

Identity of the session's repository (`Session.repoDir`): the scope of per-repo knowledge.

***

### repoInstructions

> **repoInstructions**: `string` \| `null`

Repo instructions from AGENTS.md or CLAUDE.md, if present.

***

### repoMcp

> **repoMcp**: `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

Repo-specific MCP servers from .mcp.json, deny-filtered. Empty when no .mcp.json exists.

***

### repoProfiles

> **repoProfiles**: `ReadonlyMap`\<`string`, [`RepoProfile`](../../plugins/interfaces/RepoProfile.md)\>

***

### repoRequestableMcp

> **repoRequestableMcp**: `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

Denylisted repo MCP server specs that can be requested for a chat thread.

***

### repoSkills

> **repoSkills**: [`RepoSkill`](../../repo-context/interfaces/RepoSkill.md)[]

Repo skills available through the session MCP server.

***

### searchfox

> **searchfox**: [`SearchfoxCapability`](SearchfoxCapability.md)

***

### sessionId

> **sessionId**: `string`

***

### sessionMcp

> **sessionMcp**: `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

***

### signal

> **signal**: `AbortSignal`

***

### taskId

> **taskId**: `string`

***

### webspec

> **webspec**: [`WebspecCapability`](WebspecCapability.md)

***

### workflows

> **workflows**: `ReadonlyMap`\<`string`, [`Workflow`](../../plugins/interfaces/Workflow.md)\<`any`\>\>

## Methods

### progress()

> **progress**(`p`): `void`

#### Parameters

##### p

[`Progress`](../../../shared/types/type-aliases/Progress.md)

#### Returns

`void`

***

### run()

> **run**\<`O`\>(`kind`, `input`): `Promise`\<`O`\>

Runs a child task: it records this task as its parent, is cancelled with it, and its failure rejects here.

#### Type Parameters

##### O

`O` = `unknown`

#### Parameters

##### kind

`string`

##### input

`unknown`

#### Returns

`Promise`\<`O`\>
