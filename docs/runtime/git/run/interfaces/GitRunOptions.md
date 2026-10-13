[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/run](../README.md) / GitRunOptions

# Interface: GitRunOptions

## Properties

### env?

> `optional` **env?**: `Record`\<`string`, `string`\>

Added to the process environment.

***

### signal?

> `optional` **signal?**: `AbortSignal`

Kills git and rejects the run when aborted.

***

### timeout?

> `optional` **timeout?**: `number`

Milliseconds before git is killed and the run rejects.
