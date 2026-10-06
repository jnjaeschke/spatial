[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/phab-transactions](../README.md) / fetchTransactions

# Function: fetchTransactions()

> **fetchTransactions**(`conduit`, `revisionPHID`): `Promise`\<[`RemoteComment`](../interfaces/RemoteComment.md)[]\>

Fetches every page of `transaction.search` for a revision.

## Parameters

### conduit

[`ConduitClient`](../../conduit/classes/ConduitClient.md)

### revisionPHID

`string`

## Returns

`Promise`\<[`RemoteComment`](../interfaces/RemoteComment.md)[]\>
