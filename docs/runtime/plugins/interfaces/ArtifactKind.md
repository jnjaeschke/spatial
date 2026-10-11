[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / ArtifactKind

# Interface: ArtifactKind

What core needs to treat one artifact type generically.

## Methods

### render()?

> `optional` **render**(`view`, `artifact`, `subId`, `renderRef`): `string` \| `null`

Markdown for the artifact or one of its subrefs; null when unknown. `renderRef` renders another ref.

#### Parameters

##### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

##### artifact

[`Artifact`](../../../shared/types/interfaces/Artifact.md)

##### subId

`string` \| `undefined`

##### renderRef

(`ref`) => `string`

#### Returns

`string` \| `null`

***

### search()?

> `optional` **search**(`view`, `artifact`): [`SearchDoc`](../../render-ref/interfaces/SearchDoc.md)[]

Search index entries for the artifact; `kind` of each doc must be in the plugin's `searchKinds`.

#### Parameters

##### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

##### artifact

[`Artifact`](../../../shared/types/interfaces/Artifact.md)

#### Returns

[`SearchDoc`](../../render-ref/interfaces/SearchDoc.md)[]
