[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / WebPlugin

# Interface: WebPlugin

## Properties

### conversationItems?

> `optional` **conversationItems?**: `Record`\<`string`, `ComponentType`\<[`ConversationItemProps`](ConversationItemProps.md)\>\>

***

### conversationTasks?

> `optional` **conversationTasks?**: `string`[]

***

### id

> **id**: `string`

***

### nodeKinds?

> `optional` **nodeKinds?**: `Record`\<`string`, [`NodeKind`](NodeKind.md)\>

***

### phaseViews

> **phaseViews**: `Record`\<`string`, [`PhaseView`](PhaseView.md)\>

***

### replyActions?

> `optional` **replyActions?**: `Record`\<`string`, `ComponentType`\<[`ReplyActionProps`](ReplyActionProps.md)\>\>

***

### repoPanels?

> `optional` **repoPanels?**: `ComponentType`\<[`RepoPanelProps`](RepoPanelProps.md)\>[]

***

### repoViews?

> `optional` **repoViews?**: [`PluginRepoView`](PluginRepoView.md)[]

***

### sessionProviders?

> `optional` **sessionProviders?**: `ComponentType`\<\{ `children`: `ReactNode`; `readOnly`: `boolean`; `state`: [`SessionState`](../../../shared/types/interfaces/SessionState.md); \}\>[]

***

### sessionViews?

> `optional` **sessionViews?**: [`PluginSessionView`](PluginSessionView.md)[]

***

### steer?

> `optional` **steer?**: `Record`\<`string`, (`sessionId`, `text`, `live`) => `Promise`\<`unknown`\>\>

***

### taskBadges?

> `optional` **taskBadges?**: `Record`\<`string`, `ComponentType`\<\{ `task`: [`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md); \}\>\>

***

### taskLabels?

> `optional` **taskLabels?**: `Record`\<`string`, `string`\>

***

### workflowPhase?

> `optional` **workflowPhase?**: `Record`\<`string`, `string`\>
