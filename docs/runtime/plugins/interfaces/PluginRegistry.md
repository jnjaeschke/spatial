[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / PluginRegistry

# Interface: PluginRegistry

Contributions of a plugin list merged by `pluginRegistry`, which throws on duplicate ids.

## Properties

### artifactKinds

> **artifactKinds**: `Record`\<`string`, [`ArtifactKind`](ArtifactKind.md)\>

***

### chatContext

> **chatContext**: (`view`) => `string` \| `null`[]

#### Parameters

##### view

[`SessionView`](../../render-ref/interfaces/SessionView.md)

#### Returns

`string` \| `null`

***

### chatReplyFields

> **chatReplyFields**: [`ChatReplyField`](ChatReplyField.md)[]

***

### mcpTools

> **mcpTools**: [`McpTool`](McpTool.md)\<`Readonly`\<\{\[`k`: `string`\]: `$ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>; \}\>\>[]

***

### phases

> **phases**: `Map`\<`string`, [`Phase`](../../tasks/interfaces/Phase.md)\<`any`\>\>

***

### plugins

> **plugins**: [`Plugin`](Plugin.md)[]

***

### repoProfiles

> **repoProfiles**: `Map`\<`string`, [`RepoProfile`](RepoProfile.md)\>

***

### searchKinds

> **searchKinds**: `string`[]

***

### tasks

> **tasks**: `Map`\<`string`, [`TaskDefinition`](../../tasks/interfaces/TaskDefinition.md)\<`any`, `any`\>\>

***

### workflows

> **workflows**: `Map`\<`string`, [`Workflow`](Workflow.md)\<`any`\>\>
