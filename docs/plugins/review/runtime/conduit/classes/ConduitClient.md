[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/conduit](../README.md) / ConduitClient

# Class: ConduitClient

## Constructors

### Constructor

> **new ConduitClient**(`host`, `token`, `fetchImpl?`): `ConduitClient`

#### Parameters

##### host

`string`

##### token

`string`

##### fetchImpl?

\{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

#### Returns

`ConduitClient`

## Methods

### call()

> **call**\<`T`\>(`method`, `params`): `Promise`\<`T`\>

#### Type Parameters

##### T

`T`

#### Parameters

##### method

`string`

##### params

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`T`\>
