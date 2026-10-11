[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / runChecked

# Function: runChecked()

> **runChecked**(`cmd`, `args`, `opts`): `Promise`\<\{ `stderr`: `string`; `stdout`: `string`; \}\>

`runProcess` that throws `${label} exited with code N: <tail>` on a non-zero exit; the tail is the last `tail` (default 1000) characters of stderr, or of stdout when stderr is empty.

## Parameters

### cmd

`string`

### args

`string`[]

### opts

`object` & `object`

## Returns

`Promise`\<\{ `stderr`: `string`; `stdout`: `string`; \}\>
