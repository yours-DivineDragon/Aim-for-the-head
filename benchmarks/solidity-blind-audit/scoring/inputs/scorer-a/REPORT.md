# Post-reveal score — independent scorer A

All eight supplied JSON inputs parsed, the three committed SHA-256 values matched, and all 65 regular input files are inventoried in `input-hashes.sha256`.

## Outcome

The hunter recovered nine truth units exactly, two partially, and missed four of 15. The two partials are substantive but do not reach their committed paths:

- C-001 reproduces debt-finalization-after-callback and a nested-borrow overdraw, but not F-04's borrow-to-`withdrawCollateral` edge or zero-local-collateral oracle.
- C-011 reproduces direct-donation exchange-rate inflation, but only as a tiny-supply deposit denial; it does not connect the rate change to posted shares and lending as required for exact F-03 credit. The canonical rubric expressly places donation/inflation awareness without posted collateral in F-03's partial band.

| Metric | Components | Exact value | Decimal |
| --- | ---: | ---: | ---: |
| Exact recall | 9 / 15 | 3/5 | 0.600000 |
| Credit recall | (9 + 0.5 × 2) / 15 | 2/3 | 0.666667 |
| Severity-weighted recall | 41 / 62 | 41/62 | 0.661290 |
| Unique precision | (9 + 0.5 × 2 + 0 novel) / 11 | 10/11 | 0.909091 |
| Raw precision | 10 / 11 | 10/11 | 0.909091 |
| Duplicate rate | 0 / 11 | 0 | 0.000000 |
| False-positive claim rate | 0 / 11 | 0 | 0.000000 |
| Operational weighted precision | credit-weighted unique precision | 10/11 | 0.909091 |
| Operational weighted F1 | 2 × (10/11) × (41/62) / ((10/11) + (41/62)) | 820/1071 | 0.765640 |
| Severity calibration | 1 − 14 / (3 × 44) | 59/66 | 0.893939 |
| Control specificity | 0 public negative controls | null | null |
| Secondary rubric score | 66 / 104 | 33/52 | 0.634615 |

`weighted_precision` is referenced but not separately defined in the preregistration. The displayed operational value uses its only explicit credit-weighted unique-cluster precision formula. A strict uninvented value is null; `results-a.json` also gives a non-primary candidate-severity-weighted sensitivity.

## One-to-one adjudication and 104-point compatibility score

| Truth | Candidate | Match | Frozen severity vs canonical | Points | Reason |
| --- | --- | --- | --- | ---: | --- |
| F-01 | — | miss | — / Critical | 0/12 | No atomic F-02 + F-03 multiplication, flash repayment, retained profit, or final reserve-loss oracle. |
| F-02 | C-008 | exact | High / High | 7/7 | Reproduced nonpositive-feed fallback, transient reserve ratio, lending consumption, and profitable bad debt. |
| F-03 | C-011 | partial | Low / Medium | 2/4 | Same direct-donation exchange-rate primitive; no posted collateral or lending impact. |
| F-04 | C-001 | partial | Critical / High | 5/7 | Same callback-before-debt defect; nested borrow instead of collateral withdrawal and no zero-collateral final state. |
| F-05 | C-006 | exact | Medium / High | 5/7 | Exact public-increase truth-table bypass; explicit severity cap binds. |
| F-06 | — | miss | — / Medium | 0/4 | No zero-share withdrawal-burn proof. |
| F-07 | — | miss | — / High | 0/7 | No fee-on-transfer deposit dilution or profitable cycle. |
| F-08 | C-010 | exact | Medium / High | 5/7 | Exact cross-router domain replay; explicit severity cap binds. |
| F-09 | C-003 | exact | High / High | 7/7 | Exact recipient substitution and transfer theft. |
| F-10 | C-002 | exact | Critical / Critical | 10/10 | Exact missing remote-sender binding, fabricated collateral, and borrowing. |
| F-11 | C-007 | exact | Medium / Medium | 4/4 | Exact source-chain nonce collision and denied valid credit. |
| F-12 | C-005 | exact | High / High | 7/7 | Exact repeat initialization, role seizure, and sweep. |
| F-13 | C-009 | exact | High / High | 7/7 | Exact stale positive round and excess borrowing. |
| F-14 | — | miss | — / High | 0/7 | No nominal-repay versus received-balance deficit. |
| F-15 | C-004 | exact | High / High | 7/7 | Exact ECDSA malleability plus signature-byte replay-key bypass. |

