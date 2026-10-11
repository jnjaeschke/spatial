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

### file()

> **file**(`path`, `signal`): `Promise`\<`string`\>

A file's text at Searchfox's current indexed revision. Network.

#### Parameters

##### path

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<`string`\>

***

### functionAt()

> **functionAt**(`path`, `line`, `signal`): `Promise`\<[`CodeScope`](../../../shared/types/interfaces/CodeScope.md)[]\>

The scopes enclosing a line, innermost first; empty at file scope. Network.

#### Parameters

##### path

`string`

##### line

`number`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`CodeScope`](../../../shared/types/interfaces/CodeScope.md)[]\>

***

### specRefs()

> **specRefs**(`url`, `signal`, `limit?`): `Promise`\<[`GeckoSpecRef`](../../../shared/types/interfaces/GeckoSpecRef.md)[]\>

Existing Gecko lines referencing a spec section, at most `limit` (default 30); Searchfox matches fragments as prefixes. Network.

#### Parameters

##### url

`string`

##### signal

`AbortSignal`

##### limit?

`number`

#### Returns

`Promise`\<[`GeckoSpecRef`](../../../shared/types/interfaces/GeckoSpecRef.md)[]\>

***

### tip()

> **tip**(): `Promise`\<\{ `repoBase`: `string`; `rev`: `string`; \}\>

Searchfox repository base and indexed revision; cached for at most an hour after success. Network.

#### Returns

`Promise`\<\{ `repoBase`: `string`; `rev`: `string`; \}\>
