[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/web/api](../README.md) / PhaseShell

# Function: PhaseShell()

> **PhaseShell**(`__namedParameters`): `Element`

The frame of an implement-style phase view: run status, a running line, `head` (lines spanning the view's width), the check results, the command summary line, then the body. The summary and a check result's proving command open in the task's activity log.

## Parameters

### \_\_namedParameters

#### children

`ReactNode`

#### epoch

[`Epoch`](../../../../../shared/types/interfaces/Epoch.md) \| `null`

#### head?

`ReactNode`

#### readOnly?

`boolean` = `false`

#### running?

`string` \| `null`

#### runningTestId?

`string`

#### state

[`SessionState`](../../../../../shared/types/interfaces/SessionState.md)

## Returns

`Element`
