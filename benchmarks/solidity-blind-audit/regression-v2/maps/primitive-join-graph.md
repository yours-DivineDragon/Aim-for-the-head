# Primitive join graph

## Supported primitive nodes

- P1: shallow-pool quote swap controls the fallback spot price.
- P2: direct underlying transfer controls the vault share exchange rate.
- P3: market multiplies share assets by oracle price and collateral factor.
- P4: temporary quote funding supplies 100,000 stable and requires 100,050 back.
- P5: borrow transfers stable from a 1,000,000-unit market reserve.
- P6: callback occurs before debt commitment.
- P7: collateral withdrawal checks the pre-commit debt value.
- P8: token transfer success can differ from receiver balance delta.

## Join adjudication

| Join | Compatibility | Discriminating execution | Final status |
| --- | --- | --- | --- |
| P1 -> P3 | same transaction; fallback feed required | spot-only limit remains below flash repayment | valid High primitive, insufficient for compound closure alone |
| P2 -> P3 | donation changes already-posted share value | existing borrow limit rises ~1.91x | valid Medium integration finding |
| P1 + P2 -> P3 -> P5 -> P4 repayment | shared actor, assets, block, and market | 150,000 borrow; 100,050 repaid; 49,950 retained | valid Critical composed finding |
| P6 -> P7 | callback receiver is borrower and calls sibling entry point | all shares exit before debt update | valid High cross-function finding |
| P8 -> vault deposit accounting | fee recipient is depositor | positive cycle with incumbent loss | valid High integration finding |
| P8 -> market repayment accounting | nominal amount clears debt | reserve receives only 90% | valid High integration finding |

## Rejected/closed joins

- P1 + P2 is blocked when the primary feed returns a durable positive price;
  the exact compound transaction reverts and leaves no debt or profit.
- A direct transfer outside the vault does not alter collateral value.
- Empty callback data does not expose the collateral-withdraw interleaving.
- Standard exact-delta tokens do not create deposit profit or repayment deficit.

This graph is the workflow-v2 remedy for independently finding P1 and P2 but
failing to test their multiplicative consumer join.
