[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/revision-watcher](../README.md) / RevisionWatcher

# Class: RevisionWatcher

Announces new head SHAs of the refs a session imported. Polls only sessions with a live subscriber; never imports.

## Constructors

### Constructor

> **new RevisionWatcher**(`rt`, `opts?`): `RevisionWatcher`

#### Parameters

##### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

##### opts?

###### intervalMs?

`number`

#### Returns

`RevisionWatcher`

## Methods

### start()

> **start**(): `void`

Runs `tick` every `intervalMs` (timer is unref'd).

#### Returns

`void`

***

### stop()

> **stop**(): `void`

#### Returns

`void`

***

### tick()

> **tick**(): `Promise`\<`void`\>

One polling pass; resolves when done. Never rejects.

#### Returns

`Promise`\<`void`\>

***

### watch()

> **watch**(`sessionId`): () => `void`

Marks `sessionId` as watched (reference counted) until the returned function is called.

#### Parameters

##### sessionId

`string`

#### Returns

() => `void`

***

### watchedSessions()

> **watchedSessions**(): `string`[]

Watched session ids, once each, in subscription order.

#### Returns

`string`[]
