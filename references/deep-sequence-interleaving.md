# Deep pass: sequences and interleavings

Treat every external interaction as a possible control transfer, including
calls to configured or apparently trusted contracts that can reach hooks or
unknown implementations.

At each interaction point:

1. Snapshot the checks already performed and the state not yet committed.
2. List every public action reachable before the outer operation finishes.
3. Build a callback matrix from the interaction to those actions.
4. Test same-function recursion, cross-function reentry, a second component,
   and a state-changing dependency.
5. Assert the final global state after the entire stack unwinds.

Also mutate ordinary action sequences: reorder, repeat, omit, interrupt,
front-run, back-run, batch, retry, use two identities or domains, transfer
directly, and perform several operations atomically. State-machine bugs often
preserve each function's local precondition while violating a precondition
assumed by a later transition.

Record `sequence-interleaving/callback-and-action-sequence-matrix` with tested
positive and negative interleavings and the post-unwind global state.
