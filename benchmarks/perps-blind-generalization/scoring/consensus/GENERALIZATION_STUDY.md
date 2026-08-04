# Aim blind-generalization study

## Three stages, three different claims

The prior benchmark was read only after the Meridian reveal and scoring inputs were frozen. These stages must not be collapsed into one trend line:

| Stage | Target and validity | Registered result | Precision / FP |
| --- | --- | --- | --- |
| Original blind baseline | Aster Credit; uncontaminated blind result | 9 exact, 2 partial claims, 4 missed / 15; official credited recall 10/15 | 10/11 unique precision; 0 FP |
| Same-target workflow-v2 regression | Aster Credit again; truth-informed and memorization-contaminated | 15/15 exact, 100% | 15/15; 0 FP |
| This blind generalization | Entirely unseen Meridian Clearing target through blind consensus | 13 exact, one 0.3 fragment, one miss; 89.4/100 | 25/25 empirical raw and dedup precision; 0 FP; 11 valid-unregistered |

The v2 result proves that the revised workflow closed known Aster failure modes on Aster. Only the unseen Meridian result measures transfer. It is strong but not perfect: broad exact discovery transferred; exact signed-direction and critical-chain closure did not.

## What genuinely generalized

### Access and reentrancy

Access control is exact (MCB-001, 7/7). Reentrancy is exact (MCB-002, 5/5), and the submitted callback proof is stronger than stale observation alone because it demonstrates double transfer/debit. This supports transfer of the cross-function/external-callback review discipline that was introduced after the baseline's partial callback coverage.

Severity did not transfer as well as detection: AFH-001 was Low against canonical High because the frozen review found no current `riskTier` consumer. That is a scope-calibration disagreement, not a root-cause miss.

### Integration semantics

Integration is the cleanest transfer: **4/4 exact, 24/24**. The hunter measured nominal versus received collateral (MCB-003), high-decimal oracle normalization (MCB-004), cutoff versus recording time (MCB-011), and callback transfer ordering (MCB-002). This directly reflects the v2 semantic-delta and consumer-propagation interventions rather than target memorization.

AFH-023 and AFH-024 extend that pattern beyond the registered rubric: the hunter found uncollected fee NAV and a venue output that was neither received nor normalized. These are real open-world discoveries, but they remain separate from registered recall.

### Cross-contract and business logic

Cross-contract raw recall is **5/5**, with four exact units and the MCB-015 fragment; weighted credit is 30.4/36. Exact units connect unauthorized configuration, open interest to insurance loss allocation, oracle time to settlement, and funding order to position mutation. This is good evidence that mutable-value propagation and call-order modeling generalized.

Business logic reaches 9 exact plus one fragment across 11 tagged units. Position flips, open interest, weighted portfolio slippage, settlement timing/order, liquidation residuals, insurance reserves, nonlinear correlation, and asymmetric funding caps are all exact. The extra auction and lifecycle findings—AFH-016, AFH-017, AFH-019, AFH-020, and AFH-022—show unusually broad state-machine exploration.

## What did not generalize

### Signed arithmetic direction

Niche coverage is only **1/2 (5/10)**. The hunter found a nearby positive checkpoint-splitting defect (AFH-008) but missed MCB-006's negative-product floor requirement. The reciprocal repair test is the key diagnostic: the workflow recognized “rounding plus repetition” but did not partition the obligation by sign and prove each payer/payee direction independently. This is a semantic boundary failure, not a lack of arithmetic activity.

### Exact critical composition

Composition receives **2.4/8**. AFH-012 discovered missing membership uniqueness and duplicate equity/risk consumption, yet stopped at close/reopen and doubled PnL. It did not materialize memberships with zero-size calls, withdraw collateral against the inflated health result, normalize the price, or measure the deficit. The v2 workflow's composition machinery therefore generalized to primitive discovery but not to the exact registered chain and economic closure.

AFH-017 reinforces the distinction. It is a genuine different auction composition, but fresh evidence supports High, not Critical: it creates social loss without demonstrating attacker-profit closure. Finding a different composed flaw cannot substitute for the preregistered critical route.

### Severity calibration

Registered severity accuracy is **9/14 (64.29%)**, below both earlier stages. Four exact High units were labeled Low/Medium, and the MCB-015 fragment was Medium against a canonical Critical chain. The result suggests that the hunter often stops at the strongest locally reproduced effect, while canonical severity sometimes reflects a downstream protocol consequence or the complete chain that was not shown. Detection and severity should therefore be analyzed separately.

## Generator truth completeness

Eleven of 25 submitted candidates are executable, distinct, specification-supported defects outside the 15 registered units. They cover delayed withdrawal health, nonce-domain aliasing, bidder authority/health, auction/settlement finality, reserve ownership, unbacked fee NAV, venue receipt normalization, and signed-order price width.

That is evidence of high discovery breadth and an incomplete generator rubric. It is not a reason to inflate recall: the preregistered denominator and factor gates stay frozen. Future benchmark reports should publish two parallel axes—closed-world registered recall and open-world independently validated discovery—so generator omissions are visible without retroactively changing the score.

## Evidence-backed next research recommendations

These recommendations are for a future unseen target; they do not modify Aim or tune/rerun it on Meridian.

1. **Partition signed arithmetic by obligation direction.** For every signed quotient, execute positive-product remainder, negative-product remainder, exact division, split/unsplit repetition, and reciprocal repairs. MCB-006/AFH-008 proves that one rounding test can mask the opposite defect.

2. **Require a chain-identity ledger before composition credit.** Record every registered/claimed chain's root primitives, exact preconditions, transaction order, intermediate state, extraction/withdrawal, normalization/cleanup, final system loss, and distinguishing repair. AFH-012 would then be classified early as a primitive-only result instead of a near-complete composition.

3. **Separate primitive closure from impact closure in terminal coverage.** “Duplicate equity demonstrated” must not close the downstream consumers “withdrawal passes” and “deficit remains.” Consumer edges should require their own executed oracle, even when a view-layer distortion is already exact.

4. **Retain semantic-delta and lifecycle matrices.** Their transfer is supported by 4/4 integration exactness and the five extra auction/lifecycle defects. Focus future efficiency work on preserving this strength while reducing redundant variants, not weakening gates.

5. **Add bidirectional repair discrimination to match review.** A candidate should share registered credit only if the canonical repair blocks it and its distinguishing repair addresses the registered case, absent an explicit rubric exception. This prevents same-line/same-label overmatching.

6. **Calibrate severity from a reproduced consumer graph.** Report local severity and strongest demonstrated system severity separately, then reconcile with canonical scope. The MCB-001 and MCB-008/009/010 gaps show that correct roots can still be under-scoped.

7. **Audit generator coverage against its own public invariants before sealing.** Several unregistered findings directly correspond to invariants 15, 16, 19, and 21. An independent generator-side mapping from every promised invariant to either a registered defect, patched-safe behavior, or explicit negative control would expose rubric holes without revealing answers to the hunter.

8. **Keep open-world findings out of recall but in benchmark quality metrics.** Track distinct validated extras, their spec basis, and whether a generator repair would add a unit or a safe control. Here, 11 extras are too large to treat as incidental even though the correct registered score remains 89.4.

## Conclusion

Workflow v2's 100% same-target regression was not merely cosmetic: on unseen perps code, access, reentrancy, integration semantics, consumer propagation, and broad state-machine/business-logic discovery transferred strongly. The remaining failures are sharply defined—signed-direction completeness, exact economic-chain closure, and severity scope. The unseen result therefore supports meaningful generalization, but not the claim of universal 15/15 recall implied by the contaminated regression.
