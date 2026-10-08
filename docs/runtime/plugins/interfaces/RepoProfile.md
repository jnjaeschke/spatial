[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / RepoProfile

# Interface: RepoProfile

How to work in one kind of repository. Plugins contribute profiles; workflows pick one per session.

## Properties

### afterAccept?

> `optional` **afterAccept?**: `string`[]

Phase ids run in order after the user accepts, each behind its own decision.

***

### autoFixRounds?

> `optional` **autoFixRounds?**: `number`

Automatic fix rounds before the user is asked; default 2, 0 always asks.

***

### commitStyle

> **commitStyle**: `"stack"` \| `"single"`

***

### description

> **description**: `string`

Shown to the workflow selector LLM.

***

### id

> **id**: `string`

***

### investigatePhase?

> `optional` **investigatePhase?**: `string`

Phase id that investigates; default `investigate`.

***

### requiresBug?

> `optional` **requiresBug?**: `boolean`

A bug number is given or asked for, never invented.

***

### suggestReviewers?

> `optional` **suggestReviewers?**: `string`

Command that suggests reviewers for the changed files.

## Methods

### checkCommand()?

> `optional` **checkCommand**(`paths`): `string`

Shell command that builds and runs the tests covering `paths`; its presence makes edits-only mode available.

#### Parameters

##### paths

`string`[]

#### Returns

`string`

***

### detect()?

> `optional` **detect**(`repo`): `Promise`\<`boolean`\>

Deterministic hint that the work tree root `repo` is this kind of repository.

#### Parameters

##### repo

`string`

#### Returns

`Promise`\<`boolean`\>

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
