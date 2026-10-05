[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / Runtime

# Class: Runtime

## Constructors

### Constructor

> **new Runtime**(`opts`): `Runtime`

#### Parameters

##### opts

[`RuntimeOptions`](../interfaces/RuntimeOptions.md)

#### Returns

`Runtime`

## Accessors

### llm

#### Get Signature

> **get** **llm**(): [`LlmService`](../../llm/types/interfaces/LlmService.md)

##### Returns

[`LlmService`](../../llm/types/interfaces/LlmService.md)

***

### store

#### Get Signature

> **get** **store**(): [`Store`](../../store/classes/Store.md)

##### Returns

[`Store`](../../store/classes/Store.md)

## Methods

### cancel()

> **cancel**(`taskId`): `void`

#### Parameters

##### taskId

`string`

#### Returns

`void`

***

### emit()

> **emit**(`sessionId`, `actor`, `type`, `payload`): [`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)

#### Parameters

##### sessionId

`string`

##### actor

[`Actor`](../../../shared/types/type-aliases/Actor.md)

##### type

`string`

##### payload

`unknown`

#### Returns

[`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)

***

### onEvent()

> **onEvent**(`listener`): () => `void`

#### Parameters

##### listener

[`Listener`](../type-aliases/Listener.md)

#### Returns

() => `void`

***

### run()

> **run**\<`O`\>(`sessionId`, `kind`, `input`): `Promise`\<`O`\>

#### Type Parameters

##### O

`O` = `unknown`

#### Parameters

##### sessionId

`string`

##### kind

`string`

##### input

`unknown`

#### Returns

`Promise`\<`O`\>

***

### start()

> **start**\<`O`\>(`sessionId`, `kind`, `input`): `object`

Starts a task and returns immediately. `done` rejects with TaskFailedError or
TaskCancelledError; callers that do not await it must attach a rejection handler.

#### Type Parameters

##### O

`O` = `unknown`

#### Parameters

##### sessionId

`string`

##### kind

`string`

##### input

`unknown`

#### Returns

`object`

##### done

> **done**: `Promise`\<`O`\>

##### taskId

> **taskId**: `string`
