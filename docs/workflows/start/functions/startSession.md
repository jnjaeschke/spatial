[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/start](../README.md) / startSession

# Function: startSession()

> **startSession**(`rt`, `path`, `text`, `llm?`): `Promise`\<[`Session`](../../../shared/types/interfaces/Session.md)\>

Starts a session in the worktree of `path` from start box text. A `/command` is parsed without an LLM and a bad one throws before anything is created; other text goes to the selectWorkflow task. Returns once the session exists; the workflow continues in the background.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### path

`string`

### text

`string`

### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

## Returns

`Promise`\<[`Session`](../../../shared/types/interfaces/Session.md)\>
