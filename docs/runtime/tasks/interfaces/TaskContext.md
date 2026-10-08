[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / TaskContext

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

### git

> **git**: [`GitCapability`](GitCapability.md)

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

### repoInstructions

> **repoInstructions**: `string` \| `null`

Repo instructions from AGENTS.md or CLAUDE.md, if present.

***

### repoMcp

> **repoMcp**: `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

Repo-specific MCP servers from .mcp.json, deny-filtered. Empty when no .mcp.json exists.

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
