[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/steers](../README.md) / steerOutcome

# Function: steerOutcome()

> **steerOutcome**(`artifacts`, `epoch`): `"resumed"` \| `"restarted"` \| `null`

Whether the run after the epoch's newest stop steer resumed the stopped agent session: read from the first agent session that follows the steer (later sessions resume for verification retries too). Null until one exists.

## Parameters

### artifacts

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

### epoch

`number` \| `null`

## Returns

`"resumed"` \| `"restarted"` \| `null`
