# Scorer B match matrix

The matrix applies the preregistered factors directly to the registered weights. A primary candidate is used by at most one truth unit; extra manifestations inside that candidate receive no additional credit.

| Truth | Canonical mechanism | Primary AFH | Factor | Points | Boundary decision |
|---|---|---:|---:|---:|---|
| MCB-001 | Unguarded `setRiskTier` | AFH-001 | 1.0 | 7.0/7 | Exact callable, authority, state delta, and control; severity disagreement does not alter weight. |
| MCB-002 | Withdrawal callback sees/reuses pre-finalization state | AFH-004 | 1.0 | 5.0/5 | Exact external-call ordering and executable callback with a single-use-request control. |
| MCB-003 | Nominal rather than received collateral credit | AFH-002 | 1.0 | 7.0/7 | Exact 1,000 nominal / 900 receipt / 1,000 credit and victim shortfall; other affected sinks are not recounted. |
| MCB-004 | Feed precision above 18 underflows normalization | AFH-005 | 1.0 | 5.0/5 | Exact high-precision direction, valid feed, revert, and 18-decimal control. |
| MCB-005 | Negative funding rate lacks symmetric cap | AFH-007 | 1.0 | 7.0/7 | Exact signed bound, elapsed-time comparison, cash consumer, and positive-cap control. |
| MCB-006 | Negative-product signed division must floor | — | 0 | 0/5 | Missed. AFH-008 is positive-product checkpoint remainder loss and survives the canonical signed-floor repair. |
| MCB-007 | Wrong correlation/direction sign parity | AFH-013 | 1.0 | 7.0/7 | Exact negative-correlation/opposite-exposure risk undercharge with sign-aware control. |
| MCB-008 | Cross-zero residual keeps averaged old basis | AFH-010 | 1.0 | 8.0/8 | Exact closed-leg versus residual-leg distinction and quantified round-trip PnL. |
| MCB-009 | OI adds `abs(delta)` and never falls | AFH-011 | 1.0 | 7.0/7 | Exact round-trip OI divergence and downstream loss-bucket relevance; manual propagation narrows severity only. |
| MCB-010 | Portfolio limit uses unweighted mean | AFH-014 | 1.0 | 7.0/7 | Exact arithmetic 2,000 versus weighted 2,800 against a 2,200 limit and one-leg control. |
| MCB-011 | Settlement selects caller-time latest round | AFH-006 | 1.0 | 7.0/7 | Exact cutoff/update/recording sequence, immutable 3,000 versus 2,100 value, and no-update control. |
| MCB-012 | Settlement zeroes base before funding | AFH-009 | 1.0 | 7.0/7 | Exact callback order, base mutation, omitted two-wad payment, and checkpoint-first control. |
| MCB-013 | Timeout finalizes/unfreezes a residual lot | AFH-018 | 1.0 | 8.0/8 | Exact no-fill timeout, residual, unchanged base, unfreeze, and full-fill control. |
| MCB-014 | Slash decrements reserve by return only | AFH-021 | 1.0 | 5.0/5 | Exact bond/return/slash/deletion/reserve reconciliation; extra NAV theory is not separately credited. |
| MCB-015 | Zero-size membership amplification → withdrawal → deficit | AFH-012 | 0.3 | 2.4/8 | Shared missing-uniqueness primitive and duplicated valuation only. Close/reopen PoC omits zero-size setup, withdrawal, normalization, and deficit, and survives the registered zero-size control. |

Totals: 13 exact, zero 0.6, one 0.3, one missed; 89.4/100 points. Raw unit recall is 14/15; factor-normalized recall is 13.3/15.

## Candidate classification matrix

| AFH | Class | Truth | Empirical disposition |
|---|---|---|---|
| AFH-001 | primary_matched | MCB-001 | Exact registered access-control root. |
| AFH-002 | primary_matched | MCB-003 | Exact registered inbound receipt-accounting root. |
| AFH-003 | valid_unregistered | — | Delayed-withdrawal health/freeze bypass; distinct root and control. |
| AFH-004 | primary_matched | MCB-002 | Exact registered callback-order root. |
| AFH-005 | primary_matched | MCB-004 | Exact registered precision root. |
| AFH-006 | primary_matched | MCB-011 | Exact registered cutoff-round semantic root. |
| AFH-007 | primary_matched | MCB-005 | Exact registered signed-cap root. |
| AFH-008 | valid_unregistered | — | Positive-product checkpoint-splitting/remainder-loss defect; canonical MCB-006 repair does not fix it. |
| AFH-009 | primary_matched | MCB-012 | Exact registered settlement/funding-order root. |
| AFH-010 | primary_matched | MCB-008 | Exact registered cross-zero basis root. |
| AFH-011 | primary_matched | MCB-009 | Exact registered OI root; final consensus severity Medium. |
| AFH-012 | primary_matched | MCB-015 | Registered critical-chain fragment at 0.3; no separate credit for its close/reopen manifestation. |
| AFH-013 | primary_matched | MCB-007 | Exact registered risk sign-parity root. |
| AFH-014 | primary_matched | MCB-010 | Exact registered weighted-price root. |
| AFH-015 | valid_unregistered | — | Nonce bitmap high-bit aliasing; distinct root and nearby-bit control. |
| AFH-016 | valid_unregistered | — | Bidder-account authorization failure; ordinary-router authority control. |
| AFH-017 | valid_unregistered | — | Bidder health/bond-floor plus timeout chain; High after critical-closure control. |
| AFH-018 | primary_matched | MCB-013 | Exact registered timeout/residual root; dependency use is not recounted. |
| AFH-019 | valid_unregistered | — | Reveal lacks finalized/expiry guard; post-terminal position mutation. |
| AFH-020 | valid_unregistered | — | Cross-lifecycle freeze collision reopens a settled account. |
| AFH-021 | primary_matched | MCB-014 | Exact registered slash/reserve root. |
| AFH-022 | valid_unregistered | — | Insurance shareholders can redeem live third-party bonds. |
| AFH-023 | valid_unregistered | — | Uncollected trade fees inflate InsuranceFund NAV. |
| AFH-024 | valid_unregistered | — | Venue return lacks receipt measurement and output normalization. |
| AFH-025 | valid_unregistered | — | Full-width execution price narrows basis while full width feeds fee math. |

Every candidate has its own root-cause cluster (`CL-AFH-NNN`). There are no supporting/duplicate candidates and no false positives.
