[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/knowledge](../README.md) / KnowledgeRead

# Type Alias: KnowledgeRead

> **KnowledgeRead** = \{ `state`: `"absent"`; \} \| \{ `entry`: [`KnowledgeEntry`](../interfaces/KnowledgeEntry.md); `state`: `"deleted"`; \} \| \{ `entry`: [`KnowledgeEntry`](../interfaces/KnowledgeEntry.md); `state`: `"current"`; \}

The current version of a key: none, a tombstone (`deleted`), or a value.
