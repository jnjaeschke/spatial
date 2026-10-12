[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/brace-scan](../README.md) / enclosingFunction

# Function: enclosingFunction()

> **enclosingFunction**(`lines`, `line`): [`ScannedFunction`](../interfaces/ScannedFunction.md) \| `null`

The innermost function whose lines (from the one naming it to its closing brace) include `line`; null outside every function body.

## Parameters

### lines

`string`[]

### line

`number`

## Returns

[`ScannedFunction`](../interfaces/ScannedFunction.md) \| `null`