The 66 points are pre-deduction and final: there are no false-positive deductions. Only the final score is rounded, and 66 already lies on a 0.5-point boundary.

## Chain and claim handling

F-01 receives no credit. C-008 establishes only the spot-oracle primitive. C-011 establishes only part of the vault-rate primitive on a different consumer path. Separate discovery does not demonstrate a profitable atomic composition, so it cannot satisfy the composed-only oracle.

- Exact: C-002→F-10, C-003→F-09, C-004→F-15, C-005→F-12, C-006→F-05, C-007→F-11, C-008→F-02, C-009→F-13, C-010→F-08.
- Partial: C-001→F-04, C-011→F-03.
- Missed: F-01, F-06, F-07, F-14.
- Novel-valid: none.
- Invalid/false positive: none.
- Duplicate: none; 11 raw claims form 11 unique clusters.

## Where the hunter worked

The strongest coverage was on explicit trust-boundary and message/signature defects. It exactly recovered both distinct PermitRouter flaws, both distinct BridgeGateway flaws, the rewards replay bypass, the repeat initializer, stale primary pricing, the manipulable fallback, and the collateral-factor authorization error. These were not title matches: the frozen reproductions reached concrete transfer, credit, borrowing, denial, or payout oracles.

Precision was correspondingly strong. Every frozen claim was reproduced and in scope, and none clustered as a duplicate. The 10/11 precision numerator is reduced only by the two half-credit matches.

## Where it broke

The largest loss was compositional. Although it found F-02 and part of F-03, it did not reason through the complete flash-funded multiplicative F-01 drain. It also missed both fee-on-transfer accounting invariants, despite their different consumers (vault issuance and debt retirement), and missed the ERC-4626 withdrawal rounding direction.

The reentrancy report found the right state-ordering defect but stopped on a sibling nested-borrow trace. The committed cross-function edge was stronger and materially different in final state because the attacker recovered all posted collateral.

Severity was aligned for seven of 11 matched valid clusters, with one one-rank overcall (C-001) and three one-rank undercalls (C-006, C-010, C-011). Canonical-weighted absolute rank error is 14 over a maximum 132.

## Coverage by canonical class

| Coverage | Canonical classes |
| --- | --- |
| Exact | oracle manipulation; access control / incorrect boolean logic; signature domain replay; signature parameter substitution; cross-domain authentication / cross-contract invariant; cross-chain replay namespace / denial of service; initialization / configuration takeover; stale oracle data; ECDSA malleability / replay accounting |
| Partial | ERC-4626 integration accounting; cross-function cross-contract reentrancy |
| Miss | multi-contract oracle/accounting exploit chain; ERC-4626 rounding direction; fee-on-transfer accounting; fee-on-transfer debt accounting |

Each canonical class contains one truth unit, so the class-level credit is respectively 1, 0.5, or 0. The full machine-readable class and severity breakdown is in `results-a.json`.

## Time and resources

The supplied run used 2,692.232 seconds of a 10,800-second budget (336529/1350000 = 0.249281 utilization) and produced 11 reproduced unique clusters: 244.748 seconds per cluster and 14.709 clusters/hour. It yielded 13.372 match-credit units/hour and 12.035 exact matches/hour. Local telemetry reports 37 compiles, 36 completed test processes, and 74/76 passing test cases; the two failures were preserved harness-only first attempts that passed after correction. Service-side tool calls, token counts, compute, and cost are unavailable and were not estimated.

Control specificity is null, not 1 or 0: the benchmark supplies no precommitted public negative-control units. Patched exploit controls in `validation-map.json` remain comparators for positive units and are excluded from that denominator.
