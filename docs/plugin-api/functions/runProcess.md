[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / runProcess

# Function: runProcess()

> **runProcess**(`cmd`, `args`, `opts`): `Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>

Runs a process, optionally streaming stdout lines.

## Parameters

### cmd

`string`

### args

`string`[]

### opts

#### cwd?

`string`

#### env?

`Record`\<`string`, `string`\>

#### onStdoutLine?

(`line`) => `void`

#### signal

`AbortSignal`

#### stdin

`string`

## Returns

`Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>
