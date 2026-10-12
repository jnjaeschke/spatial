[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/steers](../README.md) / steerPlan

# Function: steerPlan()

> **steerPlan**(`artifacts`, `epoch`): `object`

What a restarted run of `epoch` is told: every steer of the epoch for a fresh prompt, and, when the epoch's latest agent session is older than a steer, that session with the steers it has not seen. A run without a new steer therefore starts fresh and never repeats a steer the session already has.

## Parameters

### artifacts

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

### epoch

`number` \| `null`

## Returns

`object`

### all

> **all**: `string`[]

### resume

> **resume**: \{ `providerSessionId`: `string`; `steers`: `string`[]; \} \| `null`
