[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / SearchfoxCapability

# Interface: SearchfoxCapability

## Properties

### effect

> `readonly` **effect**: `"read-only"`

## Methods

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
