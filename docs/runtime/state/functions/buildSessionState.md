[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/state](../README.md) / buildSessionState

# Function: buildSessionState()

> **buildSessionState**(`store`, `searchfoxCapability`, `hooks`, `sessionId`): `Promise`\<[`SessionState`](../../../shared/types/interfaces/SessionState.md)\>

## Parameters

### store

[`Store`](../../store/classes/Store.md)

### searchfoxCapability

[`SearchfoxCapability`](../../tasks/interfaces/SearchfoxCapability.md)

### hooks

`Pick`\<[`PluginRegistry`](../../plugins/interfaces/PluginRegistry.md), `"linkRevs"` \| `"textLinks"`\>

### sessionId

`string`

## Returns

`Promise`\<[`SessionState`](../../../shared/types/interfaces/SessionState.md)\>
