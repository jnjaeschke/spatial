[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/store](../README.md) / Store

# Class: Store

Dumb persistence. Emits no events; the Runtime does that.

## Constructors

### Constructor

> **new Store**(`path`, `opts?`): `Store`

#### Parameters

##### path

`string`

##### opts?

###### readOnly?

`boolean`

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

### createEpoch()

> **createEpoch**(`sessionId`, `phase`, `input`): [`Epoch`](../../../shared/types/interfaces/Epoch.md)

#### Parameters

##### sessionId

`string`

##### phase

`string`

##### input

`unknown`

#### Returns

[`Epoch`](../../../shared/types/interfaces/Epoch.md)

***

### createSession()

> **createSession**(`fields`): [`Session`](../../../shared/types/interfaces/Session.md)

#### Parameters

##### fields

###### repoDir

`string`

###### title

`string`

###### workflow?

`string`

###### worktree

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

###### parentId?

`string`

###### sessionId

`string`

#### Returns

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

***

### failInterrupted()

> **failInterrupted**(`reason`): `void`

Fails every running epoch and pending or running task with `reason`. Only a server process that just started may call it: they belong to a process that died.

#### Parameters

##### reason

`string`

#### Returns

`void`

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

### getEpoch()

> **getEpoch**(`sessionId`, `n`): [`Epoch`](../../../shared/types/interfaces/Epoch.md)

#### Parameters

##### sessionId

`string`

##### n

`number`

#### Returns

[`Epoch`](../../../shared/types/interfaces/Epoch.md)

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

### listActiveTasks()

> **listActiveTasks**(`kind`): [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)[]

Pending and running tasks of `kind` in every session.

#### Parameters

##### kind

`string`

#### Returns

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)[]

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

### listEpochs()

> **listEpochs**(`sessionId`): [`Epoch`](../../../shared/types/interfaces/Epoch.md)[]

#### Parameters

##### sessionId

`string`

#### Returns

[`Epoch`](../../../shared/types/interfaces/Epoch.md)[]

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

### listEventsOfType()

> **listEventsOfType**(`type`): [`RuntimeEvent`](../../../shared/types/interfaces/RuntimeEvent.md)[]

Every session's events of `type`, oldest first.

#### Parameters

##### type

`string`

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

### listTaskActivity()

> **listTaskActivity**(`sessionId`, `taskId`): [`LlmActivity`](../../../shared/types/type-aliases/LlmActivity.md)[]

Everything `taskId`'s LLM runs reported as activity, oldest first.

#### Parameters

##### sessionId

`string`

##### taskId

`string`

#### Returns

[`LlmActivity`](../../../shared/types/type-aliases/LlmActivity.md)[]

***

### listTaskProgress()

> **listTaskProgress**(`sessionId`, `taskId`, `limit`): [`Progress`](../../../shared/types/type-aliases/Progress.md)[]

The last `limit` progress values `taskId` reported, oldest first.

#### Parameters

##### sessionId

`string`

##### taskId

`string`

##### limit

`number`

#### Returns

[`Progress`](../../../shared/types/type-aliases/Progress.md)[]

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

Stores an artifact in the session's latest epoch unless `epoch` names another.

#### Type Parameters

##### T

`T`

#### Parameters

##### a

###### data

`T`

###### epoch?

`number` \| `null`

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

### putSearchDocs()

> **putSearchDocs**(`sessionId`, `artifactId`, `docs`): `void`

#### Parameters

##### sessionId

`string`

##### artifactId

`string`

##### docs

[`SearchDoc`](../../render-ref/interfaces/SearchDoc.md)[]

#### Returns

`void`

***

### search()

> **search**(`sessionId`, `query`, `opts?`): `object`[]

#### Parameters

##### sessionId

`string`

##### query

`string`

##### opts?

###### kinds?

`string`[]

###### limit?

`number`

#### Returns

`object`[]

***

### setSessionStart()

> **setSessionStart**(`id`, `workflow`, `title`): [`Session`](../../../shared/types/interfaces/Session.md)

Records the chosen workflow and the session title.

#### Parameters

##### id

`string`

##### workflow

`string`

##### title

`string`

#### Returns

[`Session`](../../../shared/types/interfaces/Session.md)

***

### unindexedArtifactIds()

> **unindexedArtifactIds**(): `string`[]

#### Returns

`string`[]

***

### updateEpoch()

> **updateEpoch**(`sessionId`, `n`, `patch`): [`Epoch`](../../../shared/types/interfaces/Epoch.md)

#### Parameters

##### sessionId

`string`

##### n

`number`

##### patch

###### error?

`string` \| `null`

###### status

[`EpochStatus`](../../../shared/types/type-aliases/EpochStatus.md)

#### Returns

[`Epoch`](../../../shared/types/interfaces/Epoch.md)

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
