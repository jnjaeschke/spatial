[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / runGit

# Variable: runGit

> `const` **runGit**: (`repo`, `args`, `env?`, `timeout?`) => `Promise`\<`string`\> = `git`

Runs git in `repo` with the settings every read here uses; resolves with stdout and rejects with git's error.

## Parameters

### repo

`string`

### args

`string`[]

### env?

`Record`\<`string`, `string`\>

### timeout?

`number`

## Returns

`Promise`\<`string`\>
