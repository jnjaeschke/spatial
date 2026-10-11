[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / NodeKind

# Interface: NodeKind

## Properties

### component

> **component**: `ComponentType`\<[`NodeProps`](../type-aliases/NodeProps.md)\>

***

### minimapColor

> **minimapColor**: `string`

***

### resizable?

> `optional` **resizable?**: `boolean`

False: no width handle and the width always comes from `size` (diagram). Default true.

## Methods

### size()

> **size**(`data`): `object`

First-paint size estimate before measurement, unscaled.

#### Parameters

##### data

[`GraphNodeData`](../type-aliases/GraphNodeData.md)

#### Returns

`object`

##### height

> **height**: `number`

##### width

> **width**: `number`
