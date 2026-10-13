[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [workflows/start](../README.md) / begin

# Function: begin()

> **begin**(`rt`, `base`, `start`, `selection?`, `waitForWorkflow?`): `Promise`\<[`Session`](../../../shared/types/interfaces/Session.md)\>

Creates a workflow session; callers can wait for the workflow instead of running it in the background.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### base

[`StartBase`](../interfaces/StartBase.md)

### start

[`Chosen`](../type-aliases/Chosen.md)

### selection?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

### waitForWorkflow?

`boolean` = `false`

## Returns

`Promise`\<[`Session`](../../../shared/types/interfaces/Session.md)\>
