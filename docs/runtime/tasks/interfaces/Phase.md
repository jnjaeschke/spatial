[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / Phase

# Interface: Phase\<I\>

A unit of work in a workflow; each run is one epoch. `run` orchestrates tasks; throwing fails the epoch. `next` is what the phase still needs after its epoch succeeded, while that epoch is the latest: a decision or a follow-up phase; null when the phase is done. `Runtime.advance` asks it before the workflow's `next`, in any workflow.

## Type Parameters

### I

`I`

## Properties

### id

> **id**: `string`

## Methods

### next()?

> `optional` **next**(`view`, `epoch`): [`Step`](../../plugins/type-aliases/Step.md) \| `null`

#### Parameters

##### view

[`WorkflowView`](../../render-ref/interfaces/WorkflowView.md)

##### epoch

[`Epoch`](../../../shared/types/interfaces/Epoch.md)

#### Returns

[`Step`](../../plugins/type-aliases/Step.md) \| `null`

***

### run()

> **run**(`rt`, `sessionId`, `input`, `epoch`): `Promise`\<`void`\>

#### Parameters

##### rt

[`Runtime`](../classes/Runtime.md)

##### sessionId

`string`

##### input

`I`

##### epoch

[`Epoch`](../../../shared/types/interfaces/Epoch.md)

#### Returns

`Promise`\<`void`\>
