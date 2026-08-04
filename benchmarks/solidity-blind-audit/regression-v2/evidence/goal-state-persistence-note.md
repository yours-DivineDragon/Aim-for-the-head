# Goal-state persistence note

`record-goal-state.mjs` invoked the helper sequentially for all candidate and
terminal writes. Its preserved transcript records successful JSON responses for
R2-15 lead revision 29, R2-15 validated revision 30, the terminal transition,
the passing terminal check, and the completed status summary.

The subsequent independent freeze check found that the R2-15 JSONL records and
the corresponding final `state.json` atomic replacements had not persisted,
although the terminal event append had persisted. This left 28 candidate
revisions and an active state alongside a sequence-6 terminal event.

The two missing JSONL records and final state object were restored verbatim from
`goal-state-recording.log` with a reviewable patch. No candidate content, gate,
coverage record, terminal reason, or result was changed. The repository then
reran `goal_state.py check --phase terminal` before regenerating the submission
seal.
