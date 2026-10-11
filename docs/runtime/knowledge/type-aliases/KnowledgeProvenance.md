[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/knowledge](../README.md) / KnowledgeProvenance

# Type Alias: KnowledgeProvenance

> **KnowledgeProvenance** = \{ `by`: `"plugin"` \| `"user"`; `sessionId`: [`Id`](../../../shared/types/type-aliases/Id.md); \} \| \{ `by`: `"llm"`; `sessionId`: [`Id`](../../../shared/types/type-aliases/Id.md); `taskId`: [`Id`](../../../shared/types/type-aliases/Id.md); \}

Who wrote a knowledge entry, and in which session.
