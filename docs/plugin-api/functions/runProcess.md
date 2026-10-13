[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / runProcess

# Function: runProcess()

> **runProcess**(`cmd`, `args`, `opts`): `Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>

Spawns `cmd`, writes `stdin`, collects output. A function `stdin` gets the open stream and ends it itself. `env` adds to the inherited environment. Abort sends the child `abortSignal` (default SIGTERM) and rejects once it exited, after `onStdoutLine` saw all its output.

## Parameters

### cmd

`string`

### args

`string`[]

### opts

#### abortSignal?

`Signals`

#### cwd?

`string`

#### env?

`Record`\<`string`, `string`\>

#### onStdoutLine?

(`line`) => `void`

#### signal

`AbortSignal`

#### stdin

`string` \| ((`stdin`) => `void`)

## Returns

`Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>
