# Post-reveal scoring report — scorer B

## Outcome

The frozen consensus earns **89.4/100** under the preregistered 1.0/0.6/0.3/0 evidence factors.

| Outcome | Units |
|---|---:|
| Exact (1.0) | 13 |
| Substantial/incomplete (0.6) | 0 |
| Meaningful fragment (0.3) | 1 |
| Missed (0) | 1 |

Raw unit recall is **14/15 (93.33%)**, defined as registered units with any positive factor divided by all 15 registered units. Factor-normalized recall is **13.3/15 (88.67%)**. Weighted points are **89.4/100**; severity disagreements never change unit weights.

The non-exact boundaries are:

- **MCB-006 missed.** AFH-008 is not semantic equivalence. The registered defect is floor rounding for a negative product; AFH-008 demonstrates positive-product checkpoint splitting and discarded fractional remainder. AFH-008 still reproduces after applying the canonical `mulWadDown` repair, so it is a distinct valid-unregistered generator miss.
- **MCB-015 receives 0.3 (2.4/8).** AFH-012 identifies the shared missing active-market uniqueness primitive and duplicated equity/risk valuation, but reaches it through close/reopen. It does not identify repeated zero-size executions, withdrawal against amplified equity, price normalization, or the final deficit. Its PoC survives the registered zero-size control. The critical end-to-end chain was therefore not demonstrated.

All other registered matches satisfy the required root cause, reachable preconditions, downstream impact, transaction sequence, and distinguishing control. The complete per-unit reasoning is in `match-matrix.md` and `score.json`.

## Candidate classification and precision

Each of the 25 AFH IDs is classified exactly once.

| Classification | Count |
|---|---:|
| `primary_matched` | 14 |
| `supporting_or_duplicate` | 0 |
| `valid_unregistered` | 11 |
| `false_positive` | 0 |

The primary candidates are AFH-001, 002, 004, 005, 006, 007, 009, 010, 011, 012, 013, 014, 018, and 021.

The valid-unregistered generator misses are AFH-003, 008, 015, 016, 017, 019, 020, 022, 023, 024, and 025. Fresh execution and source/control review confirm that these are genuine omitted defects rather than intended behavior, hidden-harness artifacts, or infeasible claims. AFH-017 remains valid at the consensus-narrowed High scope; its claimed Critical closure failed because the chain showed social loss and live exposure but no attacker token profit.

Raw 25-submission empirical precision is **25/25 (100%)**. Consensus has no duplicate groups, and independent root/control review leaves 25 distinct root-cause clusters, so deduplicated empirical precision is also **25/25 (100%)**. Valid-unregistered findings count positively in both precision numerators, as required.

## Class rollups

Tags are overlapping metadata-derived rollups, so their weights are not additive. Raw class recall counts any positive-factor unit; points retain the preregistered weights and evidence factors.

| Tag | Exact / 0.6 / 0.3 / miss | Raw recall | Points |
|---|---:|---:|---:|
| business-logic | 9 / 0 / 1 / 1 | 10/11 | 65.4/76 |
| composed | 0 / 0 / 1 / 0 | 1/1 | 2.4/8 |
| cross-contract | 4 / 0 / 1 / 0 | 5/5 | 30.4/36 |
| integration | 4 / 0 / 0 / 0 | 4/4 | 24/24 |
| niche | 1 / 0 / 0 / 1 | 1/2 | 5/10 |
| access | 1 / 0 / 0 / 0 | 1/1 | 7/7 |
| reentrancy | 1 / 0 / 0 / 0 | 1/1 | 5/5 |

## Severity accuracy

Severity accuracy is **9/14 (64.29%)**, comparing the frozen consensus `final_severity` with canonical severity only for truth units receiving nonzero credit. MCB-006 is excluded because it was missed.

The five disagreements are MCB-001 (Low versus canonical High), MCB-008 (Medium versus High), MCB-009 (Medium versus High), MCB-010 (Medium versus High), and MCB-015 (Medium versus Critical). These scope disagreements do not change match factors or registered weights.

## Critical-chain outcome

MCB-015 is **fragment only, not demonstrated**. AFH-012 earns factor 0.3 and 2.4/8 points; the embedded composition bonus is not earned. No auction candidate is substituted for the registered chain merely because it is composed or severe: AFH-017 has different hunter root causes, preconditions, state sequence, and control.

## Independent execution and integrity

Terminal verification passed:

- canonical hidden suite: **15/15 reproductions and 15/15 controls**;
- ordinary suite: **5/5**, after compiling 15 Solidity inputs into 25 artifacts;
- candidate packets: **25/25** fresh-process passes with embedded controls;
- ambiguity discrimination: **2/2 pairs**, four fresh compile/test processes;
- source manifest: **31/31**, aggregate `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381`;
- seal and reveal verifiers: pass, including plaintext commitment `fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e`;
- deterministic score checker: pass before hash sealing and again after full hash/path coverage.

AFH-021's first scorer-B rerun hit a transient setup transaction-estimation revert before reaching its oracle. The failed log is preserved; an immediate fresh retry passed, and the canonical hidden reproduction/control also passed. No scoring inference relies on the failed attempt.

Input commitments were independently rechecked for consensus `ba5d60af575433b6f730ca1e59b961a00dedfda67da416b25c3ea6370e3b2696`, submission `c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef`, source aggregate `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381`, reveal aggregate `dc808f47d8fc293a7f811d4f3b24622ad27387d9d7b95d5b2d692ee06430b03c`, and the canonical truth tar commitment above.

`HASHES.sha256` covers every regular scorer-B artifact except itself. `check-score.mjs` validates the 15 truth IDs, 25 AFH IDs, factors, weights, arithmetic, one-to-one primary matches, clusters, class/precision/severity metrics, evidence and rerun hashes, frozen input immutability, scorer-local path safety, and complete hash-inventory coverage.
