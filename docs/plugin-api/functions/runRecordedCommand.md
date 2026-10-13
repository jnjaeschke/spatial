[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / runRecordedCommand

# Function: runRecordedCommand()

> **runRecordedCommand**(`ctx`, `options`): `Promise`\<\{ `artifact`: [`Artifact`](../../shared/types/interfaces/Artifact.md)\<[`CommandRunData`](../../shared/types/interfaces/CommandRunData.md)\>; `durationMs`: `number`; `output`: `string`; `result`: \{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}; \}\>

Runs a command and records its result; callers retain their own progress and activity reporting.

## Parameters

### ctx

`Pick`\<[`TaskContext`](../../runtime/tasks/interfaces/TaskContext.md), `"repo"` \| `"signal"` \| `"artifacts"`\>

### options

#### args

`string`[]

#### bin

`string`

#### callId?

`string`

#### command

`string`

#### env?

`Record`\<`string`, `string`\>

#### onResult?

(`result`, `durationMs`, `output`) => `void`

#### onStdoutLine?

(`line`) => `void`

#### test

`boolean`

## Returns

`Promise`\<\{ `artifact`: [`Artifact`](../../shared/types/interfaces/Artifact.md)\<[`CommandRunData`](../../shared/types/interfaces/CommandRunData.md)\>; `durationMs`: `number`; `output`: `string`; `result`: \{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}; \}\>
