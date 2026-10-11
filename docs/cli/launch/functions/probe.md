[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [cli/launch](../README.md) / probe

# Function: probe()

> **probe**(`port`, `fetchImpl?`): `Promise`\<[`HealthResponse`](../../../shared/types/interfaces/HealthResponse.md) \| `"free"` \| `"foreign"`\>

What listens on `port`: our server (its health), nothing, or something else.

## Parameters

### port

`number`

### fetchImpl?

\{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

## Returns

`Promise`\<[`HealthResponse`](../../../shared/types/interfaces/HealthResponse.md) \| `"free"` \| `"foreign"`\>
