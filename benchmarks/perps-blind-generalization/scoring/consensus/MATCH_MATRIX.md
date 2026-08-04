# Final match matrix

Every one of the 15 registered truth IDs and 25 frozen AFH IDs appears exactly once. A primary candidate is used for no more than one truth unit. Valid-unregistered findings are empirical-precision evidence only and add no registered points.

## Registered truth units

| Truth | Class | Canonical severity | Weight | Primary | Factor | Points | Outcome | Adjudication |
| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- |
| MCB-001 | access-control/cross-contract-risk | high | 7 | AFH-001 | 1 | 7 | exact | Exact missing-governor callable mutation, untrusted transaction, and persistent tier change; conservative Low consensus severity does not change match credit. |
| MCB-002 | reentrancy/state-observation | medium | 5 | AFH-004 | 1 | 5 | exact | Exact transfer-before-effects ordering with callback-visible/live request reuse and doubled transfer/debit; CEI control matches the registered repair. |
| MCB-003 | external-token-semantics/accounting | high | 7 | AFH-002 | 1 | 7 | exact | Exact requested-versus-received accounting: 1,000 nominal credits against 900 received, with downstream shortfall and exact-delta control. |
| MCB-004 | oracle-integration/edge-case | medium | 5 | AFH-005 | 1 | 5 | exact | Exact greater-than-18 feed normalization underflow with a valid high-precision feed and an 18-decimal control. |
| MCB-005 | funding/economic-math | high | 7 | AFH-007 | 1 | 7 | exact | Exact missing negative funding clamp, signed magnitude beyond the symmetric bound, cash relevance, and positive-direction control. |
| MCB-006 | signed-fixed-point/rounding | medium | 5 | — | 0 | 0 | missed | Missed. AFH-008 uses a positive product and checkpoint remainder loss. It survives signed-floor repair; the reciprocal positive-ceil repair leaves the registered negative product wrong. |
| MCB-007 | portfolio-margin/nonlinear-risk | high | 7 | AFH-013 | 1 | 7 | exact | Exact correlation/exposure sign-parity error with quantified under-margining and a genuine-hedge control. |
| MCB-008 | position-accounting/business-logic | high | 8 | AFH-010 | 1 | 8 | exact | Exact cross-zero residual-basis error, separated closed-leg PnL, both prices, and round-trip consequence. |
| MCB-009 | cross-contract/open-interest-accounting | high | 7 | AFH-011 | 1 | 7 | exact | Exact abs(delta)-only open-interest growth, zero-exposure round trip, and distinct social-loss denominator effect. |
| MCB-010 | execution/business-logic | high | 7 | AFH-014 | 1 | 7 | exact | Exact arithmetic 2,000 versus size-weighted 2,800 execution price against a 2,200 limit and rejecting control. |
| MCB-011 | settlement/oracle-time-semantics | high | 7 | AFH-006 | 1 | 7 | exact | Exact post-cutoff latest-round selection with cutoff/update/record times, immutable later value, and no-update control. |
| MCB-012 | settlement/funding-state-order | high | 7 | AFH-009 | 1 | 7 | exact | Exact realize-before-funding ordering tied to zeroed base and lost payment, with checkpoint-first control. |
| MCB-013 | liquidation/state-machine | high | 8 | AFH-018 | 1 | 8 | exact | Exact no-fill timeout finalization with live residual, unchanged distressed position, and cleared freeze. |
| MCB-014 | insurance/reserve-accounting | medium | 5 | AFH-021 | 1 | 5 | exact | Exact 100/50/50 bond reconciliation showing deleted record and 50 phantom reserve, plus deficit-capacity control. |
| MCB-015 | advanced-composition/critical-economic | critical | 8 | AFH-012 | 0.3 | 2.4 | fragment_0.3 | Fragment only. AFH-012 proves missing membership uniqueness and duplicate valuation through close/reopen, but not repeated zero-size setup, withdrawal, normalization, or deficit. The nearby primitive is capped at 0.3 by the registered composition gate. |

## Frozen candidates

