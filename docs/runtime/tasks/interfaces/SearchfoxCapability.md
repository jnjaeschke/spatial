[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / SearchfoxCapability

# Interface: SearchfoxCapability

## Properties

### effect

> `readonly` **effect**: `"read-only"`

## Methods

### define()

> **define**(`symbol`, `signal`): `Promise`\<\{ `line`: `number`; `path`: `string`; `text`: `string`; \} \| `null`\>

Resolve a symbol to its definition at Searchfox's current indexed revision. Network.

#### Parameters

##### symbol

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<\{ `line`: `number`; `path`: `string`; `text`: `string`; \} \| `null`\>

***

### specRefs()

> **specRefs**(`url`, `signal`): `Promise`\<[`GeckoSpecRef`](../../../shared/types/interfaces/GeckoSpecRef.md)[]\>

Existing Gecko lines referencing a spec section. Network.

#### Parameters

##### url

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`GeckoSpecRef`](../../../shared/types/interfaces/GeckoSpecRef.md)[]\>

***

### tip()

> **tip**(): `Promise`\<\{ `repoBase`: `string`; `rev`: `string`; \}\>

Searchfox repository base and indexed revision; cached after first success. Network.

#### Returns

`Promise`\<\{ `repoBase`: `string`; `rev`: `string`; \}\>
