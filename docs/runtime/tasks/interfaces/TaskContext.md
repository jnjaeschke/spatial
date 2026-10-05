[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/tasks](../README.md) / TaskContext

# Interface: TaskContext

Everything a task may touch. Tasks get capabilities only through this.

## Properties

### artifacts

> **artifacts**: `object`

#### get()

> **get**\<`T`\>(`id`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

##### Type Parameters

###### T

`T`

##### Parameters

###### id

`string`

##### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

#### linkedTo()

> **linkedTo**(`to`, `kind`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

##### Parameters

###### to

`string`

###### kind

[`LinkKind`](../../../shared/types/type-aliases/LinkKind.md)

##### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

#### put()

> **put**\<`T`\>(`type`, `status`, `data`, `llm?`): [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

##### Type Parameters

###### T

`T`

##### Parameters

###### type

`string`

###### status

[`ArtifactStatus`](../../../shared/types/type-aliases/ArtifactStatus.md)

###### data

`T`

###### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

##### Returns

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`T`\>

***

### git

> **git**: [`GitCapability`](GitCapability.md)

***

### links

> **links**: `object`

#### put()

> **put**(`from`, `to`, `kind`): [`Link`](../../../shared/types/interfaces/Link.md)

##### Parameters

###### from

`string`

###### to

`string`

###### kind

[`LinkKind`](../../../shared/types/type-aliases/LinkKind.md)

##### Returns

[`Link`](../../../shared/types/interfaces/Link.md)

***

### llm

> **llm**: `object`

#### run()

> **run**(`prompt`, `selection?`): `Promise`\<[`LlmRunResult`](../../llm/types/interfaces/LlmRunResult.md)\>

##### Parameters

###### prompt

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md)

###### selection?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

##### Returns

`Promise`\<[`LlmRunResult`](../../llm/types/interfaces/LlmRunResult.md)\>

***

### repo

> **repo**: `string`

***

### searchfox

> **searchfox**: [`SearchfoxCapability`](SearchfoxCapability.md)

***

### sessionId

> **sessionId**: `string`

***

### signal

> **signal**: `AbortSignal`

***

### taskId

> **taskId**: `string`

***

### webspec

> **webspec**: [`WebspecCapability`](WebspecCapability.md)

## Methods

### progress()

> **progress**(`p`): `void`

#### Parameters

##### p

[`Progress`](../../../shared/types/type-aliases/Progress.md)

#### Returns

`void`
