[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/types](../README.md) / FindingVerdictData

# Interface: FindingVerdictData

The review's judgement whether a new revision addresses a prior finding. Linked `about → finding`, `derivedFrom → narrative`; latest per finding wins. Provenance: llm.

## Properties

### finding

> **finding**: `string`

***

### reason

> **reason**: `string`

***

### verdict

> **verdict**: [`FindingVerdictValue`](../type-aliases/FindingVerdictValue.md)
