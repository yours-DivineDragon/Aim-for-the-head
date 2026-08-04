# Final scoring consensus

## Outcome

The final one-to-one adjudication is **9 exact, 2 partial, and 4 missed truth units out of 15**. Total match credit is **10/15 = 2/3 (66.67%)**, and severity-weighted recall is **41/62 (66.13%)**. All 11 raw claims are reproduced, in scope, unique, and valid; there are no duplicates or false positives. Unique and raw precision are both **10/11 (90.91%)**.

The secondary committed rubric score is **66/104 = 33/52 (63.46%)** after severity caps and zero false-positive deductions. The official weighted-precision and weighted-F1 values are null because the preregistration never defines weighted precision. Non-headline sensitivity calculations are retained in output/results.json.

Control specificity is also null. The denominator is zero because the benchmark contains no separately precommitted public negative-control units. Patched controls for the 15 positive exploits are comparators, not public negative controls.

## Resolution of the scorer disagreement

Scorer A and scorer B agree on ten candidate-to-truth assignments, including nine exact matches and the partial reentrancy match. Their only assignment dispute is C-011.

C-011 receives partial F-03 credit. It proves the committed vault primitive: a direct donation enters the raw-balance totalAssets calculation and inflates the exchange rate. It does not prove already-posted shares being revalued by LendingMarket or a raised borrow limit. This lands directly in F-03's explicit two-point partial band for donation/inflation awareness without connection to posted collateral. C-011's tiny-supply deposit-denial impact is not counted again as a novel unit.

F-01 remains a miss. C-008 proves only F-02, while C-011 is incomplete for F-03 and operates on a different consumer path. Nothing demonstrates the required atomic multiplicative chain, flash repayment, retained profit, or reserve loss.

## Strengths

The strongest performance is at explicit trust and authorization boundaries:

- Both distinct PermitRouter failures are exact: deployment-domain replay (F-08) and recipient substitution (F-09).
- Both distinct bridge failures are exact: unauthenticated remote sender with fabricated collateral (F-10) and cross-chain nonce collision (F-11).
- Repeat initialization and role seizure (F-12), stale primary oracle data (F-13), fallback spot manipulation (F-02), and signature-malleability replay (F-15) are exact.
- The collateral-factor truth-table bypass (F-05) is exact, although its frozen Medium severity triggers the committed five-point cap.

Precision is high because every candidate cluster reproduced and none was invalid or duplicated.

## Misses and breakpoints

The main breakpoint is compositional reasoning. The audit found the fallback oracle primitive and donation-driven vault inflation, but did not connect them into the committed flash-funded multiplicative reserve drain (F-01).

Accounting edge cases were the second breakpoint:

- F-06: withdrawal must round the burned shares up; the zero-share burn was missed.
- F-07: fee-on-transfer vault deposits mint from the requested rather than received amount.
- F-14: fee-on-transfer repayments retire nominal debt despite a reserve shortfall.

The reentrancy candidate is strong but partial. C-001 exploits the same callback-before-debt root cause through recursive borrow and produces debt twice the limit. It does not take the committed borrow-to-withdrawCollateral edge or finish with debt and zero local collateral.

Severity is aligned for seven of 11 matched candidates. C-001 overcalls by one rank; C-006, C-010, and C-011 undercall by one rank. Under the disclosed canonical-weighted operationalization, severity calibration is **59/66 (89.39%)**.

## Requested-family coverage

The following is a primary, non-overlapping allocation: every committed truth ID is counted exactly once.

| Family | Committed truth IDs and outcomes | Exact / partial / miss | Credit |
| --- | --- | ---: | ---: |
| Access control | F-05 exact; F-12 exact | 2 / 0 / 0 | 2/2 |
| Reentrancy | F-04 partial | 0 / 1 / 0 | 1/2 |
| Niche mistakes | F-06 miss; F-11 exact; F-15 exact | 2 / 0 / 1 | 2/3 |
| Advanced composed exploit | F-01 miss | 0 / 0 / 1 | 0/1 |
| Cross-contract bugs | F-03 partial; F-10 exact | 1 / 1 / 0 | 3/4 |
| External protocol/integration issues | F-02 exact; F-07 miss; F-13 exact; F-14 miss | 2 / 0 / 2 | 1/2 |
| Extras | F-08 exact; F-09 exact | 2 / 0 / 0 | 2/2 |

Some truths have legitimate secondary tags—F-10 is also authentication, and F-03 is also integration—but those overlaps are not added to the counts.

## Resources and limitations

The run used **2,692.232 seconds of 10,800 seconds (24.93%)**. It produced 14.709 validated candidates/hour, 12.035 exact matches/hour, and 13.372 match-credit units/hour. Local telemetry records 37 compiles, 36 completed test processes, and 74/76 passing test cases. The two failures were preserved harness-only first attempts and passed after correction.

Service-side calls, tokens, compute, cost, time-to-first-valid, and per-candidate timing are unavailable and were not estimated. The supplied base and candidate commit identifiers differ, but the attested source-manifest digest matches exactly. C-008's reproduced price multiplier is smaller than the canonical fixture's numerical trace, yet it reaches the same committed mechanism and profitable lending-impact oracle.

This is report-only adjudication. No benchmark, candidate, evidence, scorer, or tool implementation was modified, and no tool improvements are proposed.
