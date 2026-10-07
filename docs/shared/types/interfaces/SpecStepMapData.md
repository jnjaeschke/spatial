[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / SpecStepMapData

# Interface: SpecStepMapData

Data of a `SpecStepMap` artifact: which changed lines implement which steps of a spec section, over the changes the spec supports. Linked `derivedFrom → SpecReference`, `about → narrative`; latest per (spec, narrative) wins. Proposed (LLM); the runtime dropped links to unknown steps and lines outside those changes' hunks, and says so in `dropped`.

## Properties

### dropped

> **dropped**: `string`[]

***

### links

> **links**: [`StepLink`](StepLink.md)[]

***

### narrative

> **narrative**: `string`

***

### spec

> **spec**: `string`

***

### unmapped

> **unmapped**: [`UnmappedLines`](UnmappedLines.md)[]
