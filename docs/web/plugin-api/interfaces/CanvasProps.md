[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / CanvasProps

# Interface: CanvasProps

## Properties

### closed?

> `optional` **closed?**: `object`

#### close

> **close**: (`id`) => `void`

##### Parameters

###### id

`string`

##### Returns

`void`

#### closed

> **closed**: `ReadonlySet`\<`string`\>

#### reopen

> **reopen**: (`ids`) => `void`

##### Parameters

###### ids

`string`[]

##### Returns

`void`

***

### drafts?

> `optional` **drafts?**: [`Draft`](Draft.md)[]

***

### model

> **model**: [`CanvasModel`](CanvasModel.md)

***

### models?

> `optional` **models?**: [`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md) \| `null`

***

### state

> **state**: [`SessionState`](../../../shared/types/interfaces/SessionState.md)

## Methods

### onDiscard()?

> `optional` **onDiscard**(`draftId`): `void`

#### Parameters

##### draftId

`string`

#### Returns

`void`

***

### onOpenAside()?

> `optional` **onOpenAside**(`draft`, `position`): `void`

#### Parameters

##### draft

[`Draft`](Draft.md)

##### position

###### x

`number`

###### y

`number`

#### Returns

`void`

***

### onSent()?

> `optional` **onSent**(`draftId`, `taskId`): `void`

#### Parameters

##### draftId

`string`

##### taskId

`string`

#### Returns

`void`
