[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/read](../README.md) / localMainline

# Function: localMainline()

> **localMainline**(`repo`, `signal?`): `Promise`\<\{ `ref`: `string`; `sha`: `string`; \} \| `null`\>

The local `main`, else `master`, as a full ref name and its commit; null without either.

## Parameters

### repo

`string`

### signal?

`AbortSignal`

## Returns

`Promise`\<\{ `ref`: `string`; `sha`: `string`; \} \| `null`\>
