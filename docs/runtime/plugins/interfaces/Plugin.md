[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / Plugin

# Interface: Plugin

A packaging unit that contributes runtime behavior.

## Properties

### artifactKinds?

> `optional` **artifactKinds?**: `Record`\<`string`, [`ArtifactKind`](ArtifactKind.md)\>

Artifact implementations keyed by artifact type.

***

### chatReplyFields?

> `optional` **chatReplyFields?**: [`ChatReplyField`](ChatReplyField.md)[]

Additional structured fields accepted on chat replies.

***

### id

> **id**: `string`

***

### phases?

> `optional` **phases?**: [`Phase`](../../tasks/interfaces/Phase.md)\<`any`\>[]

Phases contributed by this plugin.

***

### searchKinds?

> `optional` **searchKinds?**: `string`[]

Search document kinds produced by this plugin.

***

### tasks?

> `optional` **tasks?**: [`TaskDefinition`](../../tasks/interfaces/TaskDefinition.md)\<`any`, `any`\>[]

Tasks contributed by this plugin.

***

### workflows?

> `optional` **workflows?**: [`Workflow`](Workflow.md)\<`any`\>[]

Workflows contributed by this plugin.

## Methods

### chatContext()?

> `optional` **chatContext**(`view`): `string` \| `null`

Extra context appended after the session overview in chat.

#### Parameters

##### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

#### Returns

`string` \| `null`

***

### server()?

> `optional` **server**(`rt`, `opts`): [`PluginServer`](PluginServer.md)

Builds server routes and services once per HTTP server.

#### Parameters

##### rt

[`Runtime`](../../tasks/classes/Runtime.md)

##### opts

###### intervalMs?

`number`

#### Returns

[`PluginServer`](PluginServer.md)
