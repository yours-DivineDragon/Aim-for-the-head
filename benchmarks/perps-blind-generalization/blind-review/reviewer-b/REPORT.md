# Independent blind review B

## Outcome

At frozen target `158651792f770f5e827c1f0c363ea91f916cb1b8` and frozen hunter submission `31ea4b7367a42fb1d87d486e945e54361a8d0ca3`, this review classifies the 25 submitted candidates as **22 confirmed_exact** and **3 confirmed_narrowed**. No submission was classified `duplicate_of`, `unsupported`, or `invalid`.

Proposed severities are 0 Critical, 14 High, 8 Medium, and 3 Low. Two hunter severity labels are reduced: AFH-011 from High to Medium because propagation requires manual trusted reporting and terminates at an unapplied loss index, and AFH-017 from Critical to High because its joined execution creates an uncapitalized recorded loss but no attacker profit, token outflow, or applied social-loss charge.

The machine-readable record is `review.json`. It contains the complete per-ID facts, root-cause and impact boundaries, exact commands, evidence hashes, overlap group, composition membership, confidence, severity, and rationale.

## Review method and integrity

The review began from the public source, specification, invariants, threat surface, and frozen submission artifacts. It did not use ground truth. The sealed private bundle was not decrypted or inspected.

The source manifest hash was `86e7f928cf5b5dc05e18a1339a7e36156c38994f0baed09c4b2b92331d045090`; its 31-entry aggregate recomputed to `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381`. Frozen submission, hunter report, and hunter inventory hashes were respectively `c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef`, `9830b56785cdbcf41cd9bde3421c562bc4e7ba811cf3bc6e1a6627506484ce04`, and `bc5df4c5259421f8ae403de49bbff65662db649a1d95d27f6ce6014ad0e5f7fe`. They remained unchanged through final execution.

Every supplied candidate reproduction and its embedded negative control ran in a fresh Node/Ganache process: the initial batch passed 26/26 processes for 25/25 IDs because AFH-002 supplied two component variants, and the final batch passed the same 26/26 again (52 cumulative candidate processes). The ordinary suite passed 5/5 initially and 5/5 at final rerun. Nine independent tests passed 9/9 initially and 9/9 at final rerun; they discriminated insurance-deposit receipt accounting, cutoff-price PnL, funding-to-cash propagation, correlation-margin admission, OI reporting boundaries, the AFH-017 final ledger, AFH-019 post-finalization deficit drift, bond-slash NAV accounting, and a reviewer-discovered rounding issue. Manifest and public seal verification passed at final rerun. A clean local copy of the frozen hunter submission checker passed all of its checks; an earlier in-place run is retained as a tool-failure log because concurrent review artifacts correctly violated that checker's hunter-only path assumption.

## Per-candidate decisions

