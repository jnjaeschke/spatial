[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / ChatActions

# Interface: ChatActions

## Properties

### models

> **models**: [`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md)

***

### sessionId

> **sessionId**: `string`

***

### tasks

> **tasks**: [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)[]

## Methods

### onDiscard()

> **onDiscard**(`draftId`): `void`

#### Parameters

##### draftId

`string`

#### Returns

`void`

***

### onNote()

> **onNote**(`draftId`, `noteId`): `void`

#### Parameters

##### draftId

`string`

##### noteId

`string`

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
