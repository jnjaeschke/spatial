[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [workflows/registry](../README.md) / parseCommand

# Function: parseCommand()

> **parseCommand**(`workflows`, `text`): \{ `ok`: `true`; `params`: `unknown`; `prompt`: `string`; `workflow`: `string`; \} \| \{ `error`: `string`; `ok`: `false`; \}

Parses `/<id> <args>`. Unknown command or bad arguments -> error; never throws.

## Parameters

### workflows

`Iterable`\<[`Workflow`](../../../runtime/plugins/interfaces/Workflow.md)\<`any`\>\>

### text

`string`

## Returns

\{ `ok`: `true`; `params`: `unknown`; `prompt`: `string`; `workflow`: `string`; \} \| \{ `error`: `string`; `ok`: `false`; \}
