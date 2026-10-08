[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/implement/runtime/verify-stack](../README.md) / verifyStack

# Function: verifyStack()

> **verifyStack**(`git`, `currentBranch`, `check`): `Promise`\<\{ `head`: `string`; `problems`: `string`[]; \}\>

Deterministic check of the branch after an agent run: on the branch, descends from the base, matches the plan and the profile's message rule, work tree clean. Returns the tip and the problems to hand back to the agent.

## Parameters

### git

`Pick`\<[`GitCapability`](../../../../../runtime/tasks/interfaces/GitCapability.md), `"resolve"` \| `"isAncestor"` \| `"isDirty"` \| `"log"`\>

### currentBranch

`string` \| `null`

### check

[`StackCheck`](../interfaces/StackCheck.md)

## Returns

`Promise`\<\{ `head`: `string`; `problems`: `string`[]; \}\>
