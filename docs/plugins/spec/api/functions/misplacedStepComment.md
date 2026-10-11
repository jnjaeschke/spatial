[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / misplacedStepComment

# Function: misplacedStepComment()

> **misplacedStepComment**(`check`, `spec`, `steps`, `covering`): [`StepProblem`](../type-aliases/StepProblem.md) \| `null`

A Step comment whose block the step map links only to unrelated steps (neither step N, its substeps nor its ancestors); `covering` are the links covering the block's new-side lines.

## Parameters

### check

[`StepCommentCheck`](../../../../runtime/tasks/interfaces/StepCommentCheck.md)

### spec

`string`

### steps

[`SpecStep`](../../shared/steps/interfaces/SpecStep.md)[]

### covering

[`StepLink`](../../shared/types/interfaces/StepLink.md)[]

## Returns

[`StepProblem`](../type-aliases/StepProblem.md) \| `null`
