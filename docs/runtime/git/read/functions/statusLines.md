[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/read](../README.md) / statusLines

# Function: statusLines()

> **statusLines**(`repo`, `signal?`): `Promise`\<`string`[]\>

Lines of `git status --porcelain` (staged, unstaged and untracked non-ignored changes). Runs with `--no-optional-locks`, so the index file is not refreshed.

## Parameters

### repo

`string`

### signal?

`AbortSignal`

## Returns

`Promise`\<`string`[]\>
