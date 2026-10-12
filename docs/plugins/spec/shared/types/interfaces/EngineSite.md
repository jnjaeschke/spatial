[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / EngineSite

# Interface: EngineSite

Where an engine implements an algorithm: a function (`symbol` its code-search symbol, `signature` its first line, `line` the first line of
its definition) or, for concepts, a declaration (`symbol` ""). `quote` is the code at `line` when stored. `method`: found through spec-link
comments (on lines `refs`), with `spec-link-heuristic` naming a function found by brace scan, proposed by the LLM (`why`), or confirmed by the user. `stale`: the quote is gone at the mapping's revision.

## Properties

### line

> **line**: `number`

***

### method

> **method**: `"user"` \| `"llm"` \| `"spec-link"` \| `"spec-link-heuristic"`

***

### path

> **path**: `string`

***

### quote

> **quote**: `string`

***

### refs

> **refs**: `number`[]

***

### signature

> **signature**: `string`

***

### stale?

> `optional` **stale?**: `true`

***

### steps

> **steps**: [`EngineStep`](EngineStep.md)[]

***

### symbol

> **symbol**: `string`

***

### why?

> `optional` **why?**: `string`
