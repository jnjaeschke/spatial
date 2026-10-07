[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / DiagramData

# Interface: DiagramData

Data of a `Diagram` artifact (status `proposed`), linked `derivedFrom → assistant ChatMessage`. `before` is the parent commit's flow, null for a new flow.

## Properties

### before

> **before**: [`SequenceStep`](SequenceStep.md)[] \| `null`

***

### commit

> **commit**: `string`

***

### commitIndex

> **commitIndex**: `number`

***

### kind

> **kind**: `"sequence"`

***

### lanes

> **lanes**: [`SequenceLane`](SequenceLane.md)[]

***

### steps

> **steps**: [`SequenceStep`](SequenceStep.md)[]

***

### summary

> **summary**: `string`

***

### title

> **title**: `string`
