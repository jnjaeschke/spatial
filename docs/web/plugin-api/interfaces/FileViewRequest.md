[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / FileViewRequest

# Interface: FileViewRequest

A location in a diff to show; with `row` the view jumps to that row where the diff is shown, without it the view opens the file.

## Properties

### diffId

> **diffId**: `string`

***

### hunkId

> **hunkId**: `string`

***

### path

> **path**: `string`

***

### row?

> `optional` **row?**: `object`

#### line

> **line**: `number`

#### side

> **side**: `"new"` \| `"old"`

***

### text?

> `optional` **text?**: `string`
