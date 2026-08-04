# Independent blind reproduction report — Reviewer B

Target commit: `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`  
Source digest: `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`

## Attestation

The 22 manifest-covered files were independently hashed before reproduction and again at the end. Every individual hash and the newline-terminated combined digest matched. The ordinary `npm run check` suite exited 0 after compiling 21 contracts and passing all 6 tests.

Each candidate's submitted `reproduce.sh` ran in its own process. Every harness ran a positive case and a fresh-chain negative/comparator case; all 22 submitted tests passed. No network, Git history, sealed or ground-truth material, other reviewer workspace, issue tracker, rejected-lead narrative, or human assistance was used. The ordinary suite's generated artifacts were relocated to `review-output/ordinary-suite-artifacts`; reviewer-authored files are likewise confined to `review-output`.

## Results

| Candidate | Status | Scope | Severity | Reproduction assessment |
|---|---|---|---|---|
| C-001 | reproduced | in scope | critical | Stale debt is observed during receiver reentrancy. Submitted double-borrow passed; an added 8-level check drained all 6,000e18 market liquidity against a 750e18 limit. |
| C-002 | reproduced | in scope | critical | Messenger and source-chain gates hold, but remote application identity is not checked. A mismatching remote minted credit and enabled borrowing. |
| C-003 | reproduced | in scope | high | Recipient is absent from the signed payload. A valid 25e18 permit was redirected in full; changing a signed amount was rejected. |
| C-004 | reproduced | in scope | high | Raw signature bytes are the replay key while high-s and v aliases are accepted. The submitted test paid twice; an added check found four accepted encodings and paid 4×. |
| C-005 | reproduced | in scope | high | `initialize` never checks `initialized` or caller authority. An arbitrary account replaced both roles and swept all held tokens. System-wide critical exposure is not modeled. |
| C-006 | reproduced | in scope | high | The guardian conditional permits every non-guardian increase. The attacker raised LTV from 75% to 95% and borrowed 949e18 versus the prior 750e18 limit; the loan remained below contemporaneous marked collateral value. |
| C-007 | reproduced | in scope | medium | One chain's nonce blocks the same numeric nonce on another; a chain-scoped comparator accepted both. Local credit denial is shown, but remote nonce control and permanent source-side stranding are not modeled. |
| C-008 | reproduced | in scope | high | During a nonpositive primary answer, a permissionless pool trade raised spot to about 3.994 and supported about 14,955e18 debt versus a one-dollar limit of about 3,744e18. Feed outage and material swap capital are prerequisites. |
| C-009 | reproduced | in scope | high | A 31,536,001-second-old positive answer remained authoritative and supported 1,500e18 debt versus a 750e18 pool-based comparator. A freshness-bound comparator rejected it. |
| C-010 | reproduced | in scope | medium | The verifier address and chain are unsigned. One permit executed on two routers for 50e18 total; an added boundary check confirmed a separate approval and aligned nonce are required on the second router. |
| C-011 | reproduced | in scope | low | A one-share seed plus recoverable donation made the victim deposit round to zero and revert. The victim lost no assets; the impact is capital-backed availability griefing. |

Aggregate: 11 reproduced, 0 not reproduced, 0 inconclusive, 0 out of scope. Severity distribution: 2 critical, 6 high, 2 medium, 1 low.

## Duplicate analysis

No duplicate clusters were identified. The superficially related pairs require different remediation and have different impact/prerequisites:

- C-002 vs. C-007: remote-sender authentication vs. source-chain nonce-domain separation.
- C-003 vs. C-010: recipient binding vs. verifier/chain domain binding.
- C-008 vs. C-009: manipulation-resistant fallback pricing vs. primary-feed freshness validation.

## Added checks and execution notes

The reviewer boundary suite covers C-001 recursion scale, C-002 gate boundaries, C-004 equivalent raw signature encodings, and C-010 second-router approval requirements. Its first run exited 1 before any test executed because the reviewer-authored Solidity used an incompatible ternary literal type. Only that added harness was corrected; the frozen target was unchanged. The corrected run passed all 4 checks.

Ganache consistently warned that its native uWS binary did not match the Node ABI and fell back to its NodeJS implementation. This affected performance only; the ordinary suite, all submitted reproductions, and the corrected reviewer suite exited 0.

Raw command outputs are under `logs/`. The machine-readable record in `reviewer-b.json` contains per-candidate commands, exit outcomes, controls, root-cause and prerequisite assessments, demonstrated impact, scope, severity rationale, and unavailable metrics.
