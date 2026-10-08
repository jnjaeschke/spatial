[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/start](../README.md) / startSession

# Function: startSession()

> **startSession**(`rt`, `path`, `text`, `llm?`, `opts?`): `Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

Starts a session in the worktree of `path` from start box text. A slash command may return a `StartQuestion` instead of a session.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### path

`string`

### text

`string`

### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

### opts?

#### answer?

`number`

#### writeMode?

[`WriteMode`](../../../shared/types/type-aliases/WriteMode.md)

## Returns

`Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>
