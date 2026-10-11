[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmBackend

# Interface: LlmBackend

## Properties

### id

> **id**: [`LlmBackendId`](../../../../shared/types/type-aliases/LlmBackendId.md)

## Methods

### listModels()

> **listModels**(): `Promise`\<[`ModelInfo`](../../../../shared/types/interfaces/ModelInfo.md)[]\>

#### Returns

`Promise`\<[`ModelInfo`](../../../../shared/types/interfaces/ModelInfo.md)[]\>

***

### run()

> **run**(`req`): `Promise`\<[`LlmResult`](LlmResult.md)\>

#### Parameters

##### req

[`LlmRequest`](LlmRequest.md)

#### Returns

`Promise`\<[`LlmResult`](LlmResult.md)\>
