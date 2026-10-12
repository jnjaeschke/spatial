[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / EngineStep

# Interface: EngineStep

A Step comment (`match`/`mismatch`, webspec-index's verdict) or a proposed range (`proposed`, lines `line`–`end`, `detail` its reason, `origin` `align` for `alignSteps` or `trace` for a spec trace's code reference). `alignSteps` replaces only `align` steps; every proposed step moves with its site and survives a re-derivation or a concurrent mapping run.

## Properties

### detail

> **detail**: `string`

***

### end?

> `optional` **end?**: `number`

***

### line

> **line**: `number`

***

### origin?

> `optional` **origin?**: `"align"` \| `"trace"`

***

### quote?

> `optional` **quote?**: `string`

***

### step

> **step**: `string`

***

### verdict

> **verdict**: `"proposed"` \| `"match"` \| `"mismatch"`
