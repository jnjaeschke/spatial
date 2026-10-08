[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/implement/runtime/test-first](../README.md) / testFirstProblems

# Function: testFirstProblems()

> **testFirstProblems**(`plan`, `runs`, `profile`): `string`[]

Test-first evidence from recorded commands, no extra builds: for each plan step that lists `tests`, the test commands (per the profile's `isTestCommand`) that mention one of its paths must include a failing run followed by a passing run, and the last of them must pass. Skipped for a profile without `isTestCommand`. Which commit holds the test is the plan's business.

## Parameters

### plan

`object`[]

### runs

[`CommandEvidence`](../interfaces/CommandEvidence.md)[]

### profile

`Pick`\<[`RepoProfile`](../../../../../runtime/plugins/interfaces/RepoProfile.md), `"isTestCommand"`\>

## Returns

`string`[]
