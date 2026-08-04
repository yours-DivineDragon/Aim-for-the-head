# Independent post-reveal score B

All eight supplied JSON inputs parse, all 65 regular input files are inventoried, and the supplied SHA-256 commitments for `ground-truth.json`, `candidates.json`, and `blind-consensus.json` match byte-for-byte. Matching used the frozen consensus conclusions and a one-candidate/one-truth-unit constraint.

## Outcome

The hunter exactly matched 9 of 15 positive truth units, partially matched 1, and missed 5. This gives exact recall **9/15 = 3/5 = 60.00%**, credit recall **(9 + 1/2)/15 = 19/30 = 63.33%**, and severity-weighted recall **40/62 = 20/31 = 64.52%**.

There are 11 raw claims and 11 unique clusters. Nine exact matches, one half-credit partial, and one novel-valid claim yield both unique and raw precision of **(9 + 1/2 + 1)/11 = 21/22 = 95.45%**. Duplicate rate is **0/11 = 0%**, and claim false-positive rate is **0/11 = 0%**. No claim is invalid or duplicate.

The preregistration never defines `weighted_precision`; it only refers to that undefined operand in the weighted-F1 formula. Therefore the official preregistered weighted precision and weighted F1 are **null**, rather than post-hoc inventions. As a clearly non-headline sensitivity check, candidate-severity weighting would give weighted precision **39/43 = 90.70%** and weighted F1 **1560/2069 = 75.40%**.

Control specificity is also **null**: the denominator is zero because there are no precommitted public negative-control units. The 15 validation-map controls are patched exploit controls and were not reclassified.

## One-to-one coverage

| Truth | Canonical class | Candidate | Match | Credit | Rubric points |
|---|---|---:|---:|---:|---:|
| F-01 | Composite oracle/accounting chain | — | miss | 0 | 0/12 |
| F-02 | Oracle manipulation | C-008 | exact | 1 | 7/7 |
| F-03 | ERC-4626 integration accounting | — | miss | 0 | 0/4 |
| F-04 | Cross-function/cross-contract reentrancy | C-001 | partial | 1/2 | 5/7 |
| F-05 | Access control / boolean logic | C-006 | exact | 1 | 5/7 (severity cap) |
| F-06 | ERC-4626 rounding direction | — | miss | 0 | 0/4 |
| F-07 | Fee-on-transfer vault accounting | — | miss | 0 | 0/7 |
| F-08 | Signature domain replay | C-010 | exact | 1 | 5/7 (severity cap) |
| F-09 | Signature parameter substitution | C-003 | exact | 1 | 7/7 |
| F-10 | Cross-domain authentication | C-002 | exact | 1 | 10/10 |
| F-11 | Cross-chain replay namespace | C-007 | exact | 1 | 4/4 |
| F-12 | Initialization takeover | C-005 | exact | 1 | 7/7 |
| F-13 | Stale oracle data | C-009 | exact | 1 | 7/7 |
| F-14 | Fee-on-transfer debt accounting | — | miss | 0 | 0/7 |
| F-15 | ECDSA malleability/replay accounting | C-004 | exact | 1 | 7/7 |

Exact: F-02/C-008, F-05/C-006, F-08/C-010, F-09/C-003, F-10/C-002, F-11/C-007, F-12/C-005, F-13/C-009, F-15/C-004. Partial: F-04/C-001. Missed: F-01, F-03, F-06, F-07, F-14. Novel-valid: C-011. Invalid: none. Duplicates: none.

F-01 receives no inferred credit. C-008 proves only the F-02 spot-oracle primitive; no candidate demonstrates the F-03 lending-collateral donation primitive, the combined flash-funded execution, repayment, 49,950 profit, or final reserve-loss oracle.

C-001 is partial for F-04. It provides a strong runnable proof of the same callback-before-debt defect, but recursively calls `borrow`; it never takes the committed `borrow → withdrawCollateral` edge or shows nonzero debt with `localCollateral == 0` and the original shares recovered.

C-011 is novel-valid rather than partial F-03. Its tiny-supply/no-virtual-offset path makes `convertToShares` round a victim deposit to zero, causing temporary availability loss. F-03 instead requires already-posted shares, a donation-driven `convertToAssets` increase, LendingMarket consumption, and a raised borrow limit. Their prerequisites, impact, and fixes are materially different.

## Where the hunter worked—and broke

The strongest coverage is across authorization boundaries and signatures. The evidence reproduces remote-sender omission (C-002: fabricated 1,000 bridge collateral and 750 stable borrowed), recipient substitution (C-003: all 25 signed tokens redirected), cross-router replay (C-010: one 25 authorization transfers 50), and raw-signature replay (C-004: one 20 authorization pays 80). It also cleanly finds the two independent bridge defects, both oracle modes, repeated strategy initialization, and the collateral-factor boolean bypass.

The main failure is compositional reasoning. The hunter found the fallback spot primitive but not the vault-collateral primitive and therefore not the Critical multiplicative drain. Vault arithmetic and transfer-delta invariants were also a blind spot: F-03, F-06, F-07, and F-14 are all missed. Conversely, C-001 and C-011 show useful exploratory breadth: the hunter found a different exploitable reentrancy path and a genuine low-severity first-share denial, but those do not substitute for the committed paths.

By canonical severity, coverage is Critical **1 exact/2**, High **7 exact + 1 partial/10** (credit 3/4), and Medium **1 exact/3** (credit 1/3). Frozen-consensus severity aligns on seven matched claims, overcalls C-001 by one rank, and undercalls C-006 and C-010 by one rank each. Under the disclosed rank/weight interpretation, severity calibration is **1 − 12/(3×43) = 39/43 = 90.70%**.

## Compatibility score and efficiency

The committed rubric score is **64/104 = 8/13 = 61.54%** after per-finding severity caps and **0** false-positive deductions. C-006 and C-010 are capped at 5 points because consensus severity is Medium; C-001 earns the top of F-04's partial band (5 points).

The run used **2,692.232 seconds (44m 52.232s)** of a 10,800-second budget, or **336529/1350000 = 24.93%**. It validated 11 candidates at **4,950,000/336,529 = 14.71 candidates/hour** and produced **4,275,000/336,529 = 12.70 match-credit units/hour**. Local telemetry records 37 compile invocations, 36 completed test processes, and 74/76 passing test cases; the two failures were preserved harness-only first attempts that were corrected and passed. Service-side tool, token, compute, and cost telemetry, time-to-first-valid, and per-candidate timing are unavailable.

Full rational arithmetic, severity/class breakdowns, rubric caps, resource components, and protocol limitations are in `results-b.json`; every truth and candidate disposition is in `match-adjudication-b.json`.
