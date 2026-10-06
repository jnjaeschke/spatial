[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/registry](../README.md) / Workflow

# Interface: Workflow\<P\>

A kind of session. `description` is shown to the selector LLM and in the command popup; avoid e2e stub needles in it (see the F3 plan).

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

> **id**: [`WorkflowId`](../../../shared/types/type-aliases/WorkflowId.md)

#### Inherited from

[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md).[`id`](../../../shared/types/interfaces/WorkflowInfo.md#id)

***

### params

> **params**: `ZodType`\<`P`\>

Params the selector must produce; a `z.strictObject` so its JSON schema is OpenAI-strict. Validates selector output.

## Methods

### parseArgs()

> **parseArgs**(`args`): [`ParseResult`](../type-aliases/ParseResult.md)\<`P`\>

Deterministic parser of the slash command's argument text.

#### Parameters

##### args

`string`

#### Returns

[`ParseResult`](../type-aliases/ParseResult.md)\<`P`\>

***

### start()

> **start**(`rt`, `sessionId`, `input`): `Promise`\<`void`\>

Runs the workflow to completion; may run LLM tasks.

#### Parameters

##### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

##### sessionId

`string`

##### input

[`StartInput`](StartInput.md)\<`P`\>

#### Returns

`Promise`\<`void`\>
