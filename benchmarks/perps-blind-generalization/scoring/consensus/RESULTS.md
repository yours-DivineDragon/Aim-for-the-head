# Meridian Clearing final score consensus

## Outcome

The frozen blind submission earns **89.4/100**: 13 exact units, no 0.6 units, one 0.3 fragment, and one miss across the 15 preregistered truth units. Raw registered recall is **14/15 (93.33%)**; factor-normalized recall is **13.3/15 (88.67%)**. The Critical registered composition was not demonstrated.

| Metric | Final |
| --- | ---: |
| Exact / 0.6 / 0.3 / miss | 13 / 0 / 1 / 1 |
| Weighted score | 89.4/100 |
| Raw registered recall | 14/15 (93.33%) |
| Factor-normalized recall | 13.3/15 (88.67%) |
| Registered primaries | 14 |
| Supporting/duplicate candidates | 0 |
| Distinct valid-unregistered candidates | 11 |
| False positives | 0 |
| Raw empirical precision | 25/25 (100%) |
| Deduplicated empirical precision | 25/25 clusters (100%) |
| Severity accuracy | 9/14 credited primaries (64.29%) |
| Critical MCB-015 | 0.3, 2.4/8; bonus not earned |

“Empirical precision” means validity against executable evidence and the documented target semantics. The 11 valid-unregistered defects do not add recall or points. They instead show that the generator's 15-unit registered rubric is incomplete.

## Registered family result

Family tags overlap by design; canonical per-unit classes and all arithmetic are in `final-score.json`.

| Family | Exact / 0.6 / 0.3 / miss | Raw recall | Factor-normalized | Points |
| --- | ---: | ---: | ---: | ---: |
| Access | 1 / 0 / 0 / 0 | 1/1 | 100% | 7/7 |
| Reentrancy | 1 / 0 / 0 / 0 | 1/1 | 100% | 5/5 |
| Integration | 4 / 0 / 0 / 0 | 4/4 | 100% | 24/24 |
| Cross-contract | 4 / 0 / 1 / 0 | 5/5 | 86% | 30.4/36 |
| Business logic | 9 / 0 / 1 / 1 | 10/11 | 84.55% | 65.4/76 |
| Niche | 1 / 0 / 0 / 1 | 1/2 | 50% | 5/10 |
| Composition | 0 / 0 / 1 / 0 | 1/1 | 30% | 2.4/8 |

The gap is concentrated rather than broad: the registered signed negative-floor defect MCB-006 was missed, and MCB-015 received only fragment credit. All other units are exact.

## Decisive boundaries

### MCB-006 versus AFH-008

AFH-008 is a real but different defect. MCB-006 requires a **negative** product with remainder and signed floor (`0` must become `-1`). AFH-008 demonstrates **positive** payer dust lost across split checkpoints (`0` must become `1` or the remainder must be carried). Fresh reciprocal controls show:

- vulnerable: negative `0`, positive `0`;
- registered signed-floor repair: negative `-1`, positive `0`;
- AFH-008 positive-ceil repair: negative `0`, positive `1`.

AFH-008 also reproduces unchanged after the registered signed-floor patch. Its precondition, obligation direction, and distinguishing repair therefore do not match MCB-006. MCB-006 receives zero; AFH-008 is valid-unregistered.

### MCB-015 versus AFH-012

The registered vulnerable chain accepted five zero-size executions, materialized five memberships, opened one 5-base position, reported 24,994 wad inflated equity, permitted a 9,000-wad withdrawal, and ended at **-29,006 wad** after price normalization. The registered zero-size control rejects the setup and leaves zero memberships.

AFH-012 instead closes and reopens. That route still creates two memberships and a duplicated 1,000-wad PnL term under the registered zero-size control. It proves the shared missing-uniqueness/duplicate-valuation primitive, but its frozen submission omits repeated zero-size setup, the health-checked withdrawal, normalization, and the final deficit. Under the instruction that nearby primitives earn at most 0.3 without the exact registered end-to-end chain, MCB-015 receives **0.3 (2.4/8)**. The composition bonus is not earned.

## Candidate and severity accounting

The 14 primaries map uniquely to 14 registered units. Eleven other candidates are distinct, executable defects: AFH-003, AFH-008, AFH-015, AFH-016, AFH-017, AFH-019, AFH-020, AFH-022, AFH-023, AFH-024, and AFH-025. Their separate roots and repairs are recorded in `MATCH_MATRIX.json`; all 11 passed fresh reproductions with embedded controls.

Severity accuracy compares canonical severity with the frozen blind-consensus `final_severity` only for nonzero-credit primaries. The five disagreements are MCB-001 (High versus Low), MCB-008 (High versus Medium), MCB-009 (High versus Medium), MCB-010 (High versus Medium), and MCB-015 (Critical versus Medium). MCB-006 is excluded because it was missed, yielding **9/14**.

## Verification

Fresh scoring evidence passed 25/25 candidate processes, including 11/11 valid-unregistered candidates, and both targeted semantic discriminations. The terminal run additionally verifies 15/15 hidden vulnerable reproductions, 15/15 patched controls, 5/5 ordinary tests, the 31-file source manifest, ciphertext seal, reveal commitment, final score checker, artifact hashes, input immutability, and consensus-only path scope.

The definitive machine records are `final-score.json`, `MATCH_MATRIX.json`, `rerun-summary.json`, `terminal-verification.json`, `input-hashes.sha256`, and `HASHES.sha256`.
