This patch is a stack of several commits, numbered C1, C2, ... in commit order. Each hunk label ends with the commit that owns the hunk, for example `[C2]`.

Additional rules for a stack:

- Every change contains hunks of one commit only.
- Order the changes by commit: all changes of C1 first, then those of C2, and so on. Within a commit, use reading order.
- `commitIntents`: one sentence per commit, in commit order, saying what the commit achieves within the stack. Wrap code identifiers in backticks.
- `flowHints`: one entry per commit, in commit order. When the commit adds or changes a runtime flow that a sequence diagram of calls between components would explain (timers, events, callbacks, ordering between objects), a short phrase naming that flow, for example "how a re-rendered text directive is searched for again". Otherwise null: refactors, renames, data-structure, preference, build and test-only commits.
