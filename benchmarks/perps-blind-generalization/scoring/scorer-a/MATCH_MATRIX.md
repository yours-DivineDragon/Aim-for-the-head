# Scorer A match matrix

## Registered truth units

Each unit has exactly one primary candidate. A factor-positive primary is classified `primary_matched` even when it receives partial credit; it is not counted again as valid-unregistered.

| Truth | Class | Sev. | Wt. | Primary / cluster | Factor | Points | Boundary |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- |
| MCB-001 | access-control/cross-contract-risk | High | 7 | AFH-001 | 1.0 | 7.0 | Exact missing governor guard and outsider mutation. |
| MCB-002 | reentrancy/state-observation | Medium | 5 | AFH-004 | 1.0 | 5.0 | Exact transfer-before-effects; submitted double claim is stronger than stale observation. |
| MCB-003 | external-token-semantics/accounting | High | 7 | AFH-002 | 1.0 | 7.0 | Exact nominal credit versus 900/1000 actual receipt. |
| MCB-004 | oracle-integration/edge-case | Medium | 5 | AFH-005 | 1.0 | 5.0 | Exact >18-decimal normalization underflow. |
| MCB-005 | funding/economic-math | High | 7 | AFH-007 | 1.0 | 7.0 | Exact missing negative rate cap. |
| MCB-006 | signed-fixed-point/rounding | Medium | 5 | AFH-008 | 0.3 | 1.5 | Same division/checkpoint remainder is meaningful, but AFH-008 proves positive payer dust, not the registered negative-product floor direction. Canonical repair changes negative 0→-1 and leaves positive 0 unchanged. |
| MCB-007 | portfolio-margin/nonlinear-risk | High | 7 | AFH-013 | 1.0 | 7.0 | Exact opposite/negative-correlation parity error. |
| MCB-008 | position-accounting/business-logic | High | 8 | AFH-010 | 1.0 | 8.0 | Exact flip residual basis. |
| MCB-009 | cross-contract/open-interest-accounting | High | 7 | AFH-011 | 1.0 | 7.0 | Exact ever-increasing OI and loss-denominator divergence. |
| MCB-010 | execution/business-logic | High | 7 | AFH-014 | 1.0 | 7.0 | Exact arithmetic versus base-weighted portfolio price. |
| MCB-011 | settlement/oracle-time-semantics | High | 7 | AFH-006 | 1.0 | 7.0 | Exact post-cutoff latest-price recording. |
| MCB-012 | settlement/funding-state-order | High | 7 | AFH-009 | 1.0 | 7.0 | Exact zero-before-final-funding order. |
| MCB-013 | liquidation/state-machine | High | 8 | AFH-018 | 1.0 | 8.0 | Exact residual timeout finalization and unfreeze. |
| MCB-014 | insurance/reserve-accounting | Medium | 5 | AFH-021 | 1.0 | 5.0 | Exact phantom aggregate reserve after slash. |
| MCB-015 | advanced-composition/critical-economic | Critical | 8 | AFH-012 | 0.6 | 4.8 | Duplicate membership and repeated equity/risk consumers are substantially correct. Zero-size materialization, health-checked withdrawal, and final deficit are absent, so the critical chain is incomplete. |

MCB-015 accounting: AFH-012 is the only primary. Its duplicate-list and repeated-consumer primitives are internal to the partial composition credit and are not credited again as an unregistered defect. AFH-003 is a different delayed withdrawal bypass and is not a member of this cluster.

## All submitted candidates

| Candidate | Class | Truth | Claimed → adjudicated scope | Distinctness / accounting |
| --- | --- | --- | --- | --- |
| AFH-001 | primary_matched | MCB-001 | Low → High | Unique primary. |
| AFH-002 | primary_matched | MCB-003 | High → High | One actual-receipt root; extra sinks remain manifestations of the same consolidated claim. |
| AFH-003 | valid_unregistered | — | High → High | Distinct delayed-withdrawal health/freeze omission. |
| AFH-004 | primary_matched | MCB-002 | Medium → Medium | Unique callback-order primary. |
| AFH-005 | primary_matched | MCB-004 | Medium → Medium | Unique precision primary. |
| AFH-006 | primary_matched | MCB-011 | High → High | Unique cutoff-time primary. |
| AFH-007 | primary_matched | MCB-005 | High → High | Unique signed-cap primary. |
| AFH-008 | primary_matched | MCB-006 | Low → Medium | Fragment only; positive direction survives canonical negative-floor control. |
| AFH-009 | primary_matched | MCB-012 | High → High | Unique funding-order primary. |
| AFH-010 | primary_matched | MCB-008 | Medium → High | Unique cross-zero basis primary. |
| AFH-011 | primary_matched | MCB-009 | High → High | Unique OI primary; canonical truth establishes High even though blind consensus narrowed scope pre-reveal. |
| AFH-012 | primary_matched | MCB-015 | Medium → Medium scope | Partial critical-unit primary; no double credit as unregistered. |
| AFH-013 | primary_matched | MCB-007 | High → High | Unique correlation primary. |
| AFH-014 | primary_matched | MCB-010 | Medium → High | Unique weighted-price primary. |
| AFH-015 | valid_unregistered | — | Low → Low | Distinct nonce-domain collision. |
| AFH-016 | valid_unregistered | — | High → High | Distinct bidder-account authorization failure. |
| AFH-017 | valid_unregistered | — | Critical → High | Distinct bidder bond/health chain; AFH-018 is a dependency only and is not recounted. |
| AFH-018 | primary_matched | MCB-013 | High → High | Unique residual-finalization primary. |
| AFH-019 | valid_unregistered | — | High → High | Distinct terminal reveal guard; depends on AFH-018 residual reachability only. |
| AFH-020 | valid_unregistered | — | High → High | Distinct shared-freeze/stale-lifecycle contradiction; no AFH-019 dependency. |
| AFH-021 | primary_matched | MCB-014 | Medium → Medium | Unique reserve-reconciliation primary. |
| AFH-022 | valid_unregistered | — | High → High | Distinct live-bond ownership failure. |
| AFH-023 | valid_unregistered | — | Medium → Medium | Distinct uncollectible fee/NAV defect. |
| AFH-024 | valid_unregistered | — | High → High | Distinct venue receipt/normalization defect. |
| AFH-025 | valid_unregistered | — | High → High | Distinct execution-price domain split. |

Totals: 15 `primary_matched`, 0 `supporting_or_duplicate`, 10 `valid_unregistered`, and 0 `false_positive`.
