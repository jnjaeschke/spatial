[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/registry](../README.md) / parseCommand

# Function: parseCommand()

> **parseCommand**(`text`): \{ `ok`: `true`; `params`: `unknown`; `prompt`: `string`; `workflow`: [`WorkflowId`](../../../shared/types/type-aliases/WorkflowId.md); \} \| \{ `error`: `string`; `ok`: `false`; \}

Parses `/<id> <args>`. Unknown command or bad arguments -> error; never throws.

## Parameters

### text

`string`

## Returns

\{ `ok`: `true`; `params`: `unknown`; `prompt`: `string`; `workflow`: [`WorkflowId`](../../../shared/types/type-aliases/WorkflowId.md); \} \| \{ `error`: `string`; `ok`: `false`; \}
