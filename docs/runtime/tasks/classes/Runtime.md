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

## Properties

### plugins

> `readonly` **plugins**: [`PluginRegistry`](../../plugins/interfaces/PluginRegistry.md)

***

### workflows

> `readonly` **workflows**: `ReadonlyMap`\<`string`, [`Workflow`](../../plugins/interfaces/Workflow.md)\<`any`\>\>

## Accessors

### llm

#### Get Signature

> **get** **llm**(): [`LlmService`](../../llm/types/interfaces/LlmService.md)

##### Returns

[`LlmService`](../../llm/types/interfaces/LlmService.md)

***

### searchfox

#### Get Signature

> **get** **searchfox**(): [`SearchfoxCapability`](../interfaces/SearchfoxCapability.md)

##### Returns

[`SearchfoxCapability`](../interfaces/SearchfoxCapability.md)

***

### store

#### Get Signature

> **get** **store**(): [`Store`](../../store/classes/Store.md)

##### Returns

[`Store`](../../store/classes/Store.md)

## Methods

### advance()

> **advance**(`sessionId`): `Promise`\<`void`\>

Runs the steps `Workflow.next` returns until it returns null. A run step is `runPhase` (a failing phase rejects and stops the loop; Retry reruns it and advances again). A decision step is stored as a `Decision` artifact once per (question, epoch): a chosen one continues the loop, an open one waits for the user.

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`void`\>

***

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

### gitFor()

> **gitFor**(`sessionId`): [`GitCapability`](../interfaces/GitCapability.md)

Read-only git for server queries outside tasks.

#### Parameters

##### sessionId

`string`

#### Returns

[`GitCapability`](../interfaces/GitCapability.md)

***

### onEvent()

> **onEvent**(`listener`): () => `void`

#### Parameters

##### listener

[`Listener`](../type-aliases/Listener.md)

#### Returns

() => `void`

***

### retryPhase()

> **retryPhase**(`sessionId`): `Promise`\<[`Epoch`](../../../shared/types/interfaces/Epoch.md)\>

Reruns the latest epoch, which must have failed or been cancelled, in place with its stored input; otherwise like `runPhase`.

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<[`Epoch`](../../../shared/types/interfaces/Epoch.md)\>

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

### runningEpoch()

> **runningEpoch**(`sessionId`): [`Epoch`](../../../shared/types/interfaces/Epoch.md) \| `null`

#### Parameters

##### sessionId

`string`

#### Returns

[`Epoch`](../../../shared/types/interfaces/Epoch.md) \| `null`

***

### runPhase()

> **runPhase**(`sessionId`, `phaseId`, `input`): `Promise`\<[`Epoch`](../../../shared/types/interfaces/Epoch.md)\>

Opens the next epoch and runs the phase in it. Throws synchronously (`PhaseBusyError`) while another epoch runs. Resolves to the finished epoch (also when cancelled); rejects with the phase's error after marking the epoch failed.

#### Parameters

##### sessionId

`string`

##### phaseId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`Epoch`](../../../shared/types/interfaces/Epoch.md)\>

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
