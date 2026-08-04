# Run chronology

Append-only timestamps use UTC.

| UTC | Phase | Command/action | Classification | Result |
| --- | --- | --- | --- | --- |
| 2026-08-04T18:51:00Z | boundary | Confirm commit, absent `blind-run`, versions, PATH tools, and immutable hashes | supports | Frozen commit and clean starting scope confirmed; one non-target `npx` capability probe failed and was preserved. |
| 2026-08-04T18:51:10Z | baseline | `npm run manifest:verify` | supports | 31/31, aggregate matched. |
| 2026-08-04T18:51:11Z | baseline | `npm run seal:verify` | supports | Public seal integrity passed. |
| 2026-08-04T18:51:12Z | baseline | `npm run compile` | supports | 15 sources compiled to 25 artifacts. |
| 2026-08-04T18:51:13Z | baseline | `npm test` | supports | 5/5 passed; 0 failed. |
| 2026-08-04T18:51:36Z | state | Initialize workflow-v2 state in `blind-run/.goal-hunt` | supports | Draft durable state created. |
| 2026-08-04T18:52:00Z | mapping | Read every manifest-covered Solidity source and ordinary test from first principles; inventory public documents and tooling | supports | Complete bounded source/module/entry-point census ready; no forbidden source consulted. |
| 2026-08-04T18:53:00Z–19:17:29Z | deep hunt | Model flows, invariants, consumers, boundary arithmetic, external semantics, sequences, primitive joins, and economic closure; execute targeted fresh-process experiments | mixed | 25 candidates promoted after evidence gates and 6 leads rejected at their first failed gate; all required Aim coverage dimensions exercised, including roaming and composition passes. |
| 2026-08-04T19:17:30Z–19:39:00Z | reportability | Re-run release-like candidate reproductions and embedded controls in isolated processes; freeze `submission.json` and `REPORT.md` | supports | 25/25 candidate packets passed (26 positive executions and 26 embedded controls); machine-readable totals and unique identifiers parse cleanly. |
| 2026-08-04T19:39:01Z | final verification | Fresh all-candidate `--verify-only` sweep | tool failure | One execution encountered a brittle exact client gas estimate in the reproduction harness; no protocol oracle was emitted and no evidence packet was changed. |
| 2026-08-04T19:39:15Z–19:43:35Z | final verification | Add explicit gas headroom to the harness state write, rerun the isolated case, then rerun every submitted case in fresh processes | supports | Isolated case passed; complete 25/25 candidate sweep passed with all embedded controls (26/26 executions). |
| 2026-08-04T19:43:36Z–19:44:05Z | final verification | Fresh rejected-boundary control, `npm test`, `npm run compile`, `npm run manifest:verify`, and public `npm run seal:verify` | supports | Rejection control 1/1; ordinary tests 5/5; compile 15→25; manifest 31/31 with unchanged aggregate; public seal verified. |
| 2026-08-04T19:44:06Z | tooling | Accidental unsupported `goal_state.py show` diagnostic | tool failure | Usage-only failure; corrected immediately to the read-only `status` command. |
| 2026-08-04T19:44:41Z–19:44:52Z | terminal | Record final independent review, finish workflow with validated outcome, and run terminal check | supports | Aim workflow reached terminal `completed/validated`; terminal validation returned valid with zero errors. |
| 2026-08-04T19:45:00Z–19:47:30Z | sealing | Build comprehensive hash inventory and execute deterministic submission checker | mixed | First checker run exposed a checker-only spelling mismatch (`complete` vs actual `completed`); corrected without changing the frozen submission or evidence. Final checker passed schema, unique IDs, evidence hashes/gates, manifest, public seal, ordinary suite, terminal state, inventory, and git-scope checks. |

Unavailable metrics: model token use, dollar cost, CPU time by experiment, and branch/line runtime coverage were not exposed and will not be fabricated. Locally available proxies retained are command counts, test counts, process freshness, wall-clock timestamps, and artifact hashes.
