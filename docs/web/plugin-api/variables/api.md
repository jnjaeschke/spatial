[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / api

# Variable: api

> `const` **api**: `object`

## Type Declaration

### answerStart

> **answerStart**: (`question`, `answer`) => `Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

#### Parameters

##### question

`string`

##### answer

`string` \| `number`

#### Returns

`Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

### cancel

> **cancel**: (`taskId`) => `Promise`\<`void`\>

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<`void`\>

### decide

> **decide**: (`sessionId`, `decisionId`, `option`, `body`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### decisionId

`string`

##### option

`string`

##### body?

###### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

###### text?

`string`

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

### deleteSession

> **deleteSession**: (`sessionId`) => `Promise`\<`void`\>

#### Parameters

##### sessionId

`string`

#### Returns

`Promise`\<`void`\>

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

### models

> **models**: () => `Promise`\<[`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md)\>

#### Returns

`Promise`\<[`ModelsResponse`](../../../shared/types/interfaces/ModelsResponse.md)\>

### note

> **note**: (`sessionId`, `body`) => `Promise`\<\{ `artifactId`: `string`; \}\>

#### Parameters

##### sessionId

`string`

##### body

`string`

#### Returns

`Promise`\<\{ `artifactId`: `string`; \}\>

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

### sessions

> **sessions**: () => `Promise`\<[`SessionListing`](../../../shared/types/interfaces/SessionListing.md)[]\>

#### Returns

`Promise`\<[`SessionListing`](../../../shared/types/interfaces/SessionListing.md)[]\>

### start

> **start**: (`path`, `text`, `llm`, `writeMode`) => `Promise`\<[`StartQuestion`](../../../shared/types/interfaces/StartQuestion.md) \| [`Session`](../../../shared/types/interfaces/Session.md)\>

#### Parameters

##### path

`string`

##### text

`string`

##### llm

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

##### writeMode

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

### taskActivity

> **taskActivity**: (`sessionId`, `taskId`) => `Promise`\<[`TaskActivityResponse`](../../../shared/types/interfaces/TaskActivityResponse.md)\>

#### Parameters

##### sessionId

`string`

##### taskId

`string`

#### Returns

`Promise`\<[`TaskActivityResponse`](../../../shared/types/interfaces/TaskActivityResponse.md)\>

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

### usage

> **usage**: () => `Promise`\<[`UsageRun`](../../../shared/types/interfaces/UsageRun.md)[]\>

#### Returns

`Promise`\<[`UsageRun`](../../../shared/types/interfaces/UsageRun.md)[]\>

### workflows

> **workflows**: () => `Promise`\<[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md)[]\>

#### Returns

`Promise`\<[`WorkflowInfo`](../../../shared/types/interfaces/WorkflowInfo.md)[]\>
