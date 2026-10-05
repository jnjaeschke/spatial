[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [runtime/llm/types](../README.md) / LlmService

# Interface: LlmService

Runtime-owned LLM management. `selection` undefined means the configured default.

## Methods

### listModels()

> **listModels**(): `Promise`\<`Record`\<[`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md), [`ModelInfo`](../../../../shared/types/interfaces/ModelInfo.md)[]\>\>

#### Returns

`Promise`\<`Record`\<[`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md), [`ModelInfo`](../../../../shared/types/interfaces/ModelInfo.md)[]\>\>

***

### run()

> **run**(`selection`, `prompt`, `signal`): `Promise`\<[`LlmRunResult`](LlmRunResult.md)\>

#### Parameters

##### selection

[`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md) \| `undefined`

##### prompt

[`LlmPrompt`](LlmPrompt.md)

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`LlmRunResult`](LlmRunResult.md)\>
