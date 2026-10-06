[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / RuntimeOptions

# Interface: RuntimeOptions

## Properties

### git

> **git**: (`repo`) => [`GitCapability`](GitCapability.md)

#### Parameters

##### repo

`string`

#### Returns

[`GitCapability`](GitCapability.md)

***

### llm

> **llm**: [`LlmService`](../../llm/types/interfaces/LlmService.md)

***

### repoContext?

> `optional` **repoContext?**: (`repo`) => `object`

Called at task start to load repo-specific MCP servers. Defaults to no repo servers.

#### Parameters

##### repo

`string`

#### Returns

`object`

##### mcpServers

> **mcpServers**: `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

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

### tasks

> **tasks**: [`TaskDefinition`](TaskDefinition.md)\<`any`, `any`\>[]

***

### webspec

> **webspec**: [`WebspecCapability`](WebspecCapability.md)
