[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / SpecAlgorithmData

# Interface: SpecAlgorithmData

Data of a `SpecAlgorithm` artifact (verified source fact): one webspec-index section at `sha`, stored once per (`ref`, `sha`) per session. `effects` lists all effects of the section; `stepEffects` is keyed by dotted step path.

## Properties

### anchor

> **anchor**: `string`

***

### content

> **content**: `string`

***

### effects

> **effects**: [`SpecEffect`](../../../../../shared/types/interfaces/SpecEffect.md)[]

***

### effectsStatus

> **effectsStatus**: [`SpecEffectsStatus`](../../../../../shared/types/interfaces/SpecEffectsStatus.md)

***

### outgoingRefs

> **outgoingRefs**: `number`

***

### ref

> **ref**: `string`

***

### sha

> **sha**: `string`

***

### spec

> **spec**: `string`

***

### stepEffects

> **stepEffects**: `Record`\<`string`, [`StepEffect`](StepEffect.md)[]\>

***

### title

> **title**: `string`

***

### type

> **type**: `string`

***

### url

> **url**: `string`
