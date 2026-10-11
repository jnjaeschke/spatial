[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [cli/launch](../README.md) / ensureServer

# Function: ensureServer()

> **ensureServer**(`opts`): `Promise`\<[`HealthResponse`](../../../shared/types/interfaces/HealthResponse.md)\>

Reuses the server on `port` or starts one and waits for its health. Health is probed before the child's exit is checked, so losing a start race to another CLI still succeeds.

## Parameters

### opts

#### fetchImpl?

\{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

#### intervalMs?

`number`

#### port

`number`

#### startServer

() => [`StartedServer`](../interfaces/StartedServer.md)

#### timeoutMs?

`number`

## Returns

`Promise`\<[`HealthResponse`](../../../shared/types/interfaces/HealthResponse.md)\>
