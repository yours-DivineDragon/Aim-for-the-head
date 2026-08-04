# Post-reveal score — Scorer A

## Outcome

The frozen submission earns **93.3/100 (93.3%)**: **13 exact**, **one 0.6 substantial partial**, **one 0.3 fragment**, and **zero misses**. Raw registered-unit recall is **15/15 (100%)**, where any factor-positive unit counts as hit while its factor still reduces weighted points.

All 25 AFH candidates are genuine at some independently reproduced scope. Candidate classification is **15 primary matched, 0 supporting/duplicate, 10 valid unregistered, and 0 false positives**. The ten valid-unregistered findings are a generator/author-truth coverage defect; they are excluded from registered recall and weighted score.

## Scoring arithmetic

| Measure | Result |
| --- | ---: |
| Exact units | 13 |
| 0.6 units | 1 |
| 0.3 units | 1 |
| Missed units | 0 |
| Exact-unit points | 87.0 |
| MCB-006 points | 5 × 0.3 = 1.5 |
| MCB-015 points | 8 × 0.6 = 4.8 |
| Total | **93.3 / 100** |

The MCB-006 boundary is a fragment, not a substantial partial. AFH-008 finds the same checkpoint division and remainder loss but demonstrates the positive payer direction. The registered unit and private control are specifically negative-floor semantics. In a fresh discrimination run, the canonical repair changed the negative case from 0 to -1 but left the submitted positive case at 0.

The MCB-015 boundary is 0.6. AFH-012 identifies two composition primitives—non-unique market membership and duplicate equity/risk iteration—and reproduces doubled PnL. It does not execute zero-size membership materialization, collateral withdrawal through the fooled health check, or the post-normalization deficit. AFH-012 is credited once as the sole MCB-015 primary and is not also counted as valid-unregistered.

## Registered coverage

Each exact private class earns full points. The only reduced classes are signed fixed-point rounding at 1.5/5 and advanced critical composition at 4.8/8. Literal, overlapping truth-metadata rollups are:

| Rollup | Unit recall | Points | Weighted coverage |
| --- | ---: | ---: | ---: |
| Business logic (MCB-008, MCB-010) | 2/2 | 15/15 | 100% |
| Composed (MCB-015) | 1/1 | 4.8/8 | 60% |
| Cross-contract (MCB-001, MCB-009) | 2/2 | 14/14 | 100% |
| Integration (MCB-003, MCB-004) | 2/2 | 12/12 | 100% |
| Niche edge/signed math (MCB-004, MCB-006) | 2/2 | 6.5/10 | 65% |
| Access control (MCB-001) | 1/1 | 7/7 | 100% |
| Reentrancy (MCB-002) | 1/1 | 5/5 | 100% |

The complete 15-class table and one-primary accounting are in `score.json` and `MATCH_MATRIX.md`.

## Candidate precision and unregistered defects

Empirical candidate precision is defined as unique primary matches plus genuinely distinct valid-unregistered claims, divided by reportable distinct candidate claims after supporting/duplicate consolidation. It is **(15 + 10) / 25 = 100%**.

Raw submission precision is defined before consolidation as submitted candidates that are not false positives divided by all submitted candidates. It is **25/25 = 100%**. There are no supporting/duplicate candidates to remove and no false positives.

The valid-unregistered candidates are AFH-003, AFH-015, AFH-016, AFH-017, AFH-019, AFH-020, AFH-022, AFH-023, AFH-024, and AFH-025. AFH-017 and AFH-019 use registered AFH-018 as a dependency but contain distinct omitted roots; AFH-018's primitive is not recounted in their precision numerator.

## Severity and critical-chain result

Claim-scope severity agrees for **20/25 (80%)** candidates. The five scope mismatches are AFH-001 Low→High, AFH-008 Low→Medium, AFH-010 Medium→High, AFH-014 Medium→High, and AFH-017 Critical→High. Primary-label alignment against canonical truth is **10/15 (66.67%)**; this additionally counts AFH-012's Medium fragment as not matching the canonical Critical composition label.

The registered Critical chain, MCB-015, is **not complete** and receives factor 0.6 only. The submission's unrelated Critical claim, AFH-017, is a real but High-severity unregistered composition: a fresh ledger control ended with 81.8 wad pending social loss, 1 base residual, -81.8 wad bidder equity, zero attacker token profit, and zero insurance-token delta. Thus there is no adjudicated Critical candidate.

Severity does not alter any truth-unit weight or evidence factor.

## Verification and integrity

Frozen inputs matched before truth use: plaintext commitment `fcf3d39…ff66e`, consensus `ba5d60af…2696`, submission `c5330151…9ef`, source aggregate `bd7aacd7…5381`, and reveal aggregate `dc808f47…b03c`.

Fresh terminal results:

- hidden reproductions **15/15** and patched controls **15/15**;
- ordinary tests **5/5**;
- all candidate IDs **25/25**, comprising **26/26** underlying executions;
- factor discrimination **2/2** and severity-cap control **1/1**;
- source manifest **31/31**, public compile **15 inputs / 25 artifacts**, seal verifier pass, and reveal verifier pass;
- frozen consensus checker pass in an exact clean `d07b5ed` clone.

The in-place historical consensus checker correctly rejected the later `scoring/scorer-a` directory under its original consensus-only porcelain rule; that diagnostic is retained. Its byte/content checks were then rerun successfully in the clean frozen clone. Scorer artifacts are confined to `benchmarks/perps-blind-generalization/scoring/scorer-a/`; no frozen target, submission, review, consensus, or reveal file was modified.

`check-score.mjs` independently validates unit/candidate coverage, allowed factors/classes, arithmetic, uniqueness, metric denominators, evidence references, frozen hashes/aggregates, output hashes, and path scope.
