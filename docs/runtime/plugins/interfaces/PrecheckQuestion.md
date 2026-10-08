[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / PrecheckQuestion

# Interface: PrecheckQuestion\<P\>

A question asked before the session exists; the chosen option's `params` are merged into the workflow params, an option without `params` cancels the start.

## Type Parameters

### P

`P`

## Properties

### options

> **options**: `object`[]

#### label

> **label**: `string`

#### params?

> `optional` **params?**: `Partial`\<`P`\>

***

### question

> **question**: `string`
