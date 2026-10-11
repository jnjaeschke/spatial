[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / Plugin

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

### dependsOn?

> `optional` **dependsOn?**: `string`[]

Ids of the plugins this one imports the public API of (`src/plugins/<id>/api.ts`, `src/plugins/<id>/web/api.ts`); each must be registered, and the graph must have no cycle. Write it as a literal array in the manifest: `scripts/plugin-boundary.ts` reads it statically.

***

### id

> **id**: `string`

***

### phases?

> `optional` **phases?**: [`Phase`](../../tasks/interfaces/Phase.md)\<`any`\>[]

***

### repoProfiles?

> `optional` **repoProfiles?**: [`RepoProfile`](RepoProfile.md)[]

Repo profiles this plugin contributes; ids are unique across plugins.

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
