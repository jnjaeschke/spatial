[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / PhaseViewProps

# Interface: PhaseViewProps

## Properties

### drafts

> **drafts**: [`Draft`](Draft.md)[]

***

### epoch

> **epoch**: [`Epoch`](../../../shared/types/interfaces/Epoch.md) \| `null`

***

### models

> **models**: [`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md)

***

### readOnly?

> `optional` **readOnly?**: `boolean`

***

### state

> **state**: [`SessionState`](../../../shared/types/interfaces/SessionState.md)

## Methods

### onDiscard()

> **onDiscard**(`draftId`): `void`

#### Parameters

##### draftId

`string`

#### Returns

`void`

***

### onOpenAside()

> **onOpenAside**(`draft`): `void`

#### Parameters

##### draft

[`Draft`](Draft.md)

#### Returns

`void`

***

### onSent()

> **onSent**(`draftId`, `taskId`): `void`

#### Parameters

##### draftId

`string`

##### taskId

`string`

#### Returns

`void`
