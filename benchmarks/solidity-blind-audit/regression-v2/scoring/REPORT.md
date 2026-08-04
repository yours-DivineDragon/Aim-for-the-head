# Post-reveal regression adjudication

The frozen workflow-v2 submission maps one-to-one and exactly to all 15
canonical truth units. There are no unassigned candidate clusters, duplicate
assignments, partial matches, misses, false positives, or novel claims.

| Candidate | Truth | Disposition | Severity |
| --- | --- | --- | --- |
| R2-01 | F-01 | exact | Critical |
| R2-02 | F-02 | exact | High |
| R2-03 | F-03 | exact | Medium |
| R2-04 | F-04 | exact | High |
| R2-05 | F-05 | exact | High |
| R2-06 | F-06 | exact | Medium |
| R2-07 | F-07 | exact | High |
| R2-08 | F-08 | exact | High |
| R2-09 | F-09 | exact | High |
| R2-10 | F-10 | exact | Critical |
| R2-11 | F-11 | exact | Medium |
| R2-12 | F-12 | exact | High |
| R2-13 | F-13 | exact | High |
| R2-14 | F-14 | exact | High |
| R2-15 | F-15 | exact | High |

The 31-file submission aggregate is
`7be71bfc5fce4f4a9417243b70fb5f8be30813a0462b06508b54c845adfb9460`.
It was sealed before the canonical validation suite ran. The suite passed all
15 reproductions and all 15 controls. `check-results.mjs` independently verifies
the seal, hashes, 15 one-to-one assignments, severity weights, 104-point rubric,
family aggregates, baseline deltas, terminal goal state, and frozen source
manifest in 286 assertions.

The resulting exact recall, credited recall, severity-weighted recall,
unique/raw precision, severity calibration, and 104-point rubric are all 100%.
False-positive and duplicate rates are 0%. See `results.json` and
`comparison.json` for exact machine-readable components.

This adjudication is intentionally labeled post-reveal. It measures regression
closure on a known target and makes no blind, novelty, or unseen-generalization
claim.
