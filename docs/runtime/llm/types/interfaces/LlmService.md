[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [runtime/llm/types](../README.md) / LlmService

# Interface: LlmService

Runtime-owned LLM management. `selection` undefined means the configured default.

## Properties

### defaultSelection

> `readonly` **defaultSelection**: [`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

## Methods

### listModels()

> **listModels**(): `Promise`\<`Record`\<[`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md), [`BackendModels`](../../../../shared/types/type-aliases/BackendModels.md)\>\>

One failing backend (e.g. codex not installed) must not hide the others.

#### Returns

`Promise`\<`Record`\<[`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md), [`BackendModels`](../../../../shared/types/type-aliases/BackendModels.md)\>\>

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
