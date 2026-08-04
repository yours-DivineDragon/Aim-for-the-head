# C-010 — Permit signature replays across router instances

Target: commit `75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d`, manifest `9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926`.

## Claim and locations

The transfer type and payload omit both verifier address and chain ID (`contracts/PermitRouter.sol:10-11`, `26-28`). Nonces are stored independently by each router (`13`, `26`). A payload valid at nonce zero on one instance is therefore valid at nonce zero on every other instance using the same owner/token/amount/deadline.

## Attacker, prerequisites, and sequence

An owner has approved two legitimate router instances for 25 aUSD each and signs one 25-token transfer intended for router A. A permissionless relayer submits the same signature, same recipient, and same action first to A and then B. Both see nonce zero and recover the owner; no recipient redirection (C-003), key compromise, or malicious token is used.

## Impact and severity

One 25-token authorization pays 50 tokens and consumes nonce one separately in both routers. **Severity: High (unreviewed)** because multi-instance/redeployment approvals turn one authorization into repeated transfers up to each allowance. The submitted claim is the demonstrated same-chain instance replay; cross-chain replay is not overclaimed.

## Reproduction

- Command: `bash run/evidence/C-010/reproduce.sh`; discovery and separate reproduction exit 0.
- Positive log records two distinct router addresses, authorized `25e18`, received `50e18`, nonce one in each.
- Negative comparator binds `address(this)` and `block.chainid`; A succeeds, replay on B rejects, recipient receives only `25e18`, B nonce remains zero.
- Clean optimized target, ordinary approvals, in-memory cleanup.

| Gate | Evidence | Status |
| --- | --- | --- |
| Attacker control / reachability | relayer submits valid signature to approved public router instances | pass |
| Defense / impact | missing verifier domain; doubled transfer | pass |
| Realistic + safe/release reproduction | two unmodified instances and standard ERC-20 approvals | pass |
| Negative control | domain-bound comparator | pass |
| Independent reproduction | `reproduction.log` | pass |

