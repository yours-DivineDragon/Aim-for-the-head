# Independent blind review A

Outcome: all 25 submitted candidates have a supported, distinct root-cause statement at some scope. I confirm 23 exactly and confirm 2 with narrower impact/severity. No candidate is an exact duplicate, unsupported, or invalid. Proposed severities are 0 Critical, 14 High, 8 Medium, and 3 Low.

The two narrowed results are AFH-011 (High → Medium) and AFH-017 (Critical → High). AFH-011 reaches a real open-interest and loss-bucket divergence, but neither divergent bucket has a current consumer that closes a different asset or claimant delta. AFH-017 executes a zero-bond, below-margin lot transfer and residual-deficit chain, but its Critical label lacks attacker token profit or another executable consumer of repeatedly recorded uncovered loss. Both remain valid business-logic findings.

## Machine verdict summary

| ID | Verdict | Submitted → proposed severity | Confidence | Overlap/composition scope |
| --- | --- | --- | --- | --- |
| AFH-001 | confirmed_exact | Low → Low | High | authorization-config |
| AFH-002 | confirmed_exact | High → High | High | one receipt-delta root across three inbound sinks |
| AFH-003 | confirmed_exact | High → High | High | withdrawal-state-machine |
| AFH-004 | confirmed_exact | Medium → Medium | High | distinct callback root; compatible with AFH-003 |
| AFH-005 | confirmed_exact | Medium → Medium | High | oracle precision semantics |
| AFH-006 | confirmed_exact | High → High | High | cutoff-time oracle semantics |
| AFH-007 | confirmed_exact | High → High | High | funding accounting; reviewer closed collateral unlock |
| AFH-008 | confirmed_exact | Low → Low | High | funding rounding |
| AFH-009 | confirmed_exact | High → High | High | settlement/funding ordering |
| AFH-010 | confirmed_exact | Medium → Medium | High | position basis accounting |
| AFH-011 | confirmed_narrowed | High → Medium | High | OI/loss-bucket accounting; no current bucket consumer |
| AFH-012 | confirmed_exact | Medium → Medium | High | position membership/equity accounting |
| AFH-013 | confirmed_exact | High → High | High | portfolio-risk sign quadrant |
| AFH-014 | confirmed_exact | Medium → Medium | High | execution price protection |
| AFH-015 | confirmed_exact | Low → Low | High | nonce availability only |
| AFH-016 | confirmed_exact | High → High | High | auction bidder authority |
| AFH-017 | confirmed_narrowed | Critical → High | High | composition member AFH-018; no Critical closure |
| AFH-018 | confirmed_exact | High → High | High | base residual-finalization primitive |
| AFH-019 | confirmed_exact | High → High | High | distinct terminal-state check; depends on AFH-018 state |
| AFH-020 | confirmed_exact | High → High | High | one-process AFH-019/shared-freeze composition |
| AFH-021 | confirmed_exact | Medium → Medium | High | insurance reserve reconciliation |
| AFH-022 | confirmed_exact | High → High | High | direct live-bond theft via shares |
| AFH-023 | confirmed_exact | Medium → Medium | High | uncollectible fee NAV |
| AFH-024 | confirmed_exact | High → High | High | venue receipt/normalization; honest-effect control added |
| AFH-025 | confirmed_exact | High → High | High | execution cast boundary; fee side effect overlaps AFH-023 |

`review.json` is the canonical machine record. For every ID it contains the frozen input title/root cause, verdict, proposed severity, confidence, independent facts, exact reproduction and control, evidence/output/source hashes, impact scope, overlap group, composition membership, and rationale.

## Distinctness and composition accounting

There are no `duplicate_of` verdicts. Similar candidates have different enforcement points and distinguishing controls. The important non-double-counting boundaries are:

- AFH-017 retains the missing bidder-health/bond closure and names AFH-018 as its residual-finalization member. AFH-018 is not a second Critical escalation inside AFH-017.
- AFH-019 is a distinct missing `finalized` guard, but a meaningful late reveal after terminal resolution requires AFH-018's residual-finalization state.
- AFH-020 is an executed composition of stale reveal authority with the single shared freeze boolean; it is not evidence that either primitive independently has a second impact.
- AFH-004 is separate reentrancy, but it does not raise AFH-003's maximum withdrawal beyond a separately authorizable full account balance.
- AFH-021's phantom aggregate reserve is distinct from AFH-022's direct consumption of a still-live per-bond reserve.

## Reproduction and discriminating controls

The final recorded sweep started every candidate through `node blind-run/run-case.mjs AFH-NNN --verify-only`, which starts an isolated Node test process and deterministic Ganache chain. All 25 candidates passed; AFH-002 executes two sinks, so the sweep contains 26 positive executions and 26 embedded controls. The ordinary suite passed 5/5.

Five reviewer-authored discriminating tests also passed:

- RA-002 proved the previously unexercised insurance-deposit occurrence: 900 wad received minted 1000 shares.
- RA-003 stabilized the frozen-account withdrawal proof with explicit gas headroom and observed 900 native units leave.
- RA-007 separated the global mark writer from a funded long: excess negative-funding credit exceeded the symmetric credit bound by more than 8000× and unlocked 40 collateral tokens.
- RA-017 showed that unchanged negative equity can be recorded again after residual finalization, doubling pending loss from 81.8 to 163.6 without a new price/equity delta. This supports the root while not creating a current Critical asset consumer.
- RA-024 used a venue that actually transferred 1e18 units of a 24-decimal output. The correct normalized value was 1e12 wad, yet the 1e18-wad minimum passed.

## Integrity

Target revision `158651792f770f5e827c1f0c363ea91f916cb1b8` and submission revision `31ea4b7367a42fb1d87d486e945e54361a8d0ca3` were fixed throughout. Before and after execution:

- all 31 source-manifest entries verified with aggregate `bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381`;
- the public ciphertext seal verified;
- all 52 frozen hunter-inventory files and root hashes verified;
- the frozen submission hash remained `c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef`;
- the frozen hunter report hash remained `9830b56785cdbcf41cd9bde3421c562bc4e7ba811cf3bc6e1a6627506484ce04`;
- the evidence-chain hash remained `1c96a917a08627ab325002cd3cbc07d7458235d725813103195eaf94133cae81`;
- tracked source, public tests, specification, manifest, and blind-run artifacts had no diff from frozen HEAD.

## Process concerns and limitations

The supplied AFH-003 and AFH-011 paths intermittently consumed an exact client gas estimate at `MockPriceFeed.setAnswer` and reverted before emitting an oracle. Fresh-process retries passed, and RA-003 with explicit gas headroom passed, so these are preserved as harness flakes rather than candidate contradictions. Raw failed and passing runs remain in the execution logs.

Once reviewer work areas existed, the hunter checker passed every substantive frozen-submission check but failed its hunter-only git-scope rule because review artifacts are intentionally outside `blind-run`. One diagnostic printed unrelated reviewer path names. Reviewer A did not open those files, inspect their contents, or communicate with another reviewer.

No sealed/private ground truth, decryption material, prior Solidity benchmark, or other reviewer work product was used. No target or frozen submission file was modified. No patched target was created; controls either changed the claimed condition or used a safe runtime comparator. Full line/branch coverage and formal proof were unavailable.
