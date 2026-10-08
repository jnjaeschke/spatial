[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / Phase

# Interface: Phase\<I\>

A unit of work in a workflow; each run is one epoch. `run` orchestrates tasks; throwing fails the epoch.

## Type Parameters

### I

`I`

## Properties

### id

> **id**: `string`

## Methods

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
