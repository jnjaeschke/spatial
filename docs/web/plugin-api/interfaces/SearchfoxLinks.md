[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / SearchfoxLinks

# Interface: SearchfoxLinks

Where Searchfox links point. `exact` false means the patch's upstream revision is unknown and `rev` is Searchfox's current tip.

## Properties

### exact

> **exact**: `boolean`

***

### links

> **links**: `Record`\<`string`, `string` \| `null`\>

***

### repoBase

> **repoBase**: `string`

***

### rev

> **rev**: `string`

## Methods

### request()

> **request**(`token`): `void`

#### Parameters

##### token

`string`

#### Returns

`void`
