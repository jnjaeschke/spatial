[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/shared/types](../README.md) / InvestigationData

# Interface: InvestigationData

The contract any investigate phase must produce (artifact `Investigation`, status proposed). `exploration` is the handoff to the implement agent, which starts without the investigator's context. `diagram` and `specRefs` are optional; `droppedLocations`, `droppedChecks` and `diagramError` are set by the runtime.

## Properties

### architecture?

> `optional` **architecture?**: `string`

***

### bug

> **bug**: `number` \| `null`

***

### diagram?

> `optional` **diagram?**: [`DiagramData`](../../../../../shared/types/interfaces/DiagramData.md)

***

### diagramError?

> `optional` **diagramError?**: `string`

***

### droppedChecks?

> `optional` **droppedChecks?**: `string`[]

***

### droppedLocations?

> `optional` **droppedLocations?**: `string`[]

***

### exploration

> **exploration**: `object`[]

#### outcome

> **outcome**: `string`

#### tried

> **tried**: `string`

***

### kind

> **kind**: `"spec"` \| `"bugfix"` \| `"feature"` \| `"refactor"` \| `"perf"`

***

### locations

> **locations**: [`InvestigationLocation`](InvestigationLocation.md)[]

***

### openQuestions

> **openQuestions**: `string`[]

***

### specRefs?

> `optional` **specRefs?**: [`SpecReferenceData`](../../../../spec/shared/types/interfaces/SpecReferenceData.md)[]

***

### steps

> **steps**: [`InvestigationStep`](InvestigationStep.md)[]

***

### summary

> **summary**: `string`

***

### testCases

> **testCases**: `object`[]

#### actual?

> `optional` **actual?**: `string`

#### description

> **description**: `string`

#### expected

> **expected**: `string`

#### path?

> `optional` **path?**: `string`