| ID | Verdict | Proposed severity | Independent boundary |
| --- | --- | --- | --- |
| AFH-001 | confirmed_exact | Low | Any caller changed risk tier 2→7; no current value consumer. |
| AFH-002 | confirmed_exact | High | Nominal receipt accounting left a 100-wad vault/bond shortfall; the insurance variant transferred 50 native units from an incumbent shareholder. |
| AFH-003 | confirmed_exact | High | A frozen unhealthy account extracted 900 tokens through the delayed route while the guarded route reverted. |
| AFH-004 | confirmed_exact | Medium | One live 100-wad request transferred and debited 200 wad through callback reuse. |
| AFH-005 | confirmed_exact | Medium | A configured 19-decimal feed bricked `_read`; the 18-decimal control was exact. |
| AFH-006 | confirmed_exact | High | Delayed recording selected 3000 over cutoff 2100 and shifted realized PnL by 900 wad. |
| AFH-007 | confirmed_exact | High | Negative funding exceeded the symmetric cap by orders of magnitude and reached account cash. |
| AFH-008 | confirmed_exact | Low | Split checkpoints paid zero versus one wei unsplit; no profitable amplification. |
| AFH-009 | confirmed_exact | High | Settlement zeroed base before funding and omitted the final 1.5–2 wad debit. |
| AFH-010 | confirmed_exact | Medium | Cross-zero residual basis was 2500 instead of 2000, understating round-trip loss by 500 wad. |
| AFH-011 | confirmed_narrowed | Medium | OI source and loss-denominator divergence are real, but propagation is manual and `socialLossIndex` has no position consumer. |
| AFH-012 | confirmed_exact | Medium | Close/reopen duplicated market membership and one 1000-wad PnL term. |
| AFH-013 | confirmed_exact | High | Wrong correlation quadrant charged 200 instead of 600 and admitted a 300-equity account below correct initial margin. |
| AFH-014 | confirmed_exact | Medium | Arithmetic mean 2000 passed while required base-weighted mean 2800 exceeded the 2200 limit. |
| AFH-015 | confirmed_exact | Low | Nonces 0 and 65536 collided; the consequence is order liveness, not replay. |
| AFH-016 | confirmed_exact | High | A bidder forced +1 base into an unrelated non-delegating victim account. |
| AFH-017 | confirmed_narrowed | High | The joined zero-capital chain recorded 81.8–84 wad pending loss with live residual, but attacker and fund token deltas were both zero. |
| AFH-018 | confirmed_exact | High | Timeout finalization left all 1 base live, cleared the freeze, and ran deficit resolution without a backstop. |
| AFH-019 | confirmed_exact | High | A post-finalization reveal increased deficit by 16 wad without repeating the recorded 700-wad loss snapshot. |
| AFH-020 | confirmed_exact | High | Settlement marked the account settled/base-zero, then an auction reveal reopened it at −1 base. |
| AFH-021 | confirmed_narrowed | Medium | Slash left 50 wad phantom reserve and double-counted 50 liquid wad in NAV; the reservation itself gates coverage, not redemption. |
| AFH-022 | confirmed_exact | High | A shareholder redeemed a third party's 1000-token live bond and made terminal return/slash revert. |
| AFH-023 | confirmed_exact | Medium | A 120-wad fee created no token receipt, raised NAV to 1120, and blocked full redemption. |
| AFH-024 | confirmed_exact | High | Rebalance lost input, received zero output, and credited a raw 24-decimal return as wad. |
| AFH-025 | confirmed_exact | High | An extreme signed-order price stored truncated basis while charging 408.338840305126156158 wad versus a two-wei control. |

## Business semantics and composition

The strongest conservation failures are AFH-002 (credit exceeds inbound assets), AFH-022 (shareholders consume bidder-owned reserves), AFH-023 (fee receivable has no collection path), and AFH-024 (venue return is neither received nor normalized). AFH-021 is adjacent but distinct: resolving a slashed bond both strands aggregate reserve and double-counts liquid slash value.

Signed funding and PnL defects remain distinct. AFH-007 corrupts global signed accrual, AFH-008 loses checkpoint remainder, AFH-009 changes lifecycle ordering, and AFH-010 corrupts cross-zero basis. AFH-012 affects list membership and repeats downstream consumers rather than position mutation itself. AFH-013 is a separate sign-composition failure in portfolio covariance.

The auction/settlement group contains no exact duplicates. AFH-016 is an account-authority failure. AFH-018 is the residual-closure primitive. AFH-019 is post-terminal execution. AFH-020 is a two-lifecycle freeze/settlement contradiction and does not actually need AFH-019's finalized state, despite the submitted dependency label. AFH-017 is a genuine single-state composed chain: zero/unrelated bond sizing plus missing bidder health admits an undercapitalized lot, an adverse move makes it negative, and AFH-018 records loss while retaining exposure. The join is executable, but its final ledger supports High rather than Critical.

No duplicate groups were assigned. Overlap groups are recorded only to prevent shared components from being mistaken for identical roots: withdrawal (AFH-003/004), funding (AFH-007/008/009), position ledger (AFH-010/011/012), auction lifecycle (AFH-016–020), and insurance (AFH-021–024).

## Reviewer-discovered issue

RD-001 is separate from all hunter submissions. With six-decimal collateral, an authorized one-wad withdrawal debited one wad while `_fromWad` transferred zero native token units. This is a confirmed Low correctness/dust-loss issue; no adversarial third-party impact or severity escalation was found.

## Residual limits

The review validates the public target behavior, not private benchmark truth. AFH-011's social-loss index has no application consumer in this target, and AFH-017's recorded loss does not itself transfer assets or profit to the bidder. External integrations were evaluated only against the documented interfaces, public mocks, and explicit threat assumptions. Human severity review remains appropriate before any disclosure.
