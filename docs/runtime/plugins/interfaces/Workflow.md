[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / Workflow

# Interface: Workflow\<P\>

A kind of session; `start` runs it to completion by orchestrating phases with `rt.runPhase`. `description` is shown to the selector LLM and in the command popup; avoid e2e stub needles in it.

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

Params the selector must produce; a `z.strictObject` so its JSON schema is OpenAI-strict. Validates selector output.

## Methods

### checkAnswer()?

> `optional` **checkAnswer**(`view`, `decision`, `option`): `string` \| `null`

Why the user cannot take `option` of the open `decision` now, or null to accept it. A refused answer leaves the decision open.

#### Parameters

##### view

[`WorkflowView`](../../render-ref/interfaces/WorkflowView.md)

##### decision

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`DecisionData`](../../../shared/types/interfaces/DecisionData.md)\>

##### option

`string`

#### Returns

`string` \| `null`

***

### next()?

> `optional` **next**(`view`, `ctx`): [`Step`](../type-aliases/Step.md) \| `null`

Reads only stored state and returns the next step; null means wait (an open decision) or done. Called by `Runtime.advance` after the workflow's `start`, after each successful epoch and after each answered decision; a decision it returns must not repeat for the same (key, epoch) once answered.

#### Parameters

##### view

[`WorkflowView`](../../render-ref/interfaces/WorkflowView.md)

##### ctx

[`WorkflowContext`](WorkflowContext.md)

#### Returns

[`Step`](../type-aliases/Step.md) \| `null`

***

### overview()?

> `optional` **overview**(`view`): `string`[]

Session overview sections for sessions of this workflow; markdown, each starting with a `# ` heading.

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

### precheck()?

> `optional` **precheck**(`repo`, `params`): `Promise`\<[`PrecheckQuestion`](PrecheckQuestion.md)\<`P`\> \| `null`\>

Deterministic check of the work tree `repo` before the session exists; a question is shown in the start box with its options as buttons, and the chosen option's `params` complete the start.

#### Parameters

##### repo

`string`

##### params

`P`

#### Returns

`Promise`\<[`PrecheckQuestion`](PrecheckQuestion.md)\<`P`\> \| `null`\>

***

### start()

> **start**(`rt`, `sessionId`, `input`): `Promise`\<`void`\>

#### Parameters

##### rt

[`Runtime`](../../tasks/classes/Runtime.md)

##### sessionId

`string`

##### input

[`StartInput`](StartInput.md)\<`P`\>

#### Returns

`Promise`\<`void`\>
