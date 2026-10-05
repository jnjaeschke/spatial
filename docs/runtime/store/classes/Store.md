[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/store](../README.md) / Store

# Class: Store

Dumb persistence. Emits no events; the Runtime does that.

## Constructors

### Constructor

> **new Store**(`path`): `Store`

#### Parameters

##### path

`string`

#### Returns

`Store`

## Methods

### appendEvent()

> **appendEvent**(`e`): [`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)

#### Parameters

##### e

###### actor

[`Actor`](../../../shared/types/type-aliases/Actor.md)

###### payload

`unknown`

###### sessionId

`string`

###### type

`string`

#### Returns

[`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)

***

### close()

> **close**(): `void`

#### Returns

`void`

***

### createSession()

> **createSession**(`repo`, `title`): [`Session`](../../../shared/types/interfaces/Session.md)

#### Parameters

##### repo

`string`

##### title

`string`

#### Returns

[`Session`](../../../shared/types/interfaces/Session.md)

***

### createTask()

> **createTask**(`t`): [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

#### Parameters

##### t

###### input

`unknown`

###### kind

`string`

###### sessionId

`string`

#### Returns

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

***

### getArtifact()

> **getArtifact**\<`T`\>(`id`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### id

`string`

#### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

***

### getSession()

> **getSession**(`id`): [`Session`](../../../shared/types/interfaces/Session.md)

#### Parameters

##### id

`string`

#### Returns

[`Session`](../../../shared/types/interfaces/Session.md)

***

### getTask()

> **getTask**(`id`): [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

#### Parameters

##### id

`string`

#### Returns

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

***

### lastEventId()

> **lastEventId**(`sessionId`): `number`

#### Parameters

##### sessionId

`string`

#### Returns

`number`

***

### listArtifacts()

> **listArtifacts**(`sessionId`, `type?`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

#### Parameters

##### sessionId

`string`

##### type?

`string`

#### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

***

### listEvents()

> **listEvents**(`sessionId`, `afterId?`): [`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)[]

#### Parameters

##### sessionId

`string`

##### afterId?

`number` = `0`

#### Returns

[`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)[]

***

### listLinks()

> **listLinks**(`sessionId`): [`Link`](../../../shared/types/interfaces/Link.md)[]

#### Parameters

##### sessionId

`string`

#### Returns

[`Link`](../../../shared/types/interfaces/Link.md)[]

***

### listSessions()

> **listSessions**(): [`Session`](../../../shared/types/interfaces/Session.md)[]

#### Returns

[`Session`](../../../shared/types/interfaces/Session.md)[]

***

### listTasks()

> **listTasks**(`sessionId`): [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)[]

#### Parameters

##### sessionId

`string`

#### Returns

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)[]

***

### putArtifact()

> **putArtifact**\<`T`\>(`a`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

#### Type Parameters

##### T

`T`

#### Parameters

##### a

###### data

`T`

###### provenance

[`Provenance`](../../../shared/types/interfaces/Provenance.md)

###### sessionId

`string`

###### status

[`ArtifactStatus`](../../../shared/types/type-aliases/ArtifactStatus.md)

###### type

`string`

#### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

***

### putLink()

> **putLink**(`l`): [`Link`](../../../shared/types/interfaces/Link.md)

#### Parameters

##### l

###### from

`string`

###### kind

[`LinkKind`](../../../shared/types/type-aliases/LinkKind.md)

###### sessionId

`string`

###### to

`string`

#### Returns

[`Link`](../../../shared/types/interfaces/Link.md)

***

### updateTask()

> **updateTask**(`id`, `patch`): [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

#### Parameters

##### id

`string`

##### patch

###### error?

`string`

###### output?

`unknown`

###### status?

[`TaskStatus`](../../../shared/types/type-aliases/TaskStatus.md)

#### Returns

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)
