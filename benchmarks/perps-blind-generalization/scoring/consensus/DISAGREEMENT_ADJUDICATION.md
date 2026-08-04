# Final disagreement adjudication

## Frozen inputs

The adjudication is against scorer commit `a3ba6036d5c7b7902f775fd80ef4a6eccdf7c63f`. The exact commitments are:

- canonical truth plaintext: `fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e`;
- blind consensus: `ba5d60af575433b6f730ca1e59b961a00dedfda67da416b25c3ea6370e3b2696`;
- Scorer A score: `01035f9e76c4707bba4912fda4dc99777e414b41025eb0d52bb668b719fbb98f`;
- Scorer B score: `756e9984b7168567b971a6c73ae1c23910ce3a04b7ba59d302cfaafb4d059aa9`;
- hunter submission: `c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef`;
- source/reveal aggregates: `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381` / `dc808f47d8fc293a7f811d4f3b24622ad27387d9d7b95d5b2d692ee06430b03c`.

Both scorer files are internally arithmetically consistent with their factor choices. The final result is not an average: each differing match and metric definition is resolved from the preregistered evidence gate and fresh controls.

## Material scorer differences

| Issue | Scorer A | Scorer B | Final | Reason |
| --- | --- | --- | --- | --- |
| MCB-006 / AFH-008 | 0.3 registered fragment | MCB-006 miss; AFH-008 unregistered | **0; AFH-008 unregistered** | Opposite signed domains and reciprocal non-fixing repairs prove different defects. Same line and broad “rounding” label are insufficient. |
| MCB-015 / AFH-012 | 0.6 | 0.3 | **0.3** | Only the membership/valuation primitive overlaps. The exact zero-size→withdrawal→normalization→deficit chain is absent. Composition-nearby evidence is capped at 0.3. |
| Registered disposition | 13 exact, one 0.6, one 0.3, no miss | 13 exact, one 0.3, one miss | **13 / 0 / 1 / 1** | Consequence of the two semantic rulings. |
| Score | 93.3 | 89.4 | **89.4** | Exact arithmetic: 87 exact points + 2.4 MCB-015 fragment. |
| Valid-unregistered | 10 | 11 | **11** | AFH-008 moves outside the registered match set. |
| Raw registered recall | 15/15 | 14/15 | **14/15** | Nonzero-factor units only; MCB-006 is missed. |
| Severity denominator | A reports claim-scope 20/25 and truth-label 10/15 | 9/14 registered credited primaries | **9/14** | The requested registered severity metric uses canonical versus frozen consensus severity and excludes misses. |
| Broad class rollups | A's `coverageRollups` use narrower hand-selected groups | B uses overlapping research tags | **Explicit overlapping tags plus all 15 canonical classes** | `final-score.json` defines every numerator, denominator, factor sum, and weight; no label silently changes the scored population. |

The scorers agree on the other 13 truth factors, all their primaries, their severity inputs, and zero false positives. No other truth-unit factor, registered primary, or candidate duplication dispute remains.

## MCB-006 first-principles discrimination

Registered MCB-006 has the precondition `base × growthDelta < 0` with remainder. Solidity truncation toward zero incorrectly returns zero; signed floor returns `-1`. AFH-008 has `base × growthDelta > 0`, repeatedly advances the checkpoint, and discards positive sub-wad payer obligations. Its safe repair carries remainder or rounds that positive obligation payer-conservatively.

The fresh matrix proves both one-way failures:

| Build | Negative product | Positive product |
| --- | ---: | ---: |
| Vulnerable | 0 | 0 |
| MCB-006 signed-floor repair | -1 | 0 |
| AFH-008 positive-ceil control | 0 | 1 |

The full AFH-008 split-versus-unsplit PoC also passes on the signed-floor patched build. Root cause at the required semantic granularity, preconditions, obligation direction, and distinguishing repair differ. The registered downstream claim specifically concerns negative obligations; the submitted evidence does not enter that state. There is therefore no meaningful registered fragment beyond a generic same-line rounding observation, which the evidence gate does not credit.

## MCB-015 factor and chain boundary

The registered unit is not “duplicate membership” in isolation. It preregisters a three-primitive route and an exact economic closure:

1. zero-size executions are accepted;
2. each zero-base execution appends non-unique membership and valuation treats duplicates as legs;
3. favorable unrealized PnL is amplified, collateral is withdrawn through health, price normalizes, and a position-backed deficit remains.

The fresh vulnerable run demonstrates all steps numerically: five pre-open memberships, 24,994 wad inflated equity, a successful 9,000-wad withdrawal, then -29,006 wad equity. The registered zero-size patch rejects the first step and leaves zero memberships.

AFH-012 reaches duplicate membership through open→close→reopen. On the registered patched build it still creates two entries and duplicates exactly 1,000 wad of PnL. This proves a real shared primitive, but also proves different setup preconditions. Its frozen evidence stops at doubled equity and makes no withdrawal or deficit measurement. Because the task requires the exact end-to-end chain and caps nearby primitives at 0.3, 0.6 would improperly grant substantial composition credit without the registered composition. The final factor is 0.3.

AFH-017 is not substituted for MCB-015. It is a different auction chain involving zero bonds, absent bidder health, and residual finalization. It is valid-unregistered and High after consensus narrowing, but does not share MCB-015's root, preconditions, repair, or state sequence.

## Valid-unregistered audit

All candidates that either scorer called valid-unregistered were rerun and compared with all registered units. None is an intended semantic or harness artifact:

| Candidate | Distinct defect and control boundary |
| --- | --- |
| AFH-003 | Delayed claim bypasses health/freeze without callback; ClearingHouse withdrawal rejects. Not MCB-002 CEI ordering. |
| AFH-008 | Positive checkpoint remainder loss; survives MCB-006 floor repair. |
| AFH-015 | Full uint64 nonce word aliases after uint8 narrowing; nonce 1 controls independently. |
| AFH-016 | Unbound bidder account authority; ordinary router rejects the same unrelated actor. |
| AFH-017 | Zero bond plus absent bidder health; depends on but does not duplicate MCB-013 residual finalization. |
| AFH-019 | Reveal after terminal finalization; distinct from permission to finalize a residual in MCB-013. |
| AFH-020 | Shared freeze reason and stale cross-lifecycle transition reopen a settled account. |
| AFH-022 | Shareholder redemption consumes a live correctly recorded reserve; distinct from MCB-014's slash-release decrement. |
| AFH-023 | Fee NAV is booked without token collection; no-fee redemption control succeeds. |
| AFH-024 | Venue output return is neither received nor decimal-normalized; raw-minimum control and zero receipt distinguish it. |
| AFH-025 | Unbounded signed-order price is narrowed for basis but full-width for fees; in-range price controls. |

These roots map directly to documented invariants 4, 7, 15, 16–22 and the declared matcher/auction/integration trust model. Each has a unique repair and dedup cluster. Their existence is evidence of an incomplete generator rubric, not evidence that the hunter found MCB-006 or completed MCB-015.

## Final arithmetic

The 13 exact units carry 87 points. MCB-006 contributes `5 × 0 = 0`; MCB-015 contributes `8 × 0.3 = 2.4`. Total: **89.4/100**. Factor sum is `13 + 0.3 = 13.3`, so factor-normalized recall is **88.67%**; 14 units have nonzero credit, so raw recall is **93.33%**.