| Candidate | Classification | Truth | Factor | Dedup cluster | Validation |
| --- | --- | --- | ---: | --- | --- |
| AFH-001 | primary_matched | MCB-001 | 1 | CL-AFH-001 | Registered primary; see truth matrix. |
| AFH-002 | primary_matched | MCB-003 | 1 | CL-AFH-002 | Registered primary; see truth matrix. |
| AFH-003 | valid_unregistered | — | 0 | CL-AFH-003 | A frozen unhealthy account transfers 900 collateral while the ClearingHouse withdrawal control reverts. |
| AFH-004 | primary_matched | MCB-002 | 1 | CL-AFH-004 | Registered primary; see truth matrix. |
| AFH-005 | primary_matched | MCB-004 | 1 | CL-AFH-005 | Registered primary; see truth matrix. |
| AFH-006 | primary_matched | MCB-011 | 1 | CL-AFH-006 | Registered primary; see truth matrix. |
| AFH-007 | primary_matched | MCB-005 | 1 | CL-AFH-007 | Registered primary; see truth matrix. |
| AFH-008 | valid_unregistered | — | 0 | CL-AFH-008 | Ten split checkpoints pay zero versus one wei unsplit, including under the MCB-006 signed-floor patch. |
| AFH-009 | primary_matched | MCB-012 | 1 | CL-AFH-009 | Registered primary; see truth matrix. |
| AFH-010 | primary_matched | MCB-008 | 1 | CL-AFH-010 | Registered primary; see truth matrix. |
| AFH-011 | primary_matched | MCB-009 | 1 | CL-AFH-011 | Registered primary; see truth matrix. |
| AFH-012 | primary_matched | MCB-015 | 0.3 | CL-AFH-012 | Registered primary; see truth matrix. |
| AFH-013 | primary_matched | MCB-007 | 1 | CL-AFH-013 | Registered primary; see truth matrix. |
| AFH-014 | primary_matched | MCB-010 | 1 | CL-AFH-014 | Registered primary; see truth matrix. |
| AFH-015 | valid_unregistered | — | 0 | CL-AFH-015 | Nonce 0 and 65,536 collide; adjacent nonce 1 remains independent. |
| AFH-016 | valid_unregistered | — | 0 | CL-AFH-016 | An attacker forces +1 base into an unrelated account while the ordinary router authority control reverts. |
| AFH-017 | valid_unregistered | — | 0 | CL-AFH-017 | Zero-capital fill ends at -81.8 wad bidder equity and 81.8 pending social loss; severity is High because attacker-profit closure was not shown. |
| AFH-018 | primary_matched | MCB-013 | 1 | CL-AFH-018 | Registered primary; see truth matrix. |
| AFH-019 | valid_unregistered | — | 0 | CL-AFH-019 | A precommitted reveal changes base after finalization while a new post-finalization commit is rejected. |
| AFH-020 | valid_unregistered | — | 0 | CL-AFH-020 | Settlement clears freeze and a later reveal reopens base while the settled marker remains true. |
| AFH-021 | primary_matched | MCB-014 | 1 | CL-AFH-021 | Registered primary; see truth matrix. |
| AFH-022 | valid_unregistered | — | 0 | CL-AFH-022 | A shareholder redeems 2,000 against a 1,000 deposit plus 1,000 live bond, causing the bond terminal action to revert. |
| AFH-023 | valid_unregistered | — | 0 | CL-AFH-023 | NAV rises by 120 while fund tokens do not move and full redemption fails; no-fee control redeems. |
| AFH-024 | valid_unregistered | — | 0 | CL-AFH-024 | Zero output receipt with a 24-decimal token credits 1e18 wad although even a received raw return would normalize to 1e12. |
| AFH-025 | valid_unregistered | — | 0 | CL-AFH-025 | 2^128+2e18 stores a 2e18 basis but burns 408.338840305126156158 wad; in-range control burns two wei. |

The two semantic boundaries are decisive: AFH-008 survives MCB-006's signed-floor repair, and AFH-012 survives MCB-015's zero-size control. MCB-015 receives 0.3 only because the exact registered zero-size-to-withdrawal-to-deficit chain was not submitted.
