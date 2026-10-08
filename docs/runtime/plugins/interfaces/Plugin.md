[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / Plugin

# Interface: Plugin

A packaging unit; contributes any mix of these. Artifact kinds are keyed by artifact type.

## Properties

### artifactKinds?

> `optional` **artifactKinds?**: `Record`\<`string`, [`ArtifactKind`](ArtifactKind.md)\>

***

### chatReplyFields?

> `optional` **chatReplyFields?**: [`ChatReplyField`](ChatReplyField.md)[]

Extra fields of the structured chat reply.

***

### id

> **id**: `string`

***

### phases?

> `optional` **phases?**: [`Phase`](../../tasks/interfaces/Phase.md)\<`any`\>[]

***

### searchKinds?

> `optional` **searchKinds?**: `string`[]

***

### tasks?

> `optional` **tasks?**: [`TaskDefinition`](../../tasks/interfaces/TaskDefinition.md)\<`any`, `any`\>[]

***

### workflows?

> `optional` **workflows?**: [`Workflow`](Workflow.md)\<`any`\>[]

## Methods

### chatContext()?

> `optional` **chatContext**(`view`): `string` \| `null`

Extra chat context after the session overview; null when it has none for this session.

#### Parameters

##### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

#### Returns

`string` \| `null`

***

### server()?

> `optional` **server**(`rt`, `opts`): [`PluginServer`](PluginServer.md)

#### Parameters

##### rt

[`Runtime`](../../tasks/classes/Runtime.md)

##### opts

###### intervalMs?

`number`

#### Returns

[`PluginServer`](PluginServer.md)
