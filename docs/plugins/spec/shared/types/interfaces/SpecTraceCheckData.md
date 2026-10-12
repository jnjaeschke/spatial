[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / SpecTraceCheckData

# Interface: SpecTraceCheckData

Data of a `SpecTraceCheck` artifact: the checks of one `SpecTrace` version (`traceArtifactId`), index-aligned with its entries (`notes` null for an empty note), and the verdict of the generation the trace belongs to.

## Properties

### hops

> **hops**: [`HopResult`](HopResult.md)[]

***

### notes

> **notes**: ([`NoteResult`](NoteResult.md) \| `null`)[]

***

### notesTaskId

> **notesTaskId**: `string` \| `null`

***

### traceArtifactId

> **traceArtifactId**: `string`

***

### traceId

> **traceId**: `string`

***

### verdict

> **verdict**: [`TraceVerdict`](TraceVerdict.md) \| `null`
