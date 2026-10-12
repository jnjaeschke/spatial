[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / RuntimeOptions

# Interface: RuntimeOptions

## Properties

### codeSearch?

> `optional` **codeSearch?**: `Partial`\<`Record`\<[`Engine`](../../../shared/types/type-aliases/Engine.md), [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)\>\>

Code search per engine; Gecko defaults to `searchfox`, engines without a tool to a code search that fails every call.

***

### git

> **git**: (`repo`) => [`GitCapability`](GitCapability.md)

#### Parameters

##### repo

`string`

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

### searchfox

> **searchfox**: [`SearchfoxCapability`](SearchfoxCapability.md)

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

***

### webspec

> **webspec**: [`WebspecCapability`](WebspecCapability.md)
