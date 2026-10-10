[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / GuideStep

# Interface: GuideStep

A step of the guide bar's reading path.

## Properties

### nodeId

> **nodeId**: `string`

The node to center for this step.

***

### place?

> `optional` **place?**: `string`

The place this step opens instead of centering `nodeId`.

***

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

### toggleReviewed()?

> `optional` **toggleReviewed**(`sessionId`): `Promise`\<`unknown`\>

Without it the guide bar offers no reviewed toggle for the step.

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`unknown`\>
