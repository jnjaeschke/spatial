[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/gecko/shared/types](../README.md) / PhabSubmissionData

# Interface: PhabSubmissionData

A submission to Phabricator (artifact `PhabSubmission`, verified): the command that ran, the tip after moz-phab amended the commits, and each commit's revision.

## Properties

### command

> **command**: `string`

***

### head

> **head**: `string`

***

### revisions

> **revisions**: `object`[]

#### sha

> **sha**: `string`

#### subject

> **subject**: `string`

#### url

> **url**: `string`
