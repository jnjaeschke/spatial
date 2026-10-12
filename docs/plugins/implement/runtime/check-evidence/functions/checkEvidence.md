[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/check-evidence](../README.md) / checkEvidence

# Function: checkEvidence()

> **checkEvidence**(`plan`, `runs`, `__namedParameters`): `object`

Judges the plan's acceptance checks from the commands of one implement epoch. `first` is the epoch that starts the work; later epochs only need a passing last run for checks they ran. A test check is judged only when the profile can tell test commands (`isTestCommand`). A `measure` is never a problem: its result only reports the runs found. Problems go back to the agent; results go into a `CheckResults` artifact.

## Parameters

### plan

`object`[]

### runs

[`CommandEvidence`](../interfaces/CommandEvidence.md)[]

### \_\_namedParameters

#### first

`boolean`

#### profile

`Pick`\<[`RepoProfile`](../../../../../runtime/plugins/interfaces/RepoProfile.md), `"isTestCommand"`\>

## Returns

`object`

### problems

> **problems**: `string`[]

### results

> **results**: [`CheckResult`](../../../shared/types/interfaces/CheckResult.md)[]
