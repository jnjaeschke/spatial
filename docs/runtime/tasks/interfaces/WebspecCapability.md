[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / WebspecCapability

# Interface: WebspecCapability

## Properties

### effect

> `readonly` **effect**: `"read-only"`

## Methods

### resolve()

> **resolve**(`url`, `signal`): `Promise`\<\{ `found`: `true`; `spec`: [`ResolvedSpec`](../../../shared/types/interfaces/ResolvedSpec.md); \} \| \{ `found`: `false`; `reason`: `string`; \}\>

#### Parameters

##### url

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<\{ `found`: `true`; `spec`: [`ResolvedSpec`](../../../shared/types/interfaces/ResolvedSpec.md); \} \| \{ `found`: `false`; `reason`: `string`; \}\>
