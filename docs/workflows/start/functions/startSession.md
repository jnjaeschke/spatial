[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [workflows/start](../README.md) / startSession

# Function: startSession()

> **startSession**(`rt`, `pending`, `request`, `signal`): `Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

Handles the start box until a workflow is chosen: runs the selector or parses the command, asks the selector's and the workflow's questions, then creates the session and starts its workflow in the background. No session exists before that. `pending` holds the open questions.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### pending

`Map`\<`string`, [`PendingStart`](../type-aliases/PendingStart.md)\>

### request

[`StartRequest`](../type-aliases/StartRequest.md)

### signal

`AbortSignal`

## Returns

`Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>
