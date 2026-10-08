[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / GuideStep

# Interface: GuideStep

A step of the guide bar's reading path.

## Properties

### reviewed

> **reviewed**: `boolean`

***

### tag?

> `optional` **tag?**: `string`

Short label before the title (the commit of a stack).

***

### title

> **title**: `string`

## Methods

### nodeId()

> **nodeId**(`level`): `string`

The node to center for this step at a zoom level.

#### Parameters

##### level

[`ZoomLevel`](../type-aliases/ZoomLevel.md)

#### Returns

`string`

***

### toggleReviewed()

> **toggleReviewed**(`sessionId`): `Promise`\<`unknown`\>

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`unknown`\>
