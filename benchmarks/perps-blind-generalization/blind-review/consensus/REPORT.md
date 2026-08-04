# Blind consensus adjudication

## Outcome

All 25 AFH candidates received a final verdict against target revision
`158651792f770f5e827c1f0c363ea91f916cb1b8`. The consensus is **22
`confirmed_exact` and 3 `confirmed_narrowed`**, with final severities **14 High,
8 Medium, 3 Low, and 0 Critical**. Confidence is High for every verdict. No
candidate is a duplicate, unsupported, or invalid.

This adjudication used only the frozen public target, hunter submission, two
review artifacts, and fresh local evidence. It did not open, decrypt, inspect,
or draw conclusions from private truth. It does not infer or predict hidden
truth units or score.

## Frozen inputs and integrity

| Input | Required SHA-256 | Result |
| --- | --- | --- |
| Hunter `submission.json` | `c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef` | exact match |
| Reviewer A `review.json` | `41bc03cc09b9ac715134a7ff580ba7a77ad92b86617aafb035feece548b15de2` | exact match |
| Reviewer B `review.json` | `1dc57d5a89c4ab71b5e22d2885abcc30ea363c6cc4754d068e53fcfedf775607` | exact match |
| Target manifest aggregate | `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381` | exact match |

The target manifest's 31 entries were rehashed from the working source and
matched the frozen target. The public ciphertext seal verifier passed without
decryption. `input-hashes.sha256`, `HASHES.sha256`, and `check-consensus.mjs`
make these checks repeatable.

## Execution summary

Every AFH candidate was rerun through `run-case.mjs --verify-only` in fresh
process/state. AFH-002 invokes two independent target tests, so the terminal
candidate pass comprised 27 fresh target-test processes across 26 runner
attempts. Ten adjudicator controls ran in ten more fresh processes, for **37
fresh target-test processes** total.

One terminal AFH-011 attempt reverted before its oracle and is preserved as
`logs/rerun-AFH-011-attempt-1.log`; a second fresh attempt passed and is the
referenced positive reproduction. This is treated as a preserved Ganache
transaction-estimation/harness flake, not negative evidence about the
candidate. The complete terminal sequence and its raw failure and success logs
are retained here.

The deterministic agreement guard sample was fixed in `run-consensus.mjs` as
AFH-001, AFH-003, AFH-007, AFH-008, AFH-010, and AFH-013. It spans Low, Medium,
and High severity plus authorization, withdrawal, funding, position-ledger, and
portfolio-risk flows. All six passed. The remaining two non-disagreement
candidates were also rerun because the terminal pass covered all 25.

## Candidate matrix

| ID | Hunter | Reviewer A | Reviewer B | Final | Overlap | Dependency |
| --- | --- | --- | --- | --- | --- | --- |
| AFH-001 | Low | exact / Low | exact / Low | exact / Low | — | — |
| AFH-002 | High | exact / High | exact / High | exact / High | — | — |
| AFH-003 | High | exact / High | exact / High | exact / High | withdrawal | — |
| AFH-004 | Medium | exact / Medium | exact / Medium | exact / Medium | withdrawal | — |
| AFH-005 | Medium | exact / Medium | exact / Medium | exact / Medium | — | — |
| AFH-006 | High | exact / High | exact / High | exact / High | — | — |
| AFH-007 | High | exact / High | exact / High | exact / High | funding | — |
| AFH-008 | Low | exact / Low | exact / Low | exact / Low | funding | — |
| AFH-009 | High | exact / High | exact / High | exact / High | funding | — |
| AFH-010 | Medium | exact / Medium | exact / Medium | exact / Medium | position ledger | — |
| AFH-011 | High | narrowed / Medium | narrowed / Medium | **narrowed / Medium** | position ledger | no named candidate |
| AFH-012 | Medium | exact / Medium | exact / Medium | exact / Medium | position ledger | — |
| AFH-013 | High | exact / High | exact / High | exact / High | — | — |
| AFH-014 | Medium | exact / Medium | exact / Medium | exact / Medium | — | — |
| AFH-015 | Low | exact / Low | exact / Low | exact / Low | — | — |
| AFH-016 | High | exact / High | exact / High | exact / High | auction lifecycle | — |
| AFH-017 | Critical | narrowed / High | narrowed / High | **narrowed / High** | auction lifecycle | AFH-018 |
| AFH-018 | High | exact / High | exact / High | exact / High | auction lifecycle | base primitive |
| AFH-019 | High | exact / High | exact / High | exact / High | auction lifecycle | AFH-018 |
| AFH-020 | High | exact / High | exact / High | exact / High | auction lifecycle | — |
| AFH-021 | Medium | exact / Medium | narrowed / Medium | **narrowed / Medium** | insurance | — |
| AFH-022 | High | exact / High | exact / High | exact / High | insurance | — |
| AFH-023 | Medium | exact / Medium | exact / Medium | exact / Medium | insurance | — |
| AFH-024 | High | exact / High | exact / High | exact / High | insurance | — |
| AFH-025 | High | exact / High | exact / High | exact / High | — | — |

