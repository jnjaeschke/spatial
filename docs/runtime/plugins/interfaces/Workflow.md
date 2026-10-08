[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / Workflow

# Interface: Workflow\<P\>

A kind of session. `start` orchestrates phases with `rt.runPhase`.

## Extends

- [`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md)

## Type Parameters

### P

`P`

## Properties

### argHint

> **argHint**: `string`

#### Inherited from

[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md).[`argHint`](../../../shared/types/interfaces/WorkflowInfo.md#arghint)

***

### description

> **description**: `string`

#### Inherited from

[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md).[`description`](../../../shared/types/interfaces/WorkflowInfo.md#description)

***

### id

> **id**: `string`

#### Inherited from

[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md).[`id`](../../../shared/types/interfaces/WorkflowInfo.md#id)

***

### params

> **params**: `ZodType`\<`P`\>

Validated input produced by the selector or slash command.

## Methods

### overview()?

> `optional` **overview**(`view`): `string`[]

Markdown sections for this workflow, each beginning with a heading.

#### Parameters

##### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

#### Returns

`string`[]

***

### parseArgs()

> **parseArgs**(`args`): [`ParseResult`](../type-aliases/ParseResult.md)\<`P`\>

Deterministic parser for slash-command arguments.

#### Parameters

##### args

`string`

#### Returns

[`ParseResult`](../type-aliases/ParseResult.md)\<`P`\>

***

### start()

> **start**(`rt`, `sessionId`, `input`): `Promise`\<`void`\>

Runs the workflow to completion by orchestrating phases with rt.runPhase.

#### Parameters

##### rt

[`Runtime`](../../tasks/classes/Runtime.md)

##### sessionId

`string`

##### input

[`StartInput`](StartInput.md)\<`P`\>

#### Returns

`Promise`\<`void`\>
