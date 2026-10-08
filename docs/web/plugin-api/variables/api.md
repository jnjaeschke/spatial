[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / api

# Variable: api

> `const` **api**: `object`

## Type Declaration

### answerSelector

> **answerSelector**: (`sessionId`, `text`, `llm`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### text

`string`

##### llm

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### cancel

> **cancel**: (`taskId`) => `Promise`\<`void`\>

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<`void`\>

### decide

> **decide**: (`sessionId`, `decisionId`, `option`, `body?`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### decisionId

`string`

##### option

`string`

##### body?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md) \| \{ `llm?`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); `text?`: `string`; \}

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### dirs

> **dirs**: (`path?`) => `Promise`\<[`DirectoryListing`](../../../shared/types/interfaces/DirectoryListing.md)\>

#### Parameters

##### path?

`string`

#### Returns

`Promise`\<[`DirectoryListing`](../../../shared/types/interfaces/DirectoryListing.md)\>

### enableMcpServer

> **enableMcpServer**: (`sessionId`, `threadId`, `server`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### threadId

`string`

##### server

`string`

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### mapSpecSteps

> **mapSpecSteps**: (`sessionId`, `specId`, `llm`) => `Promise`\<\{ `taskId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### specId

`string`

##### llm

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

#### Returns

`Promise`\<\{ `taskId`: `string`; \}\>

### models

> **models**: () => `Promise`\<[`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md)\>

#### Returns

`Promise`\<[`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md)\>

### narrate

> **narrate**: (`id`, `body`) => `Promise`\<\{ \}\>

#### Parameters

##### id

`string`

##### body

###### llm

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

#### Returns

`Promise`\<\{ \}\>

### note

> **note**: (`sessionId`, `body`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### body

`string`

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### postDrafts

> **postDrafts**: (`sessionId`) => `Promise`\<\{ `posted`: `number`; `revision`: `string`; `skipped`: `object`[]; \}\>

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<\{ `posted`: `number`; `revision`: `string`; `skipped`: `object`[]; \}\>

### regenerateComment

> **regenerateComment**: (`sessionId`, `findingId`, `llm?`) => `Promise`\<\{ `taskId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### findingId

`string`

##### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

#### Returns

`Promise`\<\{ `taskId`: `string`; \}\>

### repo

> **repo**: (`path`) => `Promise`\<[`RepoInfo`](../../../shared/types/interfaces/RepoInfo.md)\>

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`RepoInfo`](../../../shared/types/interfaces/RepoInfo.md)\>

### repos

> **repos**: () => `Promise`\<[`RecentRepo`](../../../shared/types/interfaces/RecentRepo.md)[]\>

#### Returns

`Promise`\<[`RecentRepo`](../../../shared/types/interfaces/RecentRepo.md)[]\>

### retry

> **retry**: (`sessionId`) => `Promise`\<\{ \}\>

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<\{ \}\>

### runAction

> **runAction**: (`path`) => `Promise`\<`unknown`\>

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`unknown`\>

### saveComment

> **saveComment**: (`sessionId`, `findingId`, `body`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### findingId

`string`

##### body

`string`

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### sessions

> **sessions**: () => `Promise`\<[`Session`](../../../shared/types/interfaces/Session.md)[]\>

#### Returns

`Promise`\<[`Session`](../../../shared/types/interfaces/Session.md)[]\>

### setReviewed

> **setReviewed**: (`sessionId`, `narrativeId`, `changeId`, `reviewed`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### narrativeId

`string`

##### changeId

`string`

##### reviewed

`boolean`

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### start

> **start**: (`path`, `text`, `llm`, `opts`) => `Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

#### Parameters

##### path

`string`

##### text

`string`

##### llm

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

##### opts?

###### answer?

`number`

###### writeMode?

[`WriteMode`](../../../shared/types/type-aliases/WriteMode.md)

#### Returns

`Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

### state

> **state**: (`id`) => `Promise`\<[`SessionState`](../../../shared/types/interfaces/SessionState.md)\>

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`SessionState`](../../../shared/types/interfaces/SessionState.md)\>

### turn

> **turn**: (`sessionId`, `body`) => `Promise`\<\{ `taskId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### body

###### anchor?

`string`

###### lines?

\{ `end`: `number`; `path`: `string`; `side`: `"new"` \| `"old"`; `start`: `number`; \}

###### lines.end

`number`

###### lines.path

`string`

###### lines.side

`"new"` \| `"old"`

###### lines.start

`number`

###### llm

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

###### quote?

`string`

###### text

`string`

###### threadId?

`string`

#### Returns

`Promise`\<\{ `taskId`: `string`; \}\>

### workflows

> **workflows**: () => `Promise`\<[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md)[]\>

#### Returns

`Promise`\<[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md)[]\>
