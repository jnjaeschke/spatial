[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/shared/types](../README.md) / AdoptPlanData

# Interface: AdoptPlanData

What an adopt can take over (artifact `AdoptPlan`, verified). `diffs` contains every Phabricator diff for trailer revisions; `missingBases` are diff bases absent locally; history errors preserve local adoption without rounds.

## Properties

### branches

> **branches**: [`AdoptBranch`](AdoptBranch.md)[]

***

### diffs

> **diffs**: [`RoundDiff`](../../../../review/api/interfaces/RoundDiff.md)[]

***

### historyError

> **historyError**: `string` \| `null`

***

### host

> **host**: `string` \| `null`

***

### missingBases

> **missingBases**: `string`[]

***

### mode

> **mode**: [`AdoptMode`](../type-aliases/AdoptMode.md)

***

### refError

> **refError**: `string` \| `null`

***

### revisions

> **revisions**: `object`[]

#### id

> **id**: `number`

#### latestDiffId

> **latestDiffId**: `number`

#### title

> **title**: `string`
