[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/manager](../README.md) / LlmManager

# Class: LlmManager

Runtime-owned LLM management. `selection` undefined means the configured default.

## Implements

- [`LlmService`](../../types/interfaces/LlmService.md)

## Constructors

### Constructor

> **new LlmManager**(`backends`, `defaultSelection`): `LlmManager`

#### Parameters

##### backends

[`LlmBackend`](../../types/interfaces/LlmBackend.md)[]

##### defaultSelection

[`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

#### Returns

`LlmManager`

## Accessors

### defaultSelection

#### Get Signature

> **get** **defaultSelection**(): [`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

##### Returns

[`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

#### Implementation of

[`LlmService`](../../types/interfaces/LlmService.md).[`defaultSelection`](../../types/interfaces/LlmService.md#defaultselection)

## Methods

### chooseDefault()

> **chooseDefault**(): `Promise`\<`void`\>

Keeps the default when its backend lists models; otherwise moves it to the first model of the first backend that does, at medium effort when offered. A user with only one of the CLIs installed then starts with a working selection.

#### Returns

`Promise`\<`void`\>

***

### listModels()

> **listModels**(): `Promise`\<`Record`\<[`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md), [`BackendModels`](../../../../shared/types/type-aliases/BackendModels.md)\>\>

One failing backend (e.g. codex not installed) must not hide the others.

#### Returns

`Promise`\<`Record`\<[`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md), [`BackendModels`](../../../../shared/types/type-aliases/BackendModels.md)\>\>

#### Implementation of

[`LlmService`](../../types/interfaces/LlmService.md).[`listModels`](../../types/interfaces/LlmService.md#listmodels)

***

### run()

> **run**(`selection`, `prompt`, `signal`): `Promise`\<[`LlmRunResult`](../../types/interfaces/LlmRunResult.md)\>

#### Parameters

##### selection

[`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md) \| `undefined`

##### prompt

[`LlmPrompt`](../../types/interfaces/LlmPrompt.md)

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`LlmRunResult`](../../types/interfaces/LlmRunResult.md)\>

#### Implementation of

[`LlmService`](../../types/interfaces/LlmService.md).[`run`](../../types/interfaces/LlmService.md#run)
