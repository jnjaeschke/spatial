[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / RepoProfile

# Interface: RepoProfile

How to work in one kind of repository. Plugins contribute profiles; workflows pick one per session.

## Properties

### afterAccept?

> `optional` **afterAccept?**: `string`[]

Phase ids run in order right after the user accepts; a phase with an outside effect asks first through its own `Phase.next`.

***

### autoFixRounds?

> `optional` **autoFixRounds?**: `number`

Automatic fix rounds before the user is asked; default 2, 0 always asks.

***

### buildCommand?

> `optional` **buildCommand?**: `string`

Shell command that builds the project; edits-only runs it before the tests and reports its failure as its own problem.

***

### commitStyle

> **commitStyle**: `"single"` \| `"stack"`

***

### description

> **description**: `string`

Shown to the workflow selector LLM.

***

### engine?

> `optional` **engine?**: `string`

The browser engine whose source tree this repo is (an `Engine` id of the spec plugin).

***

### id

> **id**: `string`

***

### investigatePhase?

> `optional` **investigatePhase?**: `string`

Phase id that investigates; default `investigate`.

***

### promptNotes?

> `optional` **promptNotes?**: `string`

Repo-specific tool hints appended to LLM prompts that work in the repo.

***

### requiresBug?

> `optional` **requiresBug?**: `boolean`

A bug number is given or asked for, never invented.

***

### upstreamBranch?

> `optional` **upstreamBranch?**: `string`

The branch code links pin to: a diff base's merge-base with it is the diff's upstream revision.

## Methods

### detect()?

> `optional` **detect**(`repo`): `Promise`\<`boolean`\>

Deterministic hint that the work tree root `repo` is this kind of repository.

#### Parameters

##### repo

`string`

#### Returns

`Promise`\<`boolean`\>

***

### fetchBug()?

> `optional` **fetchBug**(`id`, `ctx`): `Promise`\<`string` \| `null`\>

The markdown of bug `id` from the repo's bug tracker; `repoMcp` holds the repo's MCP servers. Null when this checkout has no access to the tracker; throws when the bug cannot be fetched.

#### Parameters

##### id

`string`

##### ctx

###### repoMcp

`Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

###### signal

`AbortSignal`

#### Returns

`Promise`\<`string` \| `null`\>

***

### isTestCommand()?

> `optional` **isTestCommand**(`command`): `boolean`

Whether a shell command runs tests (shown as a pass/fail chip).

#### Parameters

##### command

`string`

#### Returns

`boolean`

***

### messageCheck()?

> `optional` **messageCheck**(`message`): `string` \| `null`

Null when the commit subject is acceptable, else what is wrong.

#### Parameters

##### message

`string`

#### Returns

`string` \| `null`

***

### testCommand()?

> `optional` **testCommand**(`paths`): `string`

Shell command that runs the tests at `paths`; its presence makes edits-only mode available. It runs through `sh -c` and the paths come from the investigation, so implementations must shell-quote them.

#### Parameters

##### paths

`string`[]

#### Returns

`string`
