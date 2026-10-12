[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/gecko/runtime/try-watcher](../README.md) / TryWatcher

# Class: TryWatcher

Polls Treeherder for every try push whose last observed state is not complete and that is younger than 24 hours, in all sessions, and stores a `TryRun` when the state changed. Reads everything it needs from the store, so a restarted server resumes.

## Constructors

### Constructor

> **new TryWatcher**(`rt`, `opts?`): `TryWatcher`

#### Parameters

##### rt

`Pick`\<[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md), `"store"` \| `"emit"`\>

##### opts?

###### intervalMs?

`number`

###### now?

() => `number`

###### status?

(`pushId`) => `Promise`\<`Record`\<`string`, `number`\>\>

###### treeherder?

(`url`) => `Promise`\<\{ `code`: `number`; `stderr`: `string`; `stdout`: `string`; \}\>

#### Returns

`TryWatcher`

## Methods

### start()

> **start**(): `void`

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

#### Returns

`Promise`\<`void`\>
