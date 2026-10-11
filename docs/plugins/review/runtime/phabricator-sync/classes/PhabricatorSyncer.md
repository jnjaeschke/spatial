[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/phabricator-sync](../README.md) / PhabricatorSyncer

# Class: PhabricatorSyncer

Slow poll of the Phabricator revision of watched sessions. Imports comments, announces newer diffs. Never touches git or the checkout.

## Constructors

### Constructor

> **new PhabricatorSyncer**(`rt`, `watcher`, `opts?`): `PhabricatorSyncer`

#### Parameters

##### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

##### watcher

`Pick`\<[`RevisionWatcher`](../../revision-watcher/classes/RevisionWatcher.md), `"watchedSessions"`\>

##### opts?

###### intervalMs?

`number`

###### makeConduit?

(`host`) => [`ConduitClient`](../../conduit/classes/ConduitClient.md)

#### Returns

`PhabricatorSyncer`

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
