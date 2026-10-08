[**spatial-ide**](../../README.md)

***

[spatial-ide](../../README.md) / [plugin-api](../README.md) / runProcess

# Function: runProcess()

> **runProcess**(`cmd`, `args`, `opts`): `Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>

Spawns `cmd`, writes `stdin`, collects output. Abort kills the child (SIGTERM) and rejects.

## Parameters

### cmd

`string`

### args

`string`[]

### opts

#### cwd?

`string`

#### onStdoutLine?

(`line`) => `void`

#### signal

`AbortSignal`

#### stdin

`string`

## Returns

`Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>
