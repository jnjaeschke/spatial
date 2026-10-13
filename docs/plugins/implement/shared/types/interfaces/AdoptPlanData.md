[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/shared/types](../README.md) / AdoptPlanData

# Interface: AdoptPlanData

What an adopt can take over (artifact `AdoptPlan`, verified). `diffs`: every Phabricator diff of the revisions named by trailers in the branches' commits; `missingBases`: diff bases not in the repository; `refError`: why the named branch was not used; `historyError`: why the Phabricator history could not be read (no arcrc token, Conduit down); the adopt then goes on without rounds.

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
