[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / RuntimeOptions

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
