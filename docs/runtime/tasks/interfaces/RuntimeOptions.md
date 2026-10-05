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

### searchfox

> **searchfox**: [`SearchfoxCapability`](SearchfoxCapability.md)

***

### sessionMcp?

> `optional` **sessionMcp?**: (`sessionId`) => `Record`\<`string`, [`McpServerSpec`](../../llm/types/interfaces/McpServerSpec.md)\>

#### Parameters

##### sessionId

`string`

#### Returns

`Record`\<`string`, [`McpServerSpec`](../../llm/types/interfaces/McpServerSpec.md)\>

***

### store

> **store**: [`Store`](../../store/classes/Store.md)

***

### tasks

> **tasks**: [`TaskDefinition`](TaskDefinition.md)\<`any`, `any`\>[]

***

### webspec

> **webspec**: [`WebspecCapability`](WebspecCapability.md)
