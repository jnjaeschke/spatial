[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / RuntimeOptions

# Interface: RuntimeOptions

## Properties

### git

> **git**: (`repo`, `signal?`) => [`GitCapability`](GitCapability.md)

`signal` is the calling task's: aborting it stops the capability's git work.

#### Parameters

##### repo

`string`

##### signal?

`AbortSignal`

#### Returns

[`GitCapability`](GitCapability.md)

***

### knowledge?

> `optional` **knowledge?**: [`Knowledge`](../../knowledge/interfaces/Knowledge.md)

Plugin data that outlives sessions; defaults to an in-memory store.

***

### llm

> **llm**: [`LlmService`](../../llm/types/interfaces/LlmService.md)

***

### plugins

> **plugins**: [`Plugin`](../../plugins/interfaces/Plugin.md)[]

***

### repoContext?

> `optional` **repoContext?**: (`repo`) => [`RepoContext`](../../repo-context/interfaces/RepoContext.md)

Called once at task start to load repo MCP servers, skills, and instructions. Defaults to an empty context.

#### Parameters

##### repo

`string`

#### Returns

[`RepoContext`](../../repo-context/interfaces/RepoContext.md)

***

### repoMcp?

> `optional` **repoMcp?**: (`repo`) => `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

MCP servers for LLM work in a repository before any session exists.

#### Parameters

##### repo

`string`

#### Returns

`Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

***

### services?

> `optional` **services?**: `Record`\<`string`, `unknown`\>

Per-plugin-id service objects that replace what `Plugin.services` would build (tests).

***

### sessionMcp?

> `optional` **sessionMcp?**: (`sessionId`) => `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

#### Parameters

##### sessionId

`string`

#### Returns

`Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

***

### store

> **store**: [`Store`](../../store/classes/Store.md)
