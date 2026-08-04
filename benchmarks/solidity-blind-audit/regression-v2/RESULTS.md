# Workflow-v2 revealed regression result

## Outcome

On the unchanged Aster Credit target, workflow v2 produced 15 exact matches for
15 committed truth units, with zero false positives and zero duplicates. The
submission was frozen before post-run canonical validation; all 15 canonical
reproductions and all 15 patched controls then passed.

This is a **same-target revealed regression**. The truth was known when the
workflow was improved, so this result demonstrates closure of the diagnosed
failure modes on this target. It is not a blind score, novelty claim, or an
estimate of performance on unseen code. The original blind run remains the only
uncontaminated measurement.

## Before and after

| Metric | Blind baseline | Revealed regression v2 | Change |
| --- | ---: | ---: | ---: |
| Exact recall | 9/15 (60.00%) | 15/15 (100%) | +40.00 pp |
| Exact + partial credit | 10/15 (66.67%) | 15/15 (100%) | +33.33 pp |
| Severity-weighted recall | 41/62 (66.13%) | 62/62 (100%) | +33.87 pp |
| Unique/raw precision | 10/11 (90.91%) | 15/15 (100%) | +9.09 pp |
| False-positive rate | 0/11 (0%) | 0/15 (0%) | unchanged |
| Duplicate rate | 0/11 (0%) | 0/15 (0%) | unchanged |
| Severity calibration | 89.39% | 100% | +10.61 pp |
| Secondary rubric | 66/104 (63.46%) | 104/104 (100%) | +38 points |

Disposition changed from 9 exact, 2 partial, and 4 missed truth units to 15
exact, 0 partial, and 0 missed units. F-03 and F-04 moved from partial to exact;
F-01, F-06, F-07, and F-14 moved from missed to exact.

## Requested family comparison

| Family | Blind exact recall | Workflow-v2 exact recall | Rubric points before -> after |
| --- | ---: | ---: | ---: |
| Advanced composed exploit | 0/1 | 1/1 | 0/12 -> 12/12 |
| External protocol/integration | 2/4 | 4/4 | 14/28 -> 28/28 |
| Cross-contract bugs | 1/2 | 2/2 | 12/14 -> 14/14 |
| Reentrancy | 0/1 | 1/1 | 5/7 -> 7/7 |
| Access control | 2/2 | 2/2 | 12/14 -> 14/14 |
| Niche mistakes | 2/3 | 3/3 | 11/15 -> 15/15 |
| Extra signature failures | 2/2 | 2/2 | 12/14 -> 14/14 |

Access-control and extra-signature exact recall was already complete; the rubric
gain there comes from corrected severity calibration. Every family reaches full
exact and rubric credit in the revealed regression.

## What changed the result

| Baseline breakpoint | Workflow-v2 mechanism | Closed unit(s) |
| --- | --- | --- |
| Pool spot and vault donation were treated as separate candidates | primitive join graph plus funding/repayment/profit/system-loss ledger | F-01 |
| Vault donation stopped at deposit availability | mutable-value propagation through `convertToAssets` into lending capacity | F-03 |
| Callback testing tried nested borrowing only | callback/action matrix enumerated the sibling collateral-withdrawal edge | F-04 |
| Wrong rounding was dismissed under friendly 18-decimal fixtures | mandatory coarse-unit, non-1:1, zero/one boundary matrix | F-06 |
| Token fees were treated as nonconforming behavior | interface-promise/runtime-delta tests measured supported ABI-compatible balance differences | F-07, F-14 |
| A validated candidate could end a run without deep-search completion | terminal state now requires all mandatory deep passes with evidence | all six |

The strongest new oracle is the compound business-logic path: spot manipulation
alone leaves borrow capacity below the 100,050 flash repayment; the joined vault
rate raises capacity above 150,000. One atomic execution repays the lender,
leaves the attacker 49,950 stable, and reduces market reserves by 150,000.

## Precision boundary

The improvement does not relax evidence standards to obtain recall. Every unit
must pass attacker-control, reachability, defense, system-impact,
release-reproduction, negative-control, independent-reproduction,
downstream-impact, and composition-review gates. Fee-token claims require an
ABI-compatible semantic basis plus measured attacker gain or accounting loss.
The Critical compound claim requires one execution that closes principal, fee,
profit, and protocol loss. No generic interface warning or unjoined exploit
narrative is scored.

## Reproducibility

From `benchmarks/solidity-blind-audit`:

```sh
node regression-v2/scripts/verify-source-manifest.mjs
node regression-v2/scripts/run-regression.mjs
python3 ../../scripts/goal_state.py check \
  --dir regression-v2/goal-state --phase terminal
node regression-v2/scoring/run-post-reveal-suite.mjs
node regression-v2/scoring/build-results.mjs
node regression-v2/scoring/check-results.mjs
```

The regression runner records 13 passing commands: the 6/6 ordinary suite,
nine retained packets (18/18 positive/control tests), and two independent
12/12 deep runs. The post-reveal package passes 30/30. The calculation checker
passes 286 assertions, including all 31 sealed submission files, one-to-one
matching, arithmetic, source integrity, terminal state, and contamination
ordering.

## Durable artifact map

- `submission/REPORT.md` and `submission/candidates.json`: frozen pre-score
  candidate package.
- `submission/submission-seal.json`: per-file hashes and aggregate commitment.
- `goal-state/`: activated contract, 30 candidate revisions, 16 coverage
  records, and checked terminal state.
- `maps/`: eight mandatory target-specific deep-search artifacts.
- `evidence/`: ordinary, retained, deep, independent, manifest, execution, and
  state-recording logs.
- `scoring/results.json` and `scoring/comparison.json`: machine-readable result
  and deltas.
- `scoring/check-results.mjs`: deterministic independent calculation checker.

The goal-state persistence anomaly and exact transcript-based repair are
preserved in `evidence/goal-state-persistence-note.md`; the repaired state passes
the helper and is covered by the regenerated submission seal.

## Research conclusion

The intervention closes every failure mode that motivated it while preserving
the zero-false-positive boundary on this fixed instance. That is strong
regression evidence, but it is deliberately not the final research claim. The
next valid boundary test is a new sealed benchmark whose truth and construction
are unknown to the hunter.
