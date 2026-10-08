[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/implement/runtime/verify-stack](../README.md) / StackCheck

# Interface: StackCheck

What the stack must satisfy. `plan` is null when it is not enforced (resumed branches); `planChange` is the agent's reported reason for deviating.

## Properties

### baseSha

> **baseSha**: `string`

***

### branch

> **branch**: `string`

***

### plan

> **plan**: `object`[] \| `null`

***

### planChange

> **planChange**: `string` \| `null`

***

### profile

> **profile**: `Pick`\<[`RepoProfile`](../../../../../runtime/plugins/interfaces/RepoProfile.md), `"commitStyle"` \| `"messageCheck"`\>
