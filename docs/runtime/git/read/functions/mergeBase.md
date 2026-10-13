[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/read](../README.md) / mergeBase

# Function: mergeBase()

> **mergeBase**(`repo`, `a`, `b`, `signal?`): `Promise`\<`string` \| `null`\>

The best common ancestor of `a` and `b`; null when they share none. Other failures (an unknown revision) reject.

## Parameters

### repo

`string`

### a

`string`

### b

`string`

### signal?

`AbortSignal`

## Returns

`Promise`\<`string` \| `null`\>
