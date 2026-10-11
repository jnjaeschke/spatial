[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / Artifact

# Interface: Artifact\<T\>

## Type Parameters

### T

`T` = `unknown`

## Properties

### createdAt

> **createdAt**: `string`

***

### data

> **data**: `T`

***

### epoch

> **epoch**: `number` \| `null`

Latest epoch of the session at creation; null before the first epoch.

***

### id

> **id**: `string`

***

### provenance

> **provenance**: [`Provenance`](Provenance.md)

***

### sessionId

> **sessionId**: `string`

***

### status

> **status**: [`ArtifactStatus`](../type-aliases/ArtifactStatus.md)

***

### type

> **type**: `string`