The full field-by-field objects—including roots, impact scopes, confidence,
reviewer overlap labels, composition text, final evidence hashes, and exact
rationales—are in `consensus.json`.

## Material disagreement resolution matrix

Seventeen candidates had a material difference in hunter/reviewer accounting or
between reviewers. There were 26 disputed fields. All were rerun and resolved;
none remains open.

| ID | Disputed field(s) | Resolution |
| --- | --- | --- |
| AFH-002 | composition | One balance-delta root at three sinks; a consolidated multi-sink finding, not a composed chain. |
| AFH-004 | dependency | Standalone callback reuse reproduced without ClearingHouse, freeze, or ill health; AFH-003 only amplifies impact. |
| AFH-005 | overlap | Precision normalization and cutoff-round selection have different triggers and fixes; no overlap with AFH-006. |
| AFH-006 | overlap | Caller-timed settlement is distinct from AFH-005's feed-precision availability failure. |
| AFH-011 | severity, impact, dependency | Narrowed to Medium: stale OI changes loss buckets, but reporting is manual and the loss index has no collection consumer; AFH-017 is not specifically required. |
| AFH-014 | overlap | Weighted portfolio limit logic is distinct from nonce-domain truncation. |
| AFH-015 | overlap | Nonce bitmap collision is distinct from AFH-014 despite a shared router. |
| AFH-016 | overlap, membership | Standalone account-authority root; grouped only as an auction-flow neighbor, not a member of AFH-017. |
| AFH-017 | classification, severity, closure | Narrowed to High: the joined chain produced 81.8 wad pending loss and residual exposure but zero attacker token profit, zero fund-token delta, and a still-negative bidder. |
| AFH-018 | dependency accounting | Standalone residual-finalization root, counted once; dependency for AFH-017 and AFH-019 only. |
| AFH-019 | standalone vs dependency | Distinct missing reveal terminal checks, but executable post-final quantity depends on AFH-018 residual finalization. It is not counted as a standalone closed finding. |
| AFH-020 | dependency | Reproduced while `auction.finalized == false`; it does not require AFH-019's post-final reveal root. |
| AFH-021 | classification, impact, overlap | Narrowed to Medium: phantom reserve blocks deficit coverage, but redeem ignores the reserve; redemption failure is caused by separately double-counted slashed value in NAV. |
| AFH-022 | composition | Live-bond theft reproduced without a slash or AFH-021 state; standalone direct asset-ownership violation. |
| AFH-023 | overlap, composition | Standalone uncollectible-fee/NAV root; similar NAV shape does not merge it with AFH-024 or make AFH-025 a dependency. |
| AFH-024 | reproduction, overlap | An honest venue transferring 24-decimal output still bypassed the wad minimum, separating normalization from no-transfer behavior and from AFH-023. |
| AFH-025 | composition | Standalone signed-order price-domain split; its fee side effect can reach AFH-023 but neither root requires the other. |

## One-to-one, overlap, and composition accounting

All 25 candidates have distinct root-cause identities. There are no duplicate
targets and no duplicate groups. Overlap groups describe shared flows, not
merged findings:

- `OG-WITHDRAWAL`: AFH-003/004, independent health-gate and callback-order roots.
- `OG-FUNDING`: AFH-007/008/009, independent cap, rounding, and settlement-order roots.
- `OG-POSITION-LEDGER`: AFH-010/011/012, independent basis, aggregate-loss-routing, and membership roots.
- `OG-AUCTION-LIFECYCLE`: AFH-016–020, distinct authority/lifecycle roots.
- `OG-INSURANCE`: AFH-021–024, distinct reserve, ownership, receivable, and venue-semantic roots.

Only two candidate dependency edges survive adjudication:

1. AFH-017 → AFH-018 (`composition_dependency`). AFH-017's missing bidder
   bond/health primitive is distinct, while its demonstrated terminal loss uses
   AFH-018. AFH-018 is not counted again as a new root inside the chain.
2. AFH-019 → AFH-018 (`reachability_dependency`). AFH-019's missing
   terminal reveal checks are distinct, but the submitted post-final mutation
   needs residual quantity preserved by AFH-018.

AFH-020 does not depend on AFH-019, and AFH-022 does not depend on AFH-021.
AFH-002 is one finding consolidated across three sinks. AFH-023 and AFH-025 may
compose at the fee side effect, but each independently closes a different root
and impact; that possible join is not recounted.

## Final evidence and limitations

Every verdict contains the frozen hunter packet hash, successful fresh rerun
hash, all attempt hashes (including the preserved AFH-011 failure), applicable
adjudicator-control hashes, and the target aggregate. All High results have
executable closure; the sole submitted Critical was narrowed because its final
asset/profit ledger did not close at Critical scope.

This is an internal technical consensus over the public frozen target. It is
not an external disclosure or novelty determination. Reviewer-discovered issue
RD-001 is outside the 25 AFH verdict arithmetic and is not promoted or scored
here.
